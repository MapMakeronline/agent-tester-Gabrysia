#!/usr/bin/env node
/**
 * TEST PIPELINE - Batch runner dla kodowanych testów Playwright
 *
 * Pipeline:
 * 1. Pobiera testy z Google Sheets (CSV)
 * 2. Skanuje .spec.ts i learned-procedures
 * 3. Uruchamia WSZYSTKIE kodowane testy w batch
 * 4. Parsuje wyniki z pw-coded-results.json
 * 5. Opcjonalnie zapisuje wyniki do GSheets (Apps Script API)
 * 6. Generuje dane do batch-update GSheets MCP
 * 7. Generuje remaining-tests.json dla agenta LLM
 *
 * Użycie:
 *   node test-pipeline.js                  # Pełny pipeline
 *   node test-pipeline.js --coded-only     # Tylko kodowane
 *   node test-pipeline.js --skip-coded     # Tylko lista remaining
 *   node test-pipeline.js --headless       # Tryb serwerowy
 *   node test-pipeline.js --no-write       # Nie zapisuj do GSheets
 *   node test-pipeline.js --category=X     # Tylko kategoria X
 *   node test-pipeline.js --monitor        # Auto-open monitor dashboard
 *
 * Stdout: JSON z wynikami i danymi MCP
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync, spawn } = require('child_process');

// ==================== PATHS ====================

const AGENT_ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(AGENT_ROOT, 'config');
const DATA_DIR = path.join(AGENT_ROOT, 'data');
const MONITOR_DIR = path.join(AGENT_ROOT, 'monitor');

const MUIFRONTEND = process.env.MUIFRONTEND || path.resolve(AGENT_ROOT, '..', '..', '..', 'MUIFrontend');

const SHEET_CONFIG_PATH = path.join(CONFIG_DIR, 'sheet-config.json');
const QUEUE_PATH = path.join(DATA_DIR, 'tests-queue.json');
const SESSION_PATH = path.join(DATA_DIR, 'session-state.json');
const TESTS_DATA_PATH = path.join(MONITOR_DIR, 'tests-data.js');
const PW_RESULTS_PATH = path.join(DATA_DIR, 'pw-coded-results.json');
const REMAINING_PATH = path.join(DATA_DIR, 'remaining-tests.json');
const STOP_SIGNAL_PATH = path.join(MONITOR_DIR, 'stop-signal.txt');
const LEARNED_DIR = path.join(MUIFRONTEND, 'e2e', 'learned-procedures');
const WEBHOOK_CONFIG_PATH = path.join(CONFIG_DIR, 'webhook-config.json'); // deprecated

const sheetsWriter = require('../lib/sheets-writer');

// ==================== CLI ARGS ====================

const args = process.argv.slice(2);
const SKIP_CODED = args.includes('--skip-coded');
const CODED_ONLY = args.includes('--coded-only');
const HEADLESS = args.includes('--headless');
const NO_WRITE = args.includes('--no-write');
const OPEN_MONITOR = args.includes('--monitor');
const categoryArg = args.find(a => a.startsWith('--category='));
const CATEGORY_ALIASES = {
    'LOGIN': 'LOGOWANIE', 'LOGOWANIE': 'LOGOWANIE',
    'PROJ': 'PROJEKTY', 'PROJEKTY': 'PROJEKTY',
    'IMPORT': 'IMPORT WARSTW', 'IMPORT WARSTW': 'IMPORT WARSTW',
    'LAYER': 'ZARZĄDZANIE WARSTWAMI', 'ZARZĄDZANIE WARSTWAMI': 'ZARZĄDZANIE WARSTWAMI',
    'WARSTWY': 'ZARZĄDZANIE WARSTWAMI',
    'PROPS': 'WŁAŚCIWOŚCI', 'WŁAŚCIWOŚCI': 'WŁAŚCIWOŚCI',
    'TABLE': 'TABELA ATRYBUTÓW', 'TABELA ATRYBUTÓW': 'TABELA ATRYBUTÓW',
    'TABELA': 'TABELA ATRYBUTÓW',
    'NAV': 'NAWIGACJA MAPĄ', 'NAWIGACJA MAPĄ': 'NAWIGACJA MAPĄ', 'NAWIGACJA': 'NAWIGACJA MAPĄ',
    'TOOLS': 'NARZĘDZIA', 'NARZĘDZIA': 'NARZĘDZIA',
    'PUB': 'PUBLIKOWANIE', 'PUBLIKOWANIE': 'PUBLIKOWANIE',
    'UI': 'INTERFEJS', 'INTERFEJS': 'INTERFEJS',
    'PERF': 'WYDAJNOŚĆ', 'WYDAJNOŚĆ': 'WYDAJNOŚĆ',
    'BUG': 'BŁĘDY', 'BŁĘDY': 'BŁĘDY',
};
const rawCategory = categoryArg ? categoryArg.split('=')[1].toUpperCase() : null;
const CATEGORY_FILTER = rawCategory ? (CATEGORY_ALIASES[rawCategory] || rawCategory) : null;

// Map category to TC-ID prefix for Playwright --grep
const CATEGORY_TO_PREFIX = {
    'LOGOWANIE': 'TC-LOGIN',
    'PROJEKTY': 'TC-PROJ',
    'IMPORT WARSTW': 'TC-IMPORT',
    'ZARZĄDZANIE WARSTWAMI': 'TC-LAYER',
    'WŁAŚCIWOŚCI': 'TC-PROPS',
    'TABELA ATRYBUTÓW': 'TC-TABLE',
    'NAWIGACJA MAPĄ': 'TC-NAV',
    'NARZĘDZIA': 'TC-TOOLS',
    'PUBLIKOWANIE': 'TC-PUB',
    'INTERFEJS': 'TC-UI',
    'WYDAJNOŚĆ': 'TC-PERF',
    'BŁĘDY': 'TC-BUG',
};
const CATEGORY_GREP = CATEGORY_FILTER ? CATEGORY_TO_PREFIX[CATEGORY_FILTER] || null : null;

// ==================== UTILS ====================

function log(msg) {
    const time = new Date().toLocaleTimeString('pl-PL');
    process.stderr.write(`[${time}] ${msg}\n`);
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// ==================== MONITOR ====================

/**
 * Uruchamia monitor testów.
 * 1. Próbuje server.js (port 8081) - pełny dashboard z API
 * 2. Fallback: otwiera index.html bezpośrednio (file://)
 */
