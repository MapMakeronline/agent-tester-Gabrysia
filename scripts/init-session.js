/**
 * FAST INIT - robi KROK 0-4b w jednym poleceniu
 *
 * Użycie: node init-session.js
 *
 * Wynik: Zapisuje tests-queue.json z metodą per test,
 *        resetuje sesję, zapisuje tests-data.js
 *        Stdout: JSON summary do użycia przez agenta
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const AGENT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(AGENT_ROOT, 'data');
const CONFIG_DIR = path.join(AGENT_ROOT, 'config');
const MONITOR_DIR = path.join(AGENT_ROOT, 'monitor');
const MUIFRONTEND = path.resolve(AGENT_ROOT, '..', '..', '..', 'MUIFrontend');

const SHEET_CONFIG_PATH = path.join(CONFIG_DIR, 'sheet-config.json');
const STOP_SIGNAL_PATH = path.join(MONITOR_DIR, 'stop-signal.txt');
const QUEUE_PATH = path.join(DATA_DIR, 'tests-queue.json');
const SESSION_PATH = path.join(DATA_DIR, 'session-state.json');
const TESTS_DATA_PATH = path.join(MONITOR_DIR, 'tests-data.js');
const LEARNED_DIR = path.join(MUIFRONTEND, 'e2e', 'learned-procedures');

// --- KROK 0: Sheet config ---
function loadSheetConfig() {
    try {
        const cfg = JSON.parse(fs.readFileSync(SHEET_CONFIG_PATH, 'utf8'));
        if (cfg.sheetId) return cfg;
    } catch {}
    // Default
    return {
        sheetId: '1wFlv0KrT4JNTXAnGO4mwtDXPkh2dIxQzfM0VCXxA1jA',
        sheetTitle: 'Testy_Lista',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/1wFlv0KrT4JNTXAnGO4mwtDXPkh2dIxQzfM0VCXxA1jA'
    };
}

// --- KROK 1: Stop signal ---
function checkStopSignal() {
    try {
        if (fs.existsSync(STOP_SIGNAL_PATH)) {
            const content = fs.readFileSync(STOP_SIGNAL_PATH, 'utf8');
            if (content.includes('STOP')) {
                fs.unlinkSync(STOP_SIGNAL_PATH);
                process.stderr.write('Stop signal found and cleared\n');
            }
        }
    } catch {}
}

// --- KROK 2: Reset session ---
function resetSession() {
    fs.writeFileSync(SESSION_PATH, JSON.stringify({
        sessionId: Date.now().toString(36),
        startedAt: new Date().toISOString(),
        category: 'ALL',
        totalTests: 0,
        completedTests: [],
        status: 'running'
    }, null, 2));
}

// --- KROK 2b: Write initial tests-data.js ---
function writeInitialTestsData(sheetConfig) {
    const now = new Date().toISOString().slice(0, 19);
    const data = {
        lastUpdate: now,
        sheetId: sheetConfig.sheetId,
        sheetUrl: sheetConfig.sheetUrl,
        sheetTitle: sheetConfig.sheetTitle,
        agentStatus: {
            isRunning: true,
            currentAction: 'Pobieranie testów z arkusza...',
            lastAction: null,
            finished: false,
            startedAt: now,
            finishedAt: null
        },
        summary: { total: 0, passed: 0, failed: 0, blocked: 0, inProgress: 0, pending: 0, skipped: 0 },
        currentTest: null,
        tests: []
    };
    fs.writeFileSync(TESTS_DATA_PATH, `var testData = ${JSON.stringify(data, null, 2)};\n`);
}

// --- KROK 4: Fetch CSV from Google Sheets ---
function fetchCSV(sheetId) {
    return new Promise((resolve, reject) => {
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;

        const makeRequest = (reqUrl, redirects = 0) => {
            if (redirects > 5) return reject(new Error('Too many redirects'));

            const parsedUrl = new URL(reqUrl);
            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            };

            https.get(options, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return makeRequest(res.headers.location, redirects + 1);
                }
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }).on('error', reject);
        };

        makeRequest(url);
    });
}

// --- CSV Parser (handles quoted fields with newlines) ---
function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                fields.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
    }
    fields.push(current.trim());
    return fields;
}

function parseCSV(csv) {
    // Split handling quoted newlines
    const records = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < csv.length; i++) {
        const ch = csv[i];
        if (ch === '"') inQuotes = !inQuotes;
        if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (current.trim()) records.push(current.trim());
            if (ch === '\r' && csv[i + 1] === '\n') i++;
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) records.push(current.trim());

    // Skip header (records[0])
    const tests = [];
    for (let i = 1; i < records.length; i++) {
        const cols = parseCSVLine(records[i]);
        const id = (cols[0] || '').replace(/^"|"$/g, '');
        const category = (cols[1] || '').replace(/^"|"$/g, '');
        const name = (cols[2] || '').replace(/^"|"$/g, '');
        const stepsRaw = (cols[3] || '').replace(/^"|"$/g, '');
        const requirements = (cols[4] || '').replace(/^"|"$/g, '');
        const expected = (cols[5] || '').replace(/^"|"$/g, '');

        if (!id || !stepsRaw) continue; // Skip tests without ID or steps

        const steps = stepsRaw.split(/\n/).map(s => s.trim()).filter(s => s);

        tests.push({
            row: i + 1,
            id,
            category,
            name,
            steps,
            requirements,
            expected
        });
    }
    return tests;
}

// --- KROK 4b: Scan specs + determine method ---
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

function determineMethod(testId, specMap) {
    if (specMap[testId] && !specMap[testId].isSkipped) return 'CODED';
    try {
        if (fs.existsSync(path.join(LEARNED_DIR, `${testId}.json`))) return 'LEARNED';
    } catch {}
    return 'NLP';
}

// --- Chrome Debug auto-start ---
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
    if (await checkChromeDebug()) {
        process.stderr.write('Chrome debug: OK (port 9222)\n');
        return;
    }
    process.stderr.write('Chrome debug NOT running - starting...\n');
    try {
        execSync('cmd.exe /c start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\\chrome-dev"', { stdio: 'ignore' });
        // Wait for Chrome to be ready
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 1000));
            if (await checkChromeDebug()) {
                process.stderr.write('Chrome debug: started OK\n');
                return;
            }
        }
        process.stderr.write('WARNING: Chrome started but port 9222 not responding after 10s\n');
    } catch (e) {
        process.stderr.write(`WARNING: Failed to start Chrome: ${e.message}\n`);
    }
}

// --- MAIN ---
async function main() {
    const t0 = Date.now();

    // KROK -1: Ensure Chrome debug is running
    await ensureChromeDebug();

    // KROK 0
    const sheetConfig = loadSheetConfig();
    process.stderr.write(`Sheet: ${sheetConfig.sheetTitle}\n`);

    // KROK 1
    checkStopSignal();

    // KROK 2
    resetSession();
    writeInitialTestsData(sheetConfig);
    process.stderr.write('Session reset, monitor updated\n');

    // KROK 4: Fetch CSV
    process.stderr.write('Fetching CSV from Google Sheets...\n');
    const csv = await fetchCSV(sheetConfig.sheetId);
    const tests = parseCSV(csv);
    process.stderr.write(`Parsed ${tests.length} tests with steps\n`);

    // KROK 4b: Scan specs
    const specMap = scanSpecs();
    const specCount = Object.keys(specMap).length;
    const activeSpecs = Object.values(specMap).filter(v => !v.isSkipped).length;
    process.stderr.write(`Specs: ${specCount} TC-IDs (${activeSpecs} coded)\n`);

    // Determine method per test
    let coded = 0, learned = 0, nlp = 0;
    for (const test of tests) {
        test.method = determineMethod(test.id, specMap);
        if (test.method === 'CODED') coded++;
        else if (test.method === 'LEARNED') learned++;
        else nlp++;
    }

    // Write queue
    const queue = {
        sheetId: sheetConfig.sheetId,
        sheetTitle: sheetConfig.sheetTitle,
        tests
    };
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));

    // Update session
    const session = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
    session.totalTests = tests.length;
    fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2));

    // Update tests-data.js with test count
    const now = new Date().toISOString().slice(0, 19);
    const data = {
        lastUpdate: now,
        sheetId: sheetConfig.sheetId,
        sheetUrl: sheetConfig.sheetUrl,
        sheetTitle: sheetConfig.sheetTitle,
        agentStatus: {
            isRunning: true,
            currentAction: `Oczekiwanie na start pętli testowej... (${tests.length} testów: ${coded} coded, ${nlp} NLP)`,
            lastAction: null,
            finished: false,
            startedAt: now,
            finishedAt: null
        },
        summary: { total: tests.length, passed: 0, failed: 0, blocked: 0, inProgress: 0, pending: tests.length, skipped: 0 },
        currentTest: null,
        tests: []
    };
    fs.writeFileSync(TESTS_DATA_PATH, `var testData = ${JSON.stringify(data, null, 2)};\n`);

    const elapsed = Date.now() - t0;

    // JSON summary to stdout (for agent to consume)
    const summary = {
        ok: true,
        elapsed: `${elapsed}ms`,
        sheetTitle: sheetConfig.sheetTitle,
        totalTests: tests.length,
        methods: { coded, learned, nlp },
        queuePath: QUEUE_PATH
    };
    console.log(JSON.stringify(summary));
}

main().catch(err => {
    console.log(JSON.stringify({ ok: false, error: err.message }));
    process.exit(1);
});
