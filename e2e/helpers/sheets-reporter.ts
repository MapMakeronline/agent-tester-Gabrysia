import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

interface TestEntry {
  code: string;
  name: string;
  kategoria: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  finishedAtDisplay: string;
  resultText: string;
  error?: string;
  source: 'playwright-coded';
  duration: number;
  allSteps?: string[];
}

interface WebhookResult {
  code: string;
  status: string;
  resultText: string;
  finishedAt: string;
  finishedAtDisplay: string;
  source: 'playwright-coded';
}

const TC_ID_REGEX = /^(TC-\w+-\d+)/;

const AGENT_ROOT = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'agents',
  'tester',
);

const TESTS_DATA_PATH = path.join(AGENT_ROOT, 'monitor', 'tests-data.js');

// Intermediate JSON for run-hybrid.js to consume
const PW_RESULTS_PATH = path.join(AGENT_ROOT, 'data', 'pw-coded-results.json');

const STOP_SIGNAL_PATH = path.join(AGENT_ROOT, 'monitor', 'stop-signal.txt');

const QUEUE_PATH = path.join(AGENT_ROOT, 'data', 'tests-queue.json');

const WEBHOOK_CONFIG_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'agents',
  'tester',
  'config',
  'webhook-config.json',
);

function formatDateTime(d: Date): string {
  return d.toISOString().slice(0, 19);
}

function formatDateTimeDisplay(d: Date): string {
  return d.toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function mapStatus(result: TestResult, testCase: TestCase): string {
  if (testCase.expectedStatus === 'skipped') return 'skipped';
  switch (result.status) {
    case 'passed':
      return 'passed';
    case 'failed':
    case 'timedOut':
      return 'failed';
    case 'skipped':
      return 'skipped';
    case 'interrupted':
      return 'blocked';
    default:
      return 'failed';
  }
}

/** Send a single GET request to Google Apps Script (follows redirects). */
function appsScriptGet(fullUrl: string): Promise<{ success: boolean; data?: string }> {
  return new Promise((resolve) => {
    function doGet(getUrl: string, redirectsLeft: number) {
      const parsedUrl = new URL(getUrl);
      const req = https.request({
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) { resolve({ success: false }); return; }
          res.resume();
          doGet(res.headers.location, redirectsLeft - 1);
          return;
        }
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve({ success: !!response.success, data });
          } catch {
            resolve({ success: res.statusCode === 200, data });
          }
        });
      });
      req.on('error', () => resolve({ success: false }));
      req.setTimeout(15000, () => { req.destroy(); resolve({ success: false }); });
      req.end();
    }
    doGet(fullUrl, 3);
  });
}

/** Update one cell via Apps Script: action=updateTest&row=N&column=X&value=Y */
function updateCell(baseUrl: string, row: number, column: string, value: string): Promise<boolean> {
  const params = new URLSearchParams({ action: 'updateTest', row: String(row), column, value });
  return appsScriptGet(`${baseUrl}?${params.toString()}`).then((r) => r.success);
}

/**
 * Send test results to Google Sheets.
 * Uses the same updateTest API as save-test-result.js:
 *   Column G = status, Column H = result text, Column I = date/time
 */
async function sendWebhookResults(webhookUrl: string, results: WebhookResult[], rowMap: Record<string, number>): Promise<boolean> {
  let successCount = 0;
  for (const result of results) {
    const row = rowMap[result.code];
    if (!row) {
      console.log(`[sheets-reporter] No row mapping for ${result.code} - skipping`);
      continue;
    }
    const prefix = `[Coded] `;
    const okG = await updateCell(webhookUrl, row, 'G', result.status);
    const okH = await updateCell(webhookUrl, row, 'H', prefix + result.resultText);
    const okI = await updateCell(webhookUrl, row, 'I', result.finishedAtDisplay);
    if (okG && okH && okI) successCount++;
    else console.log(`[sheets-reporter] Partial update for ${result.code} (G:${okG} H:${okH} I:${okI})`);
  }
  if (successCount > 0) {
    console.log(`[sheets-reporter] Updated ${successCount}/${results.length} results in Google Sheet`);
  }
  return successCount > 0;
}

const MAX_WEBHOOK_RETRIES = 3;