function startMonitor() {
    if (!OPEN_MONITOR || HEADLESS) return;

    // Sprawdź czy server.js już działa
    const serverCheck = new Promise((resolve) => {
        const req = http.get('http://localhost:8081/api/status', (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(true));
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => { req.destroy(); resolve(false); });
    });

    serverCheck.then((serverRunning) => {
        if (serverRunning) {
            // Server działa - otwórz w przeglądarce
            log('Monitor server running - opening http://localhost:8081');
            try {
                execSync('start "" "http://localhost:8081"', { stdio: 'ignore' });
            } catch {}
        } else {
            // Server nie działa - uruchom go w tle, potem otwórz
            log('Starting monitor server...');
            const serverPath = path.join(__dirname, 'server.js');
            const serverProc = spawn('node', [serverPath], {
                cwd: __dirname,
                stdio: 'ignore',
                detached: true,
                shell: true,
            });
            serverProc.unref();

            // Poczekaj sekundę na start serwera, potem otwórz
            setTimeout(() => {
                try {
                    execSync('start "" "http://localhost:8081"', { stdio: 'ignore' });
                    log('Monitor opened at http://localhost:8081');
                } catch {
                    // Fallback: otwórz plik HTML bezpośrednio
                    log('Fallback: opening monitor HTML directly');
                    const monitorHtml = path.join(MONITOR_DIR, 'index.html');
                    try {
                        execSync(`start "" "${monitorHtml}"`, { stdio: 'ignore' });
                    } catch {}
                }
            }, 1500);
        }
    });
}

// ==================== CONFIG ====================

function loadSheetConfig() {
    try {
        const cfg = JSON.parse(fs.readFileSync(SHEET_CONFIG_PATH, 'utf8'));
        if (cfg.sheetId) return cfg;
    } catch {}
    return {
        sheetId: '1wFlv0KrT4JNTXAnGO4mwtDXPkh2dIxQzfM0VCXxA1jA',
        sheetTitle: 'Testy_Lista',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/1wFlv0KrT4JNTXAnGO4mwtDXPkh2dIxQzfM0VCXxA1jA'
    };
}

