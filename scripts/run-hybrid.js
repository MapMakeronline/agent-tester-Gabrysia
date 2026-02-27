/**
 * HYBRYDOWY ORKIESTRATOR TESTÓW
 *
 * Przepływ:
 * 1. Pobiera listę testów z Google Sheets (CSV API)
 * 2. Uruchamia zakodowane testy Playwright (npx playwright test)
 * 3. Parsuje wyniki JSON z Playwright
 * 4. Zapisuje tests-data.js dla dashboardu
 * 5. Generuje remaining-tests.json = testy bez pokrycia w spec
 * 6. Wyświetla podsumowanie
 *
 * Użycie:
 *   node run-hybrid.js
 *   node run-hybrid.js --skip-coded    (pomija Playwright, tylko generuje remaining)
 *   node run-hybrid.js --coded-only    (uruchamia tylko Playwright, bez remaining)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawn } = require('child_process');

// ==================== PATHS ====================

const AGENT_ROOT = path.resolve(__dirname, '..');
const MUIFRONTEND = path.resolve(__dirname, '..', '..', '..', '..', 'MUIFrontend');
const SHEET_CONFIG = path.join(AGENT_ROOT, 'config', 'sheet-config.json');
const WEBHOOK_CONFIG = path.join(AGENT_ROOT, 'config', 'webhook-config.json');
const TESTS_DATA = path.join(AGENT_ROOT, 'monitor', 'tests-data.js');
const REMAINING_TESTS = path.join(AGENT_ROOT, 'data', 'remaining-tests.json');
const PW_CODED_RESULTS = path.join(AGENT_ROOT, 'data', 'pw-coded-results.json');

// ==================== CLI ARGS ====================

const args = process.argv.slice(2);
const SKIP_CODED = args.includes('--skip-coded');
const CODED_ONLY = args.includes('--coded-only');

// ==================== UTILS ====================

function log(msg) {
    const time = new Date().toLocaleTimeString('pl-PL');
    console.log(`[${time}] ${msg}`);
}

function parseCSV(csvText) {
    const lines = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        if (char === '"') {
            if (inQuotes && csvText[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (current.length > 0 || lines.length > 0) {
                lines.push(current);
                current = '';
            }
            if (char === '\r' && csvText[i + 1] === '\n') i++;
        } else {
            current += char;
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
                if (inQ && line[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQ = !inQ;
                }
            } else if (c === ',' && !inQ) {
                fields.push(field);
                field = '';
            } else {
                field += c;
            }
        }
        fields.push(field);
        return fields;
    });
}

// ==================== GOOGLE SHEETS ====================

function fetchCSV(sheetId, sheetName) {
    let csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    if (sheetName) {
        csvUrl += `&sheet=${encodeURIComponent(sheetName)}`;
    }

    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(csvUrl);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: { 'Accept': 'text/csv' }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location);
                const redirectOptions = {
                    hostname: redirectUrl.hostname,
                    path: redirectUrl.pathname + redirectUrl.search,
                    method: 'GET',
                    headers: { 'Accept': 'text/csv' }
                };
                const redirectReq = https.request(redirectOptions, (rRes) => {
                    let data = '';
                    rRes.on('data', chunk => data += chunk);
                    rRes.on('end', () => resolve(data));
                });
                redirectReq.on('error', reject);
                redirectReq.end();
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
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
        if (!row || row.length === 0 || row.every(cell => !cell || !cell.trim())) continue;

        const id = colMap.id >= 0 ? row[colMap.id]?.trim() : '';
        if (!id || !id.startsWith('TC-')) continue;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const kroki = colMap.kroki >= 0 ? row[colMap.kroki]?.trim() : '';

        tests.push({
            id,
            rowIndex: i + 1,
            kategoria: colMap.kategoria >= 0 ? row[colMap.kategoria]?.trim() : '',
            nazwa: colMap.nazwa >= 0 ? row[colMap.nazwa]?.trim() : '',
            kroki,
            hasSteps: kroki.length > 0,
            wymogi: colMap.wymogi >= 0 ? row[colMap.wymogi]?.trim() : '',
            oczekiwany: colMap.oczekiwany >= 0 ? row[colMap.oczekiwany]?.trim() : '',
        });
    }

    return tests;
}

// ==================== PLAYWRIGHT SPEC SCANNER ====================

function extractTcIdsFromSpecs() {
    const e2eDir = path.join(MUIFRONTEND, 'e2e');
    const dirs = [e2eDir];
    const generatedDir = path.join(e2eDir, 'generated');
    if (fs.existsSync(generatedDir)) dirs.push(generatedDir);

    const allSpecFiles = [];
    for (const dir of dirs) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.spec.ts'));
        for (const f of files) allSpecFiles.push({ dir, file: f });
    }

    const tcIdRegex = /(?:test|test\.skip)\s*\(\s*['"`](TC-\w+-\d+)/g;

    const coded = new Map(); // TC-ID -> { file, isSkipped }

    for (const { dir, file } of allSpecFiles) {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');

        // Find all test() and test.skip() calls
        const testRegex = /(test\.skip|test)\s*\(\s*['"`](TC-\w+-\d+)[^'"`]*['"`]/g;
        let match;
        while ((match = testRegex.exec(content)) !== null) {
            const isSkipped = match[1] === 'test.skip';
            const tcId = match[2];

            // Also check for test.skip(true, ...) pattern inside test body
            const isSkippedInBody = !isSkipped && content.includes(`test.skip(true`) &&
                content.substring(match.index, match.index + 300).includes('test.skip(true');

            coded.set(tcId, {
                file,
                isSkipped: isSkipped || isSkippedInBody,
            });
        }
    }

    return coded;
}

// ==================== PLAYWRIGHT RESULTS PARSER ====================

function parsePlaywrightResults() {
    // Read from dedicated pw-coded-results.json written by sheets-reporter
    try {
        const content = fs.readFileSync(PW_CODED_RESULTS, 'utf8');
        const data = JSON.parse(content);
        if (data.tests && data.tests.length > 0) {
            log(`Odczytano ${data.tests.length} wyników z pw-coded-results.json (${data.generatedAt})`);
            return data.tests;
        }
    } catch (e) {
        log(`Warning: Could not read pw-coded-results.json: ${e.message}`);
    }

    // Fallback: try reading tests-data.js (for backwards compat)
    try {
        const content = fs.readFileSync(TESTS_DATA, 'utf8');
        const match = content.match(/var testData\s*=\s*(\{[\s\S]*\});?\s*$/);
        if (match) {
            const data = JSON.parse(match[1]);
            const tests = (data.tests || []).filter(t => t.source === 'playwright-coded');
            if (tests.length > 0) {
                log(`Fallback: odczytano ${tests.length} coded wyników z tests-data.js`);
                return tests;
            }
        }
    } catch (e) {
        log(`Warning: Could not read tests-data.js either: ${e.message}`);
    }

    log('Brak wyników Playwright - plik pw-coded-results.json nie istnieje');
    return [];
}

// ==================== PLAYWRIGHT RUNNER ====================

/**
 * Uruchamia Playwright przez spawn (nie execSync) z stdio: 'pipe'.
 * Dzięki temu po zakończeniu procesu niszczymy pipe'y i orphaned
 * worker processes nie mogą już pisać na stdout (dostają EPIPE).
 */