async function sendToWebhook(results: WebhookResult[], rowMap: Record<string, number>): Promise<boolean> {
  let webhookConfig: { enabled: boolean; webhookUrl: string };
  try {
    webhookConfig = JSON.parse(fs.readFileSync(WEBHOOK_CONFIG_PATH, 'utf8'));
  } catch {
    console.log('[sheets-reporter] No webhook config found - skipping sheet update');
    return false;
  }

  if (!webhookConfig.enabled || !webhookConfig.webhookUrl) {
    console.log('[sheets-reporter] Webhook disabled - skipping sheet update');
    return false;
  }

  for (let attempt = 1; attempt <= MAX_WEBHOOK_RETRIES; attempt++) {
    const ok = await sendWebhookResults(webhookConfig.webhookUrl, results, rowMap);
    if (ok) return true;

    if (attempt < MAX_WEBHOOK_RETRIES) {
      const delayMs = 2000 * attempt; // 2s, 4s backoff
      console.log(`[sheets-reporter] Webhook retry ${attempt}/${MAX_WEBHOOK_RETRIES} in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  console.log(`[sheets-reporter] Webhook failed after ${MAX_WEBHOOK_RETRIES} attempts`);
  return false;
}

class SheetsReporter implements Reporter {
  private tests: TestEntry[] = [];
  private existingTests: TestEntry[] = [];
  private stepsMap: Record<string, string[]> = {};
  private rowMap: Record<string, number> = {};
  private startTime: Date = new Date();
  private totalTests: number = 0;
  private globalTotal: number = 0;
  private currentTestName: string = '';

  onBegin(_config: FullConfig, suite: Suite): void {
    this.startTime = new Date();
    this.tests = [];
    this.totalTests = suite.allTests().length;

    // Load real steps and global total from tests-queue.json
    try {
      const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
      for (const t of queue.tests || []) {
        if (t.id && t.steps) this.stepsMap[t.id] = t.steps;
        if (t.id && t.row) this.rowMap[t.id] = t.row;
      }
      this.globalTotal = (queue.tests || []).length;
      console.log(`[sheets-reporter] Loaded steps for ${Object.keys(this.stepsMap).length} tests from queue (total: ${this.globalTotal})`);
    } catch {
      console.log('[sheets-reporter] No tests-queue.json found - steps will be empty');
    }

    // Load existing tests from tests-data.js to preserve previous results
    try {
      const content = fs.readFileSync(TESTS_DATA_PATH, 'utf8');
      const match = content.match(/var testData = (\{[\s\S]*\});/);
      if (match) {
        const data = JSON.parse(match[1]);
        this.existingTests = data.tests || [];
        // Preserve original total from init-session.js (e.g. 182)
        if (data.summary?.total > this.globalTotal) {
          this.globalTotal = data.summary.total;
        }
        console.log(`[sheets-reporter] Loaded ${this.existingTests.length} existing test results (globalTotal: ${this.globalTotal})`);
      }
    } catch {
      this.existingTests = [];
    }

    console.log('[sheets-reporter] Test run started');
  }

  onTestBegin(testCase: TestCase): void {
    // Check stop signal before each test
    try {
      if (fs.existsSync(STOP_SIGNAL_PATH)) {
        const content = fs.readFileSync(STOP_SIGNAL_PATH, 'utf8');
        if (content.includes('STOP')) {
          console.log('[sheets-reporter] STOP signal detected - requesting graceful shutdown');
          process.kill(process.pid, 'SIGINT');
          return;
        }
      }
    } catch {
      // ignore
    }

    const titleMatch = testCase.title.match(TC_ID_REGEX);
    if (!titleMatch) return;
    this.currentTestName = `${titleMatch[1]}: ${testCase.title.replace(TC_ID_REGEX, '').replace(/^:\s*/, '').trim()}`;
    this.writeLiveUpdate();
  }

  onTestEnd(testCase: TestCase, result: TestResult): void {
    const titleMatch = testCase.title.match(TC_ID_REGEX);
    if (!titleMatch) return; // skip tests without TC-ID

    const tcId = titleMatch[1];
    const status = mapStatus(result, testCase);

    // Skip recording tests that are intentionally skipped (stubs)
    if (status === 'skipped') return;

    const startedAt = new Date(result.startTime);
    const finishedAt = new Date(result.startTime.getTime() + result.duration);

    let resultText: string;
    if (status === 'passed') {
      resultText = 'Test zaliczony (Playwright coded)';
    } else if (status === 'failed') {
      const errorMsg = result.errors?.[0]?.message || 'Unknown error';
      // Trim to reasonable length
      resultText = `FAIL: ${errorMsg.substring(0, 300)}`;
    } else {
      resultText = `Status: ${status}`;
    }

    // Extract category from describe block title
    const kategoria = testCase.parent?.title || '';

    this.tests.push({
      code: tcId,
      name: testCase.title.replace(TC_ID_REGEX, '').replace(/^:\s*/, '').trim(),
      kategoria,
      status: status.toLowerCase(),
      startedAt: formatDateTime(startedAt),
      finishedAt: formatDateTime(finishedAt),
      finishedAtDisplay: formatDateTimeDisplay(finishedAt),
      resultText,
      error: status === 'failed' ? resultText : undefined,
      source: 'playwright-coded',
      duration: result.duration,
      allSteps: this.stepsMap[tcId] || [],
    });

    // Live update tests-data.js after each test so monitor shows progress
    this.writeLiveUpdate();
  }

  private getMergedTests(): TestEntry[] {
    const currentCodes = new Set(this.tests.map((t) => t.code));
    return [
      ...this.existingTests.filter((t) => !currentCodes.has(t.code)),
      ...this.tests,
    ];
  }

  private writeLiveUpdate(): void {
    try {
      const now = new Date();
      const merged = this.getMergedTests();
      const passed = merged.filter((t) => t.status === 'passed').length;
      const failed = merged.filter((t) => t.status === 'failed').length;
      const blocked = merged.filter((t) => t.status === 'blocked').length;
      const done = merged.length;
      const elapsed = Math.floor((now.getTime() - this.startTime.getTime()) / 1000);
      const elapsedStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;

      const total = Math.max(this.globalTotal, done);
      const pending = total - done;

      const monitorData = {
        lastUpdate: formatDateTime(now),
        agentStatus: {
          isRunning: true,
          currentAction: `Wykonano ${done}/${total} testów (${elapsedStr}) | ${passed} passed, ${failed} failed`,
          lastAction: null,
          finished: false,
          startedAt: formatDateTime(this.startTime),
          finishedAt: null,
        },
        summary: {
          total,
          passed,
          failed,
          blocked,
          inProgress: 1,
          pending,
        },
        currentTest: this.currentTestName ? {
          code: this.currentTestName.split(':')[0]?.trim() || '',
          name: this.currentTestName.split(':').slice(1).join(':').trim() || this.currentTestName,
        } : null,
        tests: merged,
      };

      const dir = path.dirname(TESTS_DATA_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const content = `// Auto-generated by Playwright sheets-reporter\nvar testData = ${JSON.stringify(monitorData, null, 2)};\n`;
      fs.writeFileSync(TESTS_DATA_PATH, content, 'utf8');
    } catch {
      // Ignore write errors during live updates
    }
  }

  async onEnd(_result: FullResult): Promise<void> {
    const endTime = new Date();
    const passed = this.tests.filter((t) => t.status === 'passed').length;
    const failed = this.tests.filter((t) => t.status === 'failed').length;
    const blocked = this.tests.filter((t) => t.status === 'blocked').length;

    console.log(
      `[sheets-reporter] Run finished: ${passed} passed, ${failed} failed, ${blocked} blocked (${this.tests.length} total with TC-ID)`,
    );

    // 1. Write pw-coded-results.json FIRST (critical for run-hybrid.js pipeline)
    try {
      const resultsDir = path.dirname(PW_RESULTS_PATH);
      if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
      fs.writeFileSync(
        PW_RESULTS_PATH,
        JSON.stringify({
          generatedAt: formatDateTime(endTime),
          source: 'sheets-reporter',
          tests: this.tests,
        }, null, 2),
        'utf8',
      );
      console.log(`[sheets-reporter] Wrote ${this.tests.length} results to pw-coded-results.json`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`[sheets-reporter] Failed to write pw-coded-results.json: ${msg}`);
    }

    // 2. Write tests-data.js for dashboard (also serves as fallback)
    const merged = this.getMergedTests();
    const mergedPassed = merged.filter((t) => t.status === 'passed').length;
    const mergedFailed = merged.filter((t) => t.status === 'failed').length;
    const mergedBlocked = merged.filter((t) => t.status === 'blocked').length;

    const totalAll = Math.max(this.globalTotal, merged.length);
    const pendingAll = totalAll - merged.length;

    const monitorData = {
      lastUpdate: formatDateTime(endTime),
      agentStatus: {
        isRunning: true,
        currentAction: `Coded batch done (${passed} passed, ${failed} failed) | Total: ${merged.length}/${totalAll}`,
        lastAction: `${passed} passed, ${failed} failed`,
        finished: false,
        startedAt: formatDateTime(this.startTime),
        finishedAt: null,
      },
      summary: {
        total: totalAll,
        passed: mergedPassed,
        failed: mergedFailed,
        blocked: mergedBlocked,
        inProgress: 0,
        pending: pendingAll,
      },
      currentTest: null,
      tests: merged,
    };

    try {
      const dir = path.dirname(TESTS_DATA_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const content = `// Auto-generated by Playwright sheets-reporter\nvar testData = ${JSON.stringify(monitorData, null, 2)};\n`;
      fs.writeFileSync(TESTS_DATA_PATH, content, 'utf8');
      console.log(`[sheets-reporter] Wrote ${this.tests.length} results to tests-data.js`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`[sheets-reporter] Failed to write tests-data.js: ${msg}`);
    }

    // 2. Send results to Google Sheet via webhook
    if (this.tests.length > 0) {
      const webhookResults: WebhookResult[] = this.tests.map((t) => ({
        code: t.code,
        status: t.status.toUpperCase(),
        resultText: t.resultText,
        finishedAt: t.finishedAt,
        finishedAtDisplay: t.finishedAtDisplay,
        source: 'playwright-coded' as const,
      }));
      await sendToWebhook(webhookResults, this.rowMap);
    }
  }
}

export default SheetsReporter;