// ==================== CSV FETCH & PARSE ====================

function fetchCSV(sheetId, sheetName) {
    let csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    if (sheetName) csvUrl += `&sheet=${encodeURIComponent(sheetName)}`;

    return new Promise((resolve, reject) => {
        const makeReq = (reqUrl, redirects = 0) => {
            if (redirects > 5) return reject(new Error('Too many redirects'));
            const parsed = new URL(reqUrl);
            https.get({
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return makeReq(res.headers.location, redirects + 1);
                }
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    if (data.trimStart().startsWith('<!DOCTYPE') || data.trimStart().startsWith('<html')) {
                        reject(new Error('Arkusz nie jest publiczny'));
                    } else {
                        resolve(data);
                    }
                });
            }).on('error', reject);
        };
        makeReq(csvUrl);
    });
}

function parseCSV(csvText) {
    const lines = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const ch = csvText[i];
        if (ch === '"') {
            if (inQuotes && csvText[i + 1] === '"') { current += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (current.length > 0 || lines.length > 0) { lines.push(current); current = ''; }
            if (ch === '\r' && csvText[i + 1] === '\n') i++;
        } else {
            current += ch;
        }
    }
    if (current) lines.push(current);

    return lines.map(line => {
        const fields = [];
        let field = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') {
                if (inQ && line[i + 1] === '"') { field += '"'; i++; }
                else inQ = !inQ;
            } else if (c === ',' && !inQ) { fields.push(field); field = ''; }
            else field += c;
        }
        fields.push(field);
        return fields;
    });
}

function parseSheetTests(csvData) {
    const rows = parseCSV(csvData);
    if (rows.length < 2) return [];

    const header = rows[0].map(h => h.toLowerCase().trim());
    const tests = [];
    const seenIds = new Set();

    const colMap = {
        id: header.findIndex(h => h === 'id' || h.includes('id')),
        kategoria: header.findIndex(h => h === 'kategoria' || h.includes('kategor')),
        nazwa: header.findIndex(h => h === 'nazwa testu' || h.includes('nazwa')),
        kroki: header.findIndex(h => h === 'kroki' || h.includes('krok')),
        wymogi: header.findIndex(h => h === 'wymogi' || h.includes('wymog') || h.includes('warun')),
        oczekiwany: header.findIndex(h => h === 'oczekiwany rezultat' || h.includes('oczekiwan')),
        status: header.findIndex(h => h === 'status'),
    };

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0 || row.every(c => !c || !c.trim())) continue;

        const id = colMap.id >= 0 ? row[colMap.id]?.trim() : '';
        if (!id || !id.startsWith('TC-')) continue;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const kroki = colMap.kroki >= 0 ? row[colMap.kroki]?.trim() : '';
        const kategoria = colMap.kategoria >= 0 ? row[colMap.kategoria]?.trim() : '';

        if (CATEGORY_FILTER && kategoria.toUpperCase() !== CATEGORY_FILTER) continue;

        tests.push({
            id,
            row: i + 1,
            kategoria,
            nazwa: colMap.nazwa >= 0 ? row[colMap.nazwa]?.trim() : '',
            kroki,
            steps: kroki.split(/\n/).map(s => s.trim()).filter(s => s),
            hasSteps: kroki.length > 0,
            wymogi: colMap.wymogi >= 0 ? row[colMap.wymogi]?.trim() : '',
            oczekiwany: colMap.oczekiwany >= 0 ? row[colMap.oczekiwany]?.trim() : '',
        });
    }
    return tests;
}

// ==================== SPEC SCANNER ====================