function runPlaywright() {
    const pwArgs = ['playwright', 'test', '--grep-invert', '@exploratory',
                    '--reporter=list,./e2e/helpers/sheets-reporter.ts'];
    const cmd = `npx ${pwArgs.join(' ')}`;
    log(`> ${cmd}`);

    return new Promise((resolve) => {
        const child = spawn('npx', pwArgs, {
            cwd: MUIFRONTEND,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true,
            env: { ...process.env, FORCE_COLOR: '1' },
        });

        // Forward output in real-time
        child.stdout.on('data', (chunk) => process.stdout.write(chunk));
        child.stderr.on('data', (chunk) => process.stderr.write(chunk));

        let settled = false;
        function finish(code) {
            if (settled) return;
            settled = true;
            // Stop forwarding - orphaned workers get EPIPE on next write
            child.stdout.removeAllListeners('data');
            child.stderr.removeAllListeners('data');
            child.stdout.destroy();
            child.stderr.destroy();
            // Kill process tree (Windows: taskkill /T kills children too)
            try {
                execSync(`taskkill /T /F /PID ${child.pid}`, { stdio: 'ignore' });
            } catch (e) { /* already exited */ }
            resolve(code || 0);
        }

        child.on('exit', (code) => finish(code));
        child.on('error', (err) => {
            log(`Błąd Playwright: ${err.message}`);
            finish(1);
        });

        // Safety timeout: 30 min (182 tests * ~20s each ≈ 60 min max)
        setTimeout(() => {
            log('Playwright timeout (30 min) - wymuszam zakończenie');
            finish(1);
        }, 1800000);
    });
}