function scanSpecs() {
    const e2eDir = path.join(MUIFRONTEND, 'e2e');
    const dirs = [e2eDir];
    const generatedDir = path.join(e2eDir, 'generated');
    if (fs.existsSync(generatedDir)) dirs.push(generatedDir);

    const coded = {};
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.spec.ts'));
        for (const f of files) {
            const content = fs.readFileSync(path.join(dir, f), 'utf8');
            const testRegex = /(test\.skip|test)\s*\(\s*['"`](TC-\w+-\d+)[^'"`]*['"`]/g;
            let match;
            while ((match = testRegex.exec(content)) !== null) {
                const isSkipped = match[1] === 'test.skip';
                const tcId = match[2];
                const isSkippedInBody = !isSkipped && content.includes('test.skip(true') &&
                    content.substring(match.index, match.index + 300).includes('test.skip(true');
                coded[tcId] = { file: f, isSkipped: isSkipped || isSkippedInBody };
            }
        }
    }
    return coded;
}

function scanLearned() {
    const learned = {};
    try {
        if (!fs.existsSync(LEARNED_DIR)) return learned;
        const files = fs.readdirSync(LEARNED_DIR).filter(f => f.endsWith('.json'));
        for (const f of files) {
            const tcId = f.replace('.json', '');
            learned[tcId] = { file: f };
        }
    } catch {}
    return learned;
}

function determineMethod(testId, specMap, learnedMap) {
    if (specMap[testId] && !specMap[testId].isSkipped) return 'CODED';
    if (learnedMap[testId]) return 'LEARNED';
    return 'NLP';
}

// ==================== CHROME DEBUG ====================

function checkChromeDebug() {
    return new Promise((resolve) => {
        const req = http.get('http://localhost:9222/json/version', (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(true));
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
}

async function ensureChromeDebug() {
    if (HEADLESS) {
        log('Tryb headless - pomijam Chrome Debug');
        return;
    }
    if (await checkChromeDebug()) {
        log('Chrome debug: OK (port 9222)');
        return;
    }
    log('Chrome debug NOT running - starting...');
    try {
        execSync('cmd.exe /c start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\\chrome-dev"', { stdio: 'ignore' });
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 1000));
            if (await checkChromeDebug()) {
                log('Chrome debug: started OK');
                return;
            }
        }
        log('WARNING: Chrome started but port 9222 not responding');
    } catch (e) {
        log(`WARNING: Failed to start Chrome: ${e.message}`);
    }
}

// ==================== PLAYWRIGHT RUNNER ====================

function runPlaywright(grepPattern) {
    const pwArgs = ['playwright', 'test'];

    if (grepPattern) {
        pwArgs.push('--grep', grepPattern);
    } else {
        pwArgs.push('--grep-invert', '@exploratory');
    }

    pwArgs.push('--reporter=list,./e2e/helpers/sheets-reporter.ts');

    const cmd = `npx ${pwArgs.join(' ')}`;
    log(`> ${cmd}`);

    return new Promise((resolve) => {
        const env = { ...process.env, FORCE_COLOR: '0' };
        if (HEADLESS) {
            env.HEADLESS = '1';
        }

        const child = spawn('npx', pwArgs, {
            cwd: MUIFRONTEND,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true,
            env,
        });

        child.stdout.on('data', (chunk) => process.stderr.write(chunk));
        child.stderr.on('data', (chunk) => process.stderr.write(chunk));

        let settled = false;
        function finish(code) {
            if (settled) return;
            settled = true;
            child.stdout.removeAllListeners('data');
            child.stderr.removeAllListeners('data');
            child.stdout.destroy();
            child.stderr.destroy();
            try {
                execSync(`taskkill /T /F /PID ${child.pid}`, { stdio: 'ignore' });
            } catch {}
            resolve(code || 0);
        }

        child.on('exit', (code) => finish(code));
        child.on('error', (err) => {
            log(`Playwright error: ${err.message}`);
            finish(1);
        });

        // Safety timeout: 30 min
        setTimeout(() => {
            log('Playwright timeout (30 min)');
            finish(1);
        }, 1800000);
    });
}

// ==================== RESULTS PARSER ====================

function parsePlaywrightResults() {
    try {
        const content = fs.readFileSync(PW_RESULTS_PATH, 'utf8');
        const data = JSON.parse(content);
        if (data.tests && data.tests.length > 0) {
            log(`Parsed ${data.tests.length} results from pw-coded-results.json`);
            return data.tests;
        }
    } catch (e) {
        log(`Warning: Could not read pw-coded-results.json: ${e.message}`);
    }
    return [];
}

// ==================== GSHEETS WRITE (Sheets API v4 via service account) ====================

async function writeResultsToSheet(results, rowMap) {
    if (NO_WRITE || results.length === 0) return { written: 0, skipped: true };

    log(`Writing ${results.length} results to Google Sheets (API v4)...`);
    const { written, errors } = await sheetsWriter.batchUpdateResults(results, rowMap);
    log(`GSheets write: ${written} OK, ${errors} errors`);
    return { written, errors };
}

// ==================== MCP BATCH DATA GENERATOR ====================

/**
 * Generuje dane do mcp__gsheets__sheets_batch_update_values
 * Agent może użyć tych danych do jednego wywołania MCP zamiast wielu.
 */
function generateMcpBatchData(sheetConfig, results, rowMap) {
    const data = [];

    for (const result of results) {
        const row = rowMap[result.code];
        if (!row) continue;

        const status = result.status.toUpperCase();
        const prefix = result.source === 'playwright-coded' ? '[Coded] ' : '[LLM] ';
        const resultText = prefix + (result.resultText || result.name || '');
        const dateStr = result.finishedAtDisplay || new Date().toLocaleString('pl-PL');
        const tabName = sheetConfig.tabName || 'Arkusz1';

        data.push({
            range: `${tabName}!G${row}:I${row}`,
            values: [[status, resultText, dateStr]]
        });
    }

    return {
        spreadsheetId: sheetConfig.sheetId,
        data,
        valueInputOption: 'USER_ENTERED'
    };
}

// ==================== MONITOR UPDATE ====================

function writeTestsData(sheetConfig, tests, codedResults, remainingCount, isRunning) {
    const now = new Date();
    const passed = codedResults.filter(t => t.status === 'passed').length;
    const failed = codedResults.filter(t => t.status === 'failed').length;
    const blocked = codedResults.filter(t => t.status === 'blocked').length;

    const monitorData = {
        lastUpdate: now.toISOString().slice(0, 19),
        sheetId: sheetConfig.sheetId,
        sheetUrl: sheetConfig.sheetUrl,
        sheetTitle: sheetConfig.sheetTitle,
        hybridMode: true,
        agentStatus: {
            isRunning,
            currentAction: isRunning
                ? `Pipeline: coded batch done (${passed}P/${failed}F) | ${remainingCount} remaining for LLM`
                : `Pipeline complete: ${passed}P/${failed}F coded | ${remainingCount} NLP remaining`,
            lastAction: `Coded: ${passed}P/${failed}F`,
            finished: !isRunning,
            startedAt: now.toISOString().slice(0, 19),
            finishedAt: isRunning ? null : now.toISOString().slice(0, 19),
        },
        summary: {
            total: tests.length,
            passed,
            failed,
            blocked,
            inProgress: 0,
            pending: remainingCount,
            codedTotal: codedResults.length,
            remainingForLlm: remainingCount,
        },
        currentTest: null,
        tests: codedResults.map(t => ({
            ...t,
            source: t.source || 'playwright-coded',
        })),
    };

    ensureDir(MONITOR_DIR);
    const content = `// Auto-generated by test-pipeline.js\nvar testData = ${JSON.stringify(monitorData, null, 2)};\n`;
    fs.writeFileSync(TESTS_DATA_PATH, content, 'utf8');
}

function writeQueue(sheetConfig, tests) {
    ensureDir(DATA_DIR);
    fs.writeFileSync(QUEUE_PATH, JSON.stringify({
        sheetId: sheetConfig.sheetId,
        sheetTitle: sheetConfig.sheetTitle,
        tests
    }, null, 2));
}

function writeRemainingTests(remaining, codedResults) {
    ensureDir(DATA_DIR);
    const data = {
        generatedAt: new Date().toISOString(),
        source: 'test-pipeline.js',
        codedTestsRun: codedResults.length,
        codedTestsPassed: codedResults.filter(t => t.status === 'passed').length,
        codedTestsFailed: codedResults.filter(t => t.status === 'failed').length,
        remainingCount: remaining.length,
        tests: remaining.map(t => ({
            id: t.id,
            row: t.row,
            category: t.kategoria,
            name: t.nazwa,
            steps: t.steps,
            requirements: t.wymogi,
            expected: t.oczekiwany,
            method: t.method,
        })),
    };
    fs.writeFileSync(REMAINING_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ==================== MAIN ====================

async function main() {
    const t0 = Date.now();

    // 0. Ensure Chrome debug (unless headless)
    if (!SKIP_CODED) {
        await ensureChromeDebug();
    }

    // 1. Load config
    const sheetConfig = loadSheetConfig();
    log(`Sheet: ${sheetConfig.sheetTitle} (${sheetConfig.sheetId.slice(0, 12)}...)`);

    // 1b. Auto-open monitor dashboard
    startMonitor();

    // 2. Clear stop signal
    try {
        if (fs.existsSync(STOP_SIGNAL_PATH)) {
            const content = fs.readFileSync(STOP_SIGNAL_PATH, 'utf8');
            if (content.includes('STOP')) {
                fs.unlinkSync(STOP_SIGNAL_PATH);
                log('Stop signal cleared');
            }
        }
    } catch {}

    // 3. Fetch tests from Google Sheets
    log('Fetching tests from Google Sheets...');
    const csv = await fetchCSV(sheetConfig.sheetId, sheetConfig.sheetTitle);
    const tests = parseSheetTests(csv);
    log(`Parsed ${tests.length} tests` + (CATEGORY_FILTER ? ` (category: ${CATEGORY_FILTER})` : ''));

    // 4. Scan specs and learned procedures
    log('Scanning spec files...');
    const specMap = scanSpecs();
    const learnedMap = scanLearned();

    let codedCount = 0, learnedCount = 0, nlpCount = 0;
    const rowMap = {};

    for (const test of tests) {
        test.method = determineMethod(test.id, specMap, learnedMap);
        if (test.method === 'CODED') codedCount++;
        else if (test.method === 'LEARNED') learnedCount++;
        else nlpCount++;
        rowMap[test.id] = test.row;
    }

    log(`Methods: ${codedCount} CODED, ${learnedCount} LEARNED, ${nlpCount} NLP`);

    // 5. Write queue for agent (used by sheets-reporter.ts)
    writeQueue(sheetConfig, tests);

    // 6. Reset session state
    ensureDir(DATA_DIR);
    fs.writeFileSync(SESSION_PATH, JSON.stringify({
        sessionId: Date.now().toString(36),
        startedAt: new Date().toISOString(),
        category: CATEGORY_FILTER || 'ALL',
        totalTests: tests.length,
        completedTests: [],
        status: 'running'
    }, null, 2));

    // 7. Run coded tests
    let codedResults = [];
    if (!SKIP_CODED && codedCount > 0) {
        log(`\n--- Running ${codedCount} coded Playwright tests ---`);

        // Update monitor
        writeTestsData(sheetConfig, tests, [], nlpCount + learnedCount, true);

        const grepPattern = CATEGORY_GREP || null;
        if (grepPattern) log(`Filtering Playwright tests: --grep "${grepPattern}"`);
        const exitCode = await runPlaywright(grepPattern);
        if (exitCode !== 0) {
            log('Playwright finished with errors (some tests may have failed)');
        }

        codedResults = parsePlaywrightResults();
        log(`Playwright results: ${codedResults.length} tests with TC-ID`);
    } else if (SKIP_CODED) {
        log('Skipping coded tests (--skip-coded)');
    } else {
        log('No coded tests to run');
    }

    // 8. Add skipped specs as BLOCKED results
    const codedIds = new Set(codedResults.map(t => t.code));
    for (const test of tests) {
        const spec = specMap[test.id];
        if (spec && spec.isSkipped && !codedIds.has(test.id)) {
            codedResults.push({
                code: test.id,
                name: test.nazwa,
                status: 'blocked',
                source: 'playwright-coded',
                resultText: `[Coded] SKIPPED - test.skip w ${spec.file} (brak implementacji)`,
                duration: 0,
                error: `Test pominięty (test.skip) w pliku ${spec.file}`,
                startedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                finishedAtDisplay: new Date().toLocaleString('pl-PL'),
            });
            codedIds.add(test.id);
        }
    }

    // Determine remaining tests (NLP/LEARNED only)
    for (const [tcId, info] of Object.entries(specMap)) {
        if (!info.isSkipped) codedIds.add(tcId);
    }

    const remainingTests = tests.filter(t => {
        if (!t.hasSteps) return false;
        if (codedIds.has(t.id)) return false;
        return true;
    });

    // 9. Write results to Google Sheets (Apps Script API)
    let sheetsWriteResult = { written: 0, skipped: true };
    if (!SKIP_CODED && codedResults.length > 0) {
        sheetsWriteResult = await writeResultsToSheet(codedResults, rowMap);
    }

    // 10. Generate MCP batch data
    const mcpBatchData = generateMcpBatchData(sheetConfig, codedResults, rowMap);

    // 11. Write remaining-tests.json
    writeRemainingTests(remainingTests, codedResults);

    // 12. Update monitor
    writeTestsData(sheetConfig, tests, codedResults, remainingTests.length, remainingTests.length > 0);

    // 13. Cleanup intermediate file
    try {
        if (fs.existsSync(PW_RESULTS_PATH)) {
            fs.unlinkSync(PW_RESULTS_PATH);
        }
    } catch {}

    // 14. Output JSON to stdout
    const elapsed = Math.round((Date.now() - t0) / 1000);
    const passed = codedResults.filter(t => t.status === 'passed').length;
    const failed = codedResults.filter(t => t.status === 'failed').length;

    const output = {
        ok: true,
        pipeline: SKIP_CODED ? 'remaining-only' : CODED_ONLY ? 'coded-only' : 'full',
        elapsed: `${elapsed}s`,
        sheet: {
            id: sheetConfig.sheetId,
            title: sheetConfig.sheetTitle,
            totalTests: tests.length,
        },
        coded: {
            total: codedResults.length,
            passed,
            failed,
            blocked: codedResults.filter(t => t.status === 'blocked').length,
            results: codedResults.map(t => ({
                code: t.code,
                name: t.name,
                status: t.status.toUpperCase(),
                row: rowMap[t.code] || null,
                duration: t.duration,
                error: t.error || null,
            })),
        },
        remaining: {
            total: remainingTests.length,
            learned: remainingTests.filter(t => t.method === 'LEARNED').length,
            nlp: remainingTests.filter(t => t.method === 'NLP').length,
            tests: remainingTests.map(t => ({
                id: t.id,
                row: t.row,
                category: t.kategoria,
                name: t.nazwa,
                method: t.method,
                steps: t.steps,
                expected: t.oczekiwany,
            })),
        },
        sheetsUpdated: sheetsWriteResult.written > 0,
        sheetsWriteResult,
        mcp: {
            batchUpdate: mcpBatchData,
            readRange: `${sheetConfig.tabName || 'Arkusz1'}!A:I`,
            spreadsheetId: sheetConfig.sheetId,
        },
        paths: {
            remaining: REMAINING_PATH,
            queue: QUEUE_PATH,
            testsData: TESTS_DATA_PATH,
        },
    };

    // Stdout = JSON for agent consumption
    console.log(JSON.stringify(output, null, 2));

    // Summary to stderr
    log('\n============================================');
    log('          PIPELINE SUMMARY');
    log('============================================');
    log(`  Total tests:           ${tests.length}`);
    log(`  Coded (Playwright):    ${codedResults.length} (${passed}P/${failed}F)`);
    log(`  Remaining (LLM):      ${remainingTests.length} (${remainingTests.filter(t => t.method === 'LEARNED').length} learned, ${remainingTests.filter(t => t.method === 'NLP').length} NLP)`);
    log(`  GSheets updated:      ${sheetsWriteResult.written}/${codedResults.length}`);
    log(`  Elapsed:              ${elapsed}s`);
    log('============================================');

    if (remainingTests.length > 0) {
        log('\nAgent LLM can now process remaining tests.');
        log(`Use: mcp__gsheets__sheets_batch_update_values with data from output.mcp.batchUpdate`);
    } else {
        log('\nAll tests covered by Playwright!');
    }
}

main().catch(err => {
    console.log(JSON.stringify({ ok: false, error: err.message, stack: err.stack }));
    process.exit(1);
});