// ==================== MAIN ====================

async function main() {
    log('=== HYBRYDOWY ORKIESTRATOR TESTÓW ===');

    // 1. Load sheet config
    let sheetConfig;
    try {
        sheetConfig = JSON.parse(fs.readFileSync(SHEET_CONFIG, 'utf8'));
    } catch (e) {
        log('BŁĄD: Brak sheet-config.json - uruchom najpierw agenta lub auto-tester');
        process.exit(1);
    }

    log(`Arkusz: ${sheetConfig.sheetTitle || sheetConfig.sheetId}`);

    // 2. Fetch tests from Google Sheets
    log('Pobieram testy z Google Sheets...');
    let csvData;
    try {
        csvData = await fetchCSV(sheetConfig.sheetId, sheetConfig.sheetTitle || 'Testy_Lista');
    } catch (err) {
        log(`BŁĄD pobierania arkusza: ${err.message}`);
        process.exit(1);
    }

    const sheetTests = parseSheetTests(csvData);
    log(`Znaleziono ${sheetTests.length} testów w arkuszu`);

    // 3. Scan spec files for TC-IDs
    log('Skanuję pliki .spec.ts...');
    const specMap = extractTcIdsFromSpecs();
    const codedCount = [...specMap.values()].filter(v => !v.isSkipped).length;
    const skippedCount = [...specMap.values()].filter(v => v.isSkipped).length;
    log(`Znaleziono ${specMap.size} TC-ID w specach (${codedCount} zakodowanych, ${skippedCount} stubów)`);

    // 3.5. Generate specs from learned procedures
    if (!SKIP_CODED) {
        log('Generuję spec z learned procedures...');
        try {
            execSync('node "' + path.join(MUIFRONTEND, 'e2e', 'scripts', 'generate-spec.js') + '"',
                     { stdio: 'inherit', cwd: MUIFRONTEND });
        } catch (e) { log(`Warning: generate-spec: ${e.message}`); }
    }

    // 4. Run coded Playwright tests
    let codedResults = [];
    if (!SKIP_CODED) {
        log('\n--- Uruchamiam zakodowane testy Playwright ---');
        const exitCode = await runPlaywright();
        if (exitCode !== 0) {
            log('Playwright zakończył z błędami (niektóre testy mogły failować)');
        }

        // Parse results from pw-coded-results.json (written by sheets-reporter)
        codedResults = parsePlaywrightResults();
        log(`Wyniki Playwright: ${codedResults.length} testów z TC-ID`);
    } else {
        log('(pomijam uruchomienie Playwright - --skip-coded)');
    }

    if (CODED_ONLY) {
        log('\n=== Tryb --coded-only: pomijam generowanie remaining-tests.json ===');
        printSummary(sheetTests, codedResults, []);
        return;
    }

    // 5. Generate remaining-tests.json
    log('\nGeneruję listę testów do wykonania przez agenta LLM...');

    const codedTcIds = new Set(codedResults.map(t => t.code));
    // Also include all non-skipped spec TC-IDs (even if they weren't in the run results)
    for (const [tcId, info] of specMap) {
        if (!info.isSkipped) codedTcIds.add(tcId);
    }

    const remainingTests = sheetTests.filter(t => {
        // Test is "remaining" if:
        // 1. It has steps (testable)
        // 2. It's NOT covered by coded Playwright tests
        if (!t.hasSteps) return false;
        if (codedTcIds.has(t.id)) return false;
        return true;
    });

    log(`Pozostałe do LLM: ${remainingTests.length} testów`);

    // Save remaining-tests.json
    const remainingData = {
        generatedAt: new Date().toISOString(),
        source: 'run-hybrid.js',
        codedTestsRun: codedResults.length,
        codedTestsPassed: codedResults.filter(t => t.status === 'passed').length,
        codedTestsFailed: codedResults.filter(t => t.status === 'failed').length,
        remainingCount: remainingTests.length,
        tests: remainingTests.map(t => ({
            id: t.id,
            row: t.rowIndex,
            category: t.kategoria,
            name: t.nazwa,
            steps: t.kroki,
            requirements: t.wymogi,
            expected: t.oczekiwany,
        })),
    };

    const dataDir = path.dirname(REMAINING_TESTS);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(REMAINING_TESTS, JSON.stringify(remainingData, null, 2), 'utf8');
    log(`Zapisano: ${REMAINING_TESTS}`);

    // 6. Update tests-data.js to include both coded and remaining info
    updateCombinedTestsData(codedResults, remainingTests, sheetTests);

    // 7. Cleanup intermediate file
    try {
        if (fs.existsSync(PW_CODED_RESULTS)) {
            fs.unlinkSync(PW_CODED_RESULTS);
            log('Usunięto pw-coded-results.json (plik pośredni)');
        }
    } catch (e) {
        log(`Warning: nie udało się usunąć pw-coded-results.json: ${e.message}`);
    }

    // 8. Summary
    printSummary(sheetTests, codedResults, remainingTests);
}

function updateCombinedTestsData(codedResults, remainingTests, sheetTests) {
    const now = new Date();
    const passed = codedResults.filter(t => t.status === 'passed').length;
    const failed = codedResults.filter(t => t.status === 'failed').length;

    const monitorData = {
        lastUpdate: now.toISOString().slice(0, 19),
        hybridMode: true,
        agentStatus: {
            isRunning: false,
            currentAction: 'Hybrid run complete',
            lastAction: `Coded: ${passed}P/${failed}F | Remaining for LLM: ${remainingTests.length}`,
            finished: true,
            startedAt: now.toISOString().slice(0, 19),
            finishedAt: now.toISOString().slice(0, 19),
        },
        summary: {
            total: sheetTests.length,
            passed,
            failed,
            blocked: 0,
            inProgress: 0,
            codedTotal: codedResults.length,
            remainingForLlm: remainingTests.length,
        },
        currentTest: null,
        // Ensure every coded result has source field
        tests: codedResults.map(t => ({
            ...t,
            source: t.source || 'playwright-coded',
        })),
    };

    const content = `// Auto-generated by run-hybrid.js\nvar testData = ${JSON.stringify(monitorData, null, 2)};\n`;
    fs.writeFileSync(TESTS_DATA, content, 'utf8');
    log(`Zapisano tests-data.js: ${codedResults.length} coded results`);
}

function printSummary(sheetTests, codedResults, remainingTests) {
    const passed = codedResults.filter(t => t.status === 'passed').length;
    const failed = codedResults.filter(t => t.status === 'failed').length;

    console.log('\n============================================');
    console.log('          PODSUMOWANIE HYBRYDOWE');
    console.log('============================================');
    console.log(`  Testy w arkuszu:        ${sheetTests.length}`);
    console.log(`  Testy zakodowane:       ${codedResults.length}`);
    console.log(`    - PASSED:             ${passed}`);
    console.log(`    - FAILED:             ${failed}`);
    console.log(`  Do wykonania (LLM):    ${remainingTests.length}`);
    console.log('============================================');

    if (remainingTests.length > 0) {
        console.log('\nNastępny krok: uruchom agenta LLM');
        console.log('Agent automatycznie użyje remaining-tests.json');
    } else {
        console.log('\nWszystkie testy pokryte przez Playwright!');
    }
}

main().catch(err => {
    console.error('Krytyczny błąd:', err);
    process.exit(1);
});
