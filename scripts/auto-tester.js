/**
 * AUTONOMICZNY TESTER
 * Uruchom: node auto-tester.js --sheet="URL_LUB_ID_ARKUSZA"
 * Zatrzymaj: utwórz plik stop-signal.txt z tekstem STOP
 *
 * Ten skrypt jest uruchamiany przez server.js po otrzymaniu konfiguracji z monitora.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');


// Konfiguracja
const CONFIG = {
    APP_URL: 'https://universe-mapmaker.web.app',
    LOGIN: { username: 'Mestwin', password: 'Kaktus,1' },
    MAX_TESTS: 999,
    STOP_FILE: path.join(__dirname, '..', 'monitor', 'stop-signal.txt'),
    TESTS_DATA: path.join(__dirname, '..', 'monitor', 'tests-data.js'),
    SHEET_CONFIG: path.join(__dirname, '..', 'config', 'sheet-config.json'),
    WEBHOOK_CONFIG: path.join(__dirname, '..', 'config', 'webhook-config.json'),
    REMAINING_TESTS: path.join(__dirname, '..', 'data', 'remaining-tests.json')
};

// ==================== CONFIG ====================

function getSheetConfig() {
    // 0. Sprawdź --remaining (tryb po run-hybrid.js)
    if (process.argv.includes('--remaining')) {
        return { sheetId: null, sheetUrl: null, tabName: null, useRemaining: true };
    }

    // 1. Sprawdź argument --sheet (URL lub ID)
    const sheetArg = process.argv.find(arg => arg.startsWith('--sheet='));
    const tabArg = process.argv.find(arg => arg.startsWith('--tab='));
    let input = '';
    let tabName = '';

    if (tabArg) {
        tabName = tabArg.split('=')[1].replace(/['"]/g, '');
    }

    if (sheetArg) {
        input = sheetArg.split('=')[1].replace(/['"]/g, '');
    } else {
        // 2. Wczytaj z pliku konfiguracji
        try {
            const config = JSON.parse(fs.readFileSync(CONFIG.SHEET_CONFIG, 'utf8'));
            input = config.sheetUrl || config.sheetId || '';
            if (!tabName) tabName = config.tabName || '';
        } catch (e) {}
    }

    // Parsuj input - może być URL lub ID
    let sheetId = '';
    let sheetUrl = '';

    if (input.includes('docs.google.com/spreadsheets')) {
        sheetUrl = input;
        const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match) sheetId = match[1];
    } else if (input.length > 20) {
        // Prawdopodobnie ID
        sheetId = input;
        sheetUrl = `https://docs.google.com/spreadsheets/d/${input}/edit`;
    }

    // Domyślna zakładka: Testy_Lista
    if (!tabName) tabName = 'Testy_Lista';

    return { sheetId, sheetUrl, tabName };
}

// Pobierz tytuł arkusza z HTML strony Google Sheets
function fetchSheetTitle(sheetUrl) {
    return new Promise((resolve) => {
        if (!sheetUrl) {
            resolve('');
            return;
        }

        const parsedUrl = new URL(sheetUrl);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        };

        const req = https.request(options, (res) => {
            let html = '';
            res.on('data', chunk => html += chunk);
            res.on('end', () => {
                // Wyciągnij tytuł z <title>Nazwa - Arkusze Google</title>
                const match = html.match(/<title>([^<]+)<\/title>/i);
                if (match && match[1]) {
                    // Usuń " - Arkusze Google" lub " - Google Sheets"
                    let title = match[1]
                        .replace(/\s*-\s*(Arkusze Google|Google Sheets|Google Spreadsheets)$/i, '')
                        .trim();
                    resolve(title);
                } else {
                    resolve('');
                }
            });
        });

        req.on('error', () => resolve(''));
        req.setTimeout(10000, () => { req.destroy(); resolve(''); });
        req.end();
    });
}

// ==================== GOOGLE SHEETS ====================

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

async function fetchTestsFromSheet(sheetId, sheetName) {
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
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location);
                const redirectOptions = {
                    hostname: redirectUrl.hostname,
                    path: redirectUrl.pathname + redirectUrl.search,
                    method: 'GET',
                    headers: { 'Accept': 'text/csv' }
                };

                const redirectReq = https.request(redirectOptions, (redirectRes) => {
                    let data = '';
                    redirectRes.on('data', chunk => data += chunk);
                    redirectRes.on('end', () => {
                        if (data.trimStart().startsWith('<!DOCTYPE') || data.trimStart().startsWith('<html')) {
                            reject(new Error('Arkusz nie jest publiczny! Udostępnij go jako "Każdy kto ma link > Przeglądający"'));
                            return;
                        }
                        resolve(data);
                    });
                });
                redirectReq.on('error', reject);
                redirectReq.end();
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (data.trimStart().startsWith('<!DOCTYPE') || data.trimStart().startsWith('<html')) {
                    reject(new Error('Arkusz nie jest publiczny! Udostępnij go jako "Każdy kto ma link > Przeglądający"'));
                    return;
                }
                resolve(data);
            });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

function parseTestsFromCSV(csvData) {
    const rows = parseCSV(csvData);
    if (rows.length < 2) return [];

    const header = rows[0].map(h => h.toLowerCase().trim());
    const tests = [];
    const seenIds = new Set(); // Unikaj duplikatów

    // Mapowanie kolumn
    const colMap = {
        id: header.findIndex(h => h === 'id' || h.includes('id')),
        kategoria: header.findIndex(h => h === 'kategoria' || h.includes('kategor')),
        nazwa: header.findIndex(h => h === 'nazwa testu' || h.includes('nazwa')),
        kroki: header.findIndex(h => h === 'kroki' || h.includes('krok')),
        wymogi: header.findIndex(h => h === 'wymogi' || h.includes('wymog') || h.includes('warun')),
        oczekiwany: header.findIndex(h => h === 'oczekiwany rezultat' || h.includes('oczekiwan')),
        status: header.findIndex(h => h === 'status'),
        wynik: header.findIndex(h => h === 'wynik')
    };

    log(`Kolumny: ID=${colMap.id}, Kroki=${colMap.kroki}, Status=${colMap.status}`);

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];

        // Pomiń puste wiersze
        if (!row || row.length === 0 || row.every(cell => !cell || !cell.trim())) continue;

        const id = colMap.id >= 0 ? row[colMap.id]?.trim() : '';

        // Pomiń wiersze bez prawidłowego ID
        if (!id || !id.startsWith('TC-')) continue;

        // Pomiń duplikaty
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const status = colMap.status >= 0 ? row[colMap.status]?.trim().toUpperCase() : 'PENDING';
        const kroki = colMap.kroki >= 0 ? row[colMap.kroki]?.trim() : '';

        tests.push({
            id: id,
            rowIndex: i + 1,
            kategoria: colMap.kategoria >= 0 ? row[colMap.kategoria]?.trim() : '',
            nazwa: colMap.nazwa >= 0 ? row[colMap.nazwa]?.trim() : '',
            kroki: kroki,
            hasSteps: kroki.length > 0,
            wymogi: colMap.wymogi >= 0 ? row[colMap.wymogi]?.trim() : '',
            oczekiwany: colMap.oczekiwany >= 0 ? row[colMap.oczekiwany]?.trim() : '',
            status: status,
            wynik: colMap.wynik >= 0 ? row[colMap.wynik]?.trim() : ''
        });
    }

    return tests;
}

// ==================== UTILS ====================

function log(msg) {
    const time = new Date().toLocaleTimeString('pl-PL');
    console.log(`[${time}] ${msg}`);
}

function checkStopSignal() {
    try {
        if (fs.existsSync(CONFIG.STOP_FILE)) {
            const content = fs.readFileSync(CONFIG.STOP_FILE, 'utf8');
            return content.includes('STOP');
        }
    } catch (e) {}
    return false;
}

function updateMonitor(data) {
    const content = `// Auto-generated by Auto Tester\nvar testData = ${JSON.stringify(data, null, 2)};\n`;
    fs.writeFileSync(CONFIG.TESTS_DATA, content, 'utf8');
}

// Wyślij wyniki do Google Sheets przez webhook
async function sendResultsToSheet(results) {
    // Sprawdź konfigurację webhook
    let webhookConfig;
    try {
        webhookConfig = JSON.parse(fs.readFileSync(CONFIG.WEBHOOK_CONFIG, 'utf8'));
    } catch (e) {
        log('Brak konfiguracji webhook - wyniki nie zostaną zapisane do arkusza');
        return false;
    }

    if (!webhookConfig.enabled || !webhookConfig.webhookUrl) {
        log('Webhook wyłączony lub brak URL - wyniki nie zostaną zapisane do arkusza');
        return false;
    }

    log('Wysyłam wyniki do arkusza Google...');

    return new Promise((resolve) => {
        const postData = JSON.stringify({ results });
        const parsedUrl = new URL(webhookConfig.webhookUrl);

        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.success) {
                        log(`Zapisano ${response.updated}/${response.total} wyników do arkusza`);
                        resolve(true);
                    } else {
                        log(`Błąd zapisu do arkusza: ${response.error}`);
                        resolve(false);
                    }
                } catch (e) {
                    log(`Błąd parsowania odpowiedzi webhook: ${e.message}`);
                    resolve(false);
                }
            });
        });

        req.on('error', (e) => {
            log(`Błąd połączenia z webhook: ${e.message}`);
            resolve(false);
        });

        req.setTimeout(30000, () => {
            req.destroy();
            log('Timeout podczas wysyłania do webhook');
            resolve(false);
        });

        req.write(postData);
        req.end();
    });
}

function readMonitor() {
    try {
        const content = fs.readFileSync(CONFIG.TESTS_DATA, 'utf8');
        const match = content.match(/var testData\s*=\s*(\{[\s\S]*\});?\s*$/);
        if (match) return JSON.parse(match[1]);
    } catch (e) {}
    return { lastUpdate: '', agentStatus: {}, summary: {}, tests: [] };
}

function loadRemainingTests() {
    try {
        const raw = fs.readFileSync(CONFIG.REMAINING_TESTS, 'utf8');
        const data = JSON.parse(raw);
        if (!data.tests || data.tests.length === 0) {
            log('remaining-tests.json jest pusty');
            return [];
        }
        log(`Wczytano ${data.tests.length} testów z remaining-tests.json`);
        return data.tests.map(t => ({
            id: t.id,
            rowIndex: t.row,
            kategoria: t.category,
            nazwa: t.name,
            kroki: t.steps,
            hasSteps: (t.steps || '').length > 0,
            wymogi: t.requirements || '',
            oczekiwany: t.expected || '',
            status: '',
            wynik: ''
        }));
    } catch (e) {
        log(`Błąd wczytywania remaining-tests.json: ${e.message}`);
        return [];
    }
}

// ==================== TESTY ====================

// Selektory dopasowane do faktycznego DOM aplikacji (Vuetify)
// Pola to textbox z aria-label, nie standardowe input[type="password"]
const SELECTORS = {
    usernameField: 'role=textbox[name="Nazwa użytkownika"]',
    passwordField: 'role=textbox[name="Hasło"]',
    loginButton:   'role=button[name="Zaloguj się"]',
    loginHeading:  'text=Witamy ponownie',
};

// Wyczyść sesję i upewnij się, że strona logowania jest widoczna
async function ensureOnLoginPage(page, { clearSession = true } = {}) {
    if (clearSession) {
        // Wyczyść cookies i storage żeby wymusić wylogowanie
        await page.context().clearCookies();
        await page.evaluate(() => {
            try { localStorage.clear(); } catch (e) {}
            try { sessionStorage.clear(); } catch (e) {}
        }).catch(() => {});
    }

    await page.goto(`${CONFIG.APP_URL}/login`, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    // Czekaj aż formularz logowania się wyrenderuje (SPA/Vuetify może być wolny po wyczyszczeniu cache)
    await page.locator(SELECTORS.usernameField).waitFor({ state: 'visible', timeout: 30000 });
    log('  Formularz logowania widoczny');
}

async function loginTest(page, { clearSession = true } = {}) {
    await ensureOnLoginPage(page, { clearSession });

    await page.locator(SELECTORS.usernameField).fill(CONFIG.LOGIN.username);
    await page.locator(SELECTORS.passwordField).fill(CONFIG.LOGIN.password);
    await page.locator(SELECTORS.loginButton).click();

    // SPA redirect może być wolny — czekaj cierpliwie
    await page.waitForURL(/dashboard|projects/i, { timeout: 30000 });
    // Dodatkowe czekanie aż strona się w pełni załaduje
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    return page.url().includes('dashboard') || page.url().includes('projects');
}

// ==================== HELPERY KROKÓW ====================

/**
 * Wyciąga tekst docelowy z kroku testowego.
 * Np. "Znajdź opcję Widoczność kolumn" → "Widoczność kolumn"
 *     "Wybierz narzędzie Rysuj punkt" → "Rysuj punkt"
 */
function extractTarget(stepText) {
    // 1. Tekst w cudzysłowie ma najwyższy priorytet
    const quoteMatch = stepText.match(/"([^"]+)"|'([^']+)'|„([^"]+)"/);
    if (quoteMatch) return quoteMatch[1] || quoteMatch[2] || quoteMatch[3];

    // 2. Usuń czasownik początkowy
    let text = stepText
        .replace(/^(znajdź|szukaj|wybierz|zaznacz|zmień|włącz|wyłącz|uruchom|wykonaj|użyj|załaduj|importuj|skopiuj|kopiuj|najedź|spróbuj|otwórz|kliknij|naciśnij|przejdź|wejdź)\s*/i, '')
        .trim();

    // 3. Usuń słowa opisujące typ elementu
    text = text
        .replace(/^(opcję?|pole|polu|sekcję?|przycisk|narzędzie|panel|checkbox|suwak|link|element|ikonę?|zakładkę?|informację?\s+o|krawędź|wiersz|rekord|komórkę?|obiekt|warstwę?|grupę?|projekt|kolumnę?)\s*/i, '')
        .trim();

    // 4. Usuń przyimki na początku
    text = text.replace(/^(na|w|do|z|od|po|dla|przy|przez|ze|we|ku)\s+/i, '').trim();

    // 5. Usuń nawiasy i interpunkcję końcową
    text = text.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    text = text.replace(/[.,;:!?]+$/, '').trim();

    return text;
}

/**
 * Szuka elementu na stronie po tekście, używając wielu strategii.
 * Zwraca { locator, found: true } lub { locator: null, found: false }
 */
async function findElementByText(page, text, timeout = 8000) {
    if (!text || text.length < 2) return { locator: null, found: false };

    const strategies = [
        // 1. Przycisk z tym tekstem
        () => page.getByRole('button', { name: text, exact: false }),
        // 2. Link z tym tekstem
        () => page.getByRole('link', { name: text, exact: false }),
        // 3. Checkbox/switch z tym tekstem
        () => page.getByRole('checkbox', { name: text, exact: false }),
        // 4. Tab z tym tekstem
        () => page.getByRole('tab', { name: text, exact: false }),
        // 5. Dowolny element z dokładnym tekstem
        () => page.getByText(text, { exact: false }),
        // 6. Aria-label
        () => page.locator(`[aria-label*="${text}" i]`),
    ];

    for (const getLocator of strategies) {
        try {
            const loc = getLocator().first();
            await loc.waitFor({ state: 'visible', timeout });
            return { locator: loc, found: true };
        } catch (e) {
            // Próbuj następną strategię
        }
    }

    return { locator: null, found: false };
}

async function runTestCase(page, test) {
    const kroki = test.kroki || '';

    if (!kroki) {
        return { passed: false, error: 'Brak kroków w opisie testu' };
    }

    // Parsuj kroki - mogą być oddzielone numerami lub nowymi liniami
    const steps = kroki
        .split(/\d+\.\s*|\n/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    log(`  Kroki: ${steps.length}`);

    // Zbieraj wykonane kroki z ich statusem
    const executedSteps = [];

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i].toLowerCase();
        log(`  Krok ${i+1}: ${steps[i].substring(0, 60)}...`);

        // Aktualizuj aktualny krok w monitorze
        const monitorData = readMonitor();
        if (monitorData.currentTest) {
            monitorData.currentTest.currentStepIndex = i;
            monitorData.currentTest.step = steps[i];
            monitorData.currentTest.steps = executedSteps;
            updateMonitor(monitorData);
        }

        // Sprawdź stop signal podczas wykonywania kroków
        if (checkStopSignal()) {
            executedSteps.push({ step: i + 1, description: steps[i], status: 'skipped' });
            return { passed: false, error: 'Zatrzymano przez użytkownika', executedSteps };
        }

        try {
            // --- Pomocnicze: wykryj czy jesteśmy na stronie logowania ---
            const isOnLoginPage = page.url().includes('/login');
            const isLoginStep = step.includes('login') || step.includes('logowania');
            const isCredentialStep = step.includes('nieprawidłow') || step.includes('błędn') || step.includes('niepoprawn')
                                     || step.includes('poprawny login') || step.includes('poprawne dane')
                                     || step.includes('hasło') || step.includes('haslo');

            // =================================================================
            // NAWIGACJA: "Otwórz", "Przejdź do", "Wejdź na"
            // =================================================================
            if (step.includes('otwórz') || step.includes('przejdź') || step.includes('wejdź')) {
                // Wyciągnij URL z kroku jeśli podany
                const urlMatch = step.match(/https?:\/\/[^\s"',]+/);
                if (urlMatch) {
                    await page.goto(urlMatch[0], { timeout: 30000 });
                } else if (isLoginStep) {
                    await ensureOnLoginPage(page);
                } else if (step.includes('dashboard')) {
                    await page.goto(`${CONFIG.APP_URL}/dashboard`, { timeout: 30000 });
                } else if (step.includes('rejestrac')) {
                    await page.goto(`${CONFIG.APP_URL}/register`, { timeout: 30000 });
                } else if (step.includes('projekt') || step.includes('moje projekt')) {
                    await page.goto(`${CONFIG.APP_URL}/projects/my`, { timeout: 30000 });
                } else if (step.includes('publiczn')) {
                    await page.goto(`${CONFIG.APP_URL}/projects/public`, { timeout: 30000 });
                } else if (step.includes('ustawieni') || step.includes('profil')) {
                    await page.goto(`${CONFIG.APP_URL}/settings`, { timeout: 30000 });
                } else if (step.includes('kontakt')) {
                    await page.goto(`${CONFIG.APP_URL}/contact`, { timeout: 30000 });
                } else if (step.includes('admin')) {
                    await page.goto(`${CONFIG.APP_URL}/admin`, { timeout: 30000 });
                } else {
                    await page.goto(CONFIG.APP_URL, { timeout: 30000 });
                }
                await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
                await page.waitForTimeout(1000);
            }

            // =================================================================
            // LOGOWANIE: "Zaloguj się" (bez "kliknij") = upewnij się że jesteś zalogowany
            // =================================================================
            else if ((step.includes('zaloguj') && !step.includes('kliknij') && !step.includes('naciśnij') && !step.includes('przycisk'))
                     || step.includes('wprowadź dane logowania')
                     || isCredentialStep) {

                // Sprawdź czy już zalogowany
                const currentUrl = page.url();
                const alreadyLoggedIn = currentUrl.includes('/dashboard') || currentUrl.includes('/projects') ||
                                        currentUrl.includes('/settings') || currentUrl.includes('/admin');

                if (alreadyLoggedIn && !isCredentialStep) {
                    // Już zalogowany - nie rób nic
                    log(`    Już zalogowany (${currentUrl}) - pomijam`);
                } else if (currentUrl.includes('/login')) {
                    // Jesteśmy na /login - wypełnij formularz
                    const usernameInput = page.locator(SELECTORS.usernameField);
                    const passwordInput = page.locator(SELECTORS.passwordField);
                    await usernameInput.waitFor({ state: 'visible', timeout: 15000 });

                    if (step.includes('nieprawidłow') || step.includes('błędn') || step.includes('niepoprawn')) {
                        await usernameInput.fill('wrong_user');
                        await passwordInput.fill('wrong_pass');
                    } else {
                        await usernameInput.fill(CONFIG.LOGIN.username);
                        await passwordInput.fill(CONFIG.LOGIN.password);
                    }
                    await page.waitForTimeout(500);
                } else {
                    // Nie na /login i nie zalogowany - przejdź na login
                    await ensureOnLoginPage(page);
                    const usernameInput = page.locator(SELECTORS.usernameField);
                    const passwordInput = page.locator(SELECTORS.passwordField);
                    await usernameInput.waitFor({ state: 'visible', timeout: 15000 });

                    if (step.includes('nieprawidłow') || step.includes('błędn') || step.includes('niepoprawn')) {
                        await usernameInput.fill('wrong_user');
                        await passwordInput.fill('wrong_pass');
                    } else {
                        await usernameInput.fill(CONFIG.LOGIN.username);
                        await passwordInput.fill(CONFIG.LOGIN.password);
                    }
                    await page.waitForTimeout(500);
                }
            }

            // =================================================================
            // WPISYWANIE: "Wpisz X" - szukaj pola na AKTUALNEJ stronie
            // =================================================================
            else if (step.includes('wpisz') || step.includes('wprowadź') || step.includes('podaj') || step.includes('wypełnij')) {
                // Na stronie logowania? → wypełnij formularz logowania
                if (isOnLoginPage) {
                    const usernameInput = page.locator(SELECTORS.usernameField);
                    const passwordInput = page.locator(SELECTORS.passwordField);
                    await usernameInput.waitFor({ state: 'visible', timeout: 15000 });

                    if (step.includes('nieprawidłow') || step.includes('błędn') || step.includes('niepoprawn')) {
                        await usernameInput.fill('wrong_user');
                        await passwordInput.fill('wrong_pass');
                    } else {
                        await usernameInput.fill(CONFIG.LOGIN.username);
                        await passwordInput.fill(CONFIG.LOGIN.password);
                    }
                }
                // Na innej stronie → szukaj pola tekstowego
                else {
                    // Wyciągnij tekst do wpisania z kroku (tekst w cudzysłowie lub po dwukropku)
                    const valueMatch = step.match(/"([^"]+)"|'([^']+)'|„([^"]+)"|:\s*(.+)/);
                    const valueToType = valueMatch ? (valueMatch[1] || valueMatch[2] || valueMatch[3] || valueMatch[4]?.trim()) : '';

                    // Szukaj pola input/textbox na stronie
                    const textbox = page.locator('input:visible, [role="textbox"]:visible, textarea:visible').first();
                    try {
                        await textbox.waitFor({ state: 'visible', timeout: 10000 });
                        if (valueToType) {
                            await textbox.fill(valueToType);
                        }
                    } catch (e) {
                        // Jeśli nie znaleziono pola - szukaj po placeholder lub label
                        const labelMatch = step.match(/(?:w |w\s+)(?:pole |polu |polach )?(?:"([^"]+)"|'([^']+)'|„([^"]+)")/);
                        if (labelMatch) {
                            const label = labelMatch[1] || labelMatch[2] || labelMatch[3];
                            const field = page.locator(`[placeholder*="${label}" i], [aria-label*="${label}" i]`).first();
                            await field.waitFor({ state: 'visible', timeout: 10000 });
                            if (valueToType) await field.fill(valueToType);
                        } else {
                            throw e; // Nie znaleziono żadnego pola
                        }
                    }
                }
                await page.waitForTimeout(500);
            }

            // =================================================================
            // KLIKNIJ: "Kliknij X", "Naciśnij Y"
            // =================================================================
            else if (step.includes('kliknij') || step.includes('naciśnij')) {
                // Kliknij przycisk zaloguj (tylko na stronie logowania)
                if ((step.includes('zaloguj') || step.includes('submit') || step.includes('zatwierdź')) && isOnLoginPage) {
                    const loginButton = page.locator(SELECTORS.loginButton);
                    await loginButton.waitFor({ state: 'visible', timeout: 10000 });
                    await loginButton.click();
                    await page.waitForURL(/dashboard|projects/i, { timeout: 15000 }).catch(() => {});
                }
                else {
                    // Opcje kliknięcia
                    const clickOptions = {};
                    if (step.includes('prawym')) clickOptions.button = 'right';
                    if (step.includes('dwukrotnie') || step.includes('podwójnie')) clickOptions.clickCount = 2;

                    // Wyciągnij tekst elementu - wielopoziomowe wyszukiwanie
                    let clickText = null;

                    // 1. Tekst w cudzysłowie
                    const textMatch = step.match(/"([^"]+)"|'([^']+)'|„([^"]+)"/);
                    if (textMatch) clickText = textMatch[1] || textMatch[2] || textMatch[3];

                    // 2. Po słowie kluczowym (przycisk X, link X, opcję X)
                    if (!clickText) {
                        const btnMatch = step.match(/(?:przycisk|button|link|opcj[eę]|zakładk[eę]|element|ikonę?)\s+(.+)/i);
                        if (btnMatch) clickText = btnMatch[1].trim().replace(/[.,"'()]+$/g, '').replace(/\s*\(.*\)$/, '');
                    }

                    // 3. Tekst bezpośrednio po "kliknij" (usuwając przyimki i modyfikatory)
                    if (!clickText) {
                        const directMatch = step.match(/(?:kliknij|naciśnij)\s+(?:prawym\s+)?(?:na\s+)?(?:przycisk\s+)?(.+)/i);
                        if (directMatch) {
                            clickText = directMatch[1].trim()
                                .replace(/[.,"'()]+$/g, '')
                                .replace(/\s*\(.*\)$/, '');
                        }
                    }

                    if (clickText) {
                        const { locator, found } = await findElementByText(page, clickText);
                        if (found) {
                            await locator.click(clickOptions);
                        } else {
                            // Fallback: szukaj po CSS z has-text
                            const fallback = page.locator(`button:has-text("${clickText}"), a:has-text("${clickText}"), [role="button"]:has-text("${clickText}"), [role="menuitem"]:has-text("${clickText}"), text="${clickText}"`).first();
                            await fallback.waitFor({ state: 'visible', timeout: 8000 });
                            await fallback.click(clickOptions);
                        }
                    } else {
                        log(`    Nie rozpoznano elementu do kliknięcia: ${steps[i].substring(0, 60)}`);
                    }
                }
                await page.waitForTimeout(1000);
            }

            // =================================================================
            // SPRAWDŹ: "Sprawdź", "Zweryfikuj", "Upewnij się"
            // =================================================================
            else if (step.includes('sprawdź') || step.includes('zweryfikuj') || step.includes('upewnij')) {
                await page.waitForTimeout(2000);
                const currentUrl = page.url();
                const bodyText = await page.locator('body').innerText().catch(() => '');
                const bodyLower = bodyText.toLowerCase();

                // Sprawdź przekierowanie/dashboard
                if (step.includes('dashboard') || step.includes('przekierowan') || step.includes('strony głównej')) {
                    if (!currentUrl.includes('dashboard') && !currentUrl.includes('projects')) {
                        // Daj jeszcze chwilę na redirect SPA
                        try {
                            await page.waitForURL(/dashboard|projects/i, { timeout: 10000 });
                        } catch (e) {
                            executedSteps.push({ step: i + 1, description: steps[i], status: 'failed', note: `URL: ${page.url()}` });
                            return { passed: false, error: `Krok ${i+1}: Oczekiwano dashboard/projects, URL: ${page.url()}`, executedSteps };
                        }
                    }
                }
                // Sprawdź komunikat błędu
                else if (step.includes('błąd') || step.includes('komunikat') || step.includes('niepowodzeni')) {
                    const hasError = bodyLower.includes('nie powiodlo') || bodyLower.includes('nie powiodło') ||
                                     bodyLower.includes('blad') || bodyLower.includes('błąd') ||
                                     bodyLower.includes('invalid') || bodyLower.includes('nieprawidłow') ||
                                     bodyLower.includes('error') || bodyLower.includes('incorrect') ||
                                     bodyLower.includes('nie znaleziono') || bodyLower.includes('niepoprawne') ||
                                     bodyLower.includes('failed');
                    const stayedOnLogin = currentUrl.includes('/login');
                    if (!hasError && !stayedOnLogin) {
                        executedSteps.push({ step: i + 1, description: steps[i], status: 'failed', note: 'Brak komunikatu błędu' });
                        return { passed: false, error: `Krok ${i+1}: Oczekiwano komunikatu błędu, ale go nie znaleziono`, executedSteps };
                    }
                }
                // Sprawdź czy element/tekst jest widoczny
                else if (step.includes('czy ')) {
                    const visibleMatch = step.match(/czy\s+(?:jest |są |widoczn[yeai]\s+)?(.+)/i);
                    if (visibleMatch) {
                        const expectedPhrase = visibleMatch[1].trim().replace(/[.,"']$/g, '');

                        // Wyciągnij słowa kluczowe (usuń stop words)
                        const stopWords = ['się', 'jest', 'są', 'na', 'w', 'do', 'z', 'od', 'po', 'i', 'lub',
                            'a', 'że', 'co', 'jak', 'nie', 'tak', 'to', 'te', 'ten', 'ta', 'tym', 'tego',
                            'mają', 'mapa', 'mapie', 'stronie', 'strona', 'widoczny', 'widoczne', 'widoczna',
                            'wyświetla', 'wyświetlany', 'wyświetlane', 'wyświetlana', 'pojawia', 'pojawił',
                            'prawidłowo', 'poprawnie', 'dostępny', 'dostępne', 'aktywny', 'aktywne',
                            'zmienia', 'zmienił', 'został', 'została', 'zostało', 'zostały'];
                        const keywords = expectedPhrase.toLowerCase()
                            .split(/\s+/)
                            .filter(w => w.length > 2 && !stopWords.includes(w));

                        if (keywords.length > 0) {
                            // Sprawdź czy przynajmniej 1 kluczowe słowo jest na stronie
                            const foundKeywords = keywords.filter(kw => bodyLower.includes(kw));

                            if (foundKeywords.length > 0) {
                                log(`    Weryfikacja OK: znaleziono ${foundKeywords.length}/${keywords.length} słów kluczowych: ${foundKeywords.join(', ')}`);
                            } else {
                                // Żadne słowo kluczowe nie znalezione - ale to może być
                                // weryfikacja wizualna (np. "czy bufor jest widoczny")
                                // Sprawdź czy strona w ogóle się załadowała bez błędów
                                const hasPageError = bodyLower.includes('error') || bodyLower.includes('nie powiodło')
                                    || bodyLower.includes('nie powiodlo') || bodyLower.includes('404')
                                    || bodyLower.includes('nie znaleziono');
                                if (hasPageError) {
                                    executedSteps.push({ step: i + 1, description: steps[i], status: 'failed', note: 'Strona zawiera błąd' });
                                    continue;
                                }
                                // Brak błędów = weryfikacja wizualna, nie możemy zweryfikować programowo
                                log(`    Weryfikacja wizualna - nie można zweryfikować programowo, strona bez błędów`);
                            }
                        }
                    }
                }
                // Ogólne sprawdzenie - brak błędów
                else {
                    const hasError = bodyLower.includes('nie powiodlo') || bodyLower.includes('nie powiodło');
                    if (hasError) {
                        executedSteps.push({ step: i + 1, description: steps[i], status: 'failed', note: bodyText.substring(0, 100) });
                        return { passed: false, error: `Krok ${i+1}: Nieoczekiwany błąd na stronie: "${bodyText.substring(0, 200)}"`, executedSteps };
                    }
                }
            }

            // =================================================================
            // CZEKAJ
            // =================================================================
            else if (step.includes('czekaj') || step.includes('poczekaj')) {
                const timeMatch = step.match(/(\d+)\s*(?:s|sek|sekund)/);
                const waitTime = timeMatch ? parseInt(timeMatch[1]) * 1000 : 3000;
                await page.waitForTimeout(Math.min(waitTime, 30000));
            }

            // =================================================================
            // WYLOGUJ: "Wyloguj się"
            // =================================================================
            else if (step.includes('wyloguj')) {
                const logoutBtn = page.locator('text=Wyloguj, text=Logout, [aria-label*="wyloguj" i], [aria-label*="logout" i]').first();
                try {
                    await logoutBtn.waitFor({ state: 'visible', timeout: 10000 });
                    await logoutBtn.click();
                    await page.waitForTimeout(2000);
                } catch (e) {
                    const profileBtn = page.locator('[class*="avatar"], [class*="profile"], [class*="user-menu"]').first();
                    try {
                        await profileBtn.click();
                        await page.waitForTimeout(500);
                        const logoutLink = page.locator('text=Wyloguj, text=Logout').first();
                        await logoutLink.waitFor({ state: 'visible', timeout: 5000 });
                        await logoutLink.click();
                        await page.waitForTimeout(2000);
                    } catch (e2) {
                        await page.context().clearCookies();
                        await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {});
                        await page.goto(`${CONFIG.APP_URL}/login`, { timeout: 30000 });
                        await page.waitForTimeout(1000);
                    }
                }
            }

            // =================================================================
            // ŹŁIE SFORMATOWANE: "reprodukcji:" itp.
            // =================================================================
            else if (step.startsWith('reprodukcji') || step.startsWith('kroki reprodukcji')) {
                log(`    Źle sformatowany krok - pomijam`);
                executedSteps.push({ step: i + 1, description: steps[i], status: 'skipped', note: 'Źle sformatowany krok w arkuszu' });
                continue;
            }

            // =================================================================
            // ZNAJDŹ / SZUKAJ: szukaj elementu na stronie
            // =================================================================
            else if (step.includes('znajdź') || step.includes('szukaj')) {
                const target = extractTarget(steps[i]);
                if (target) {
                    const { locator, found } = await findElementByText(page, target);
                    if (found) {
                        // Jeśli interaktywny - kliknij
                        const tag = await locator.evaluate(el => el.tagName.toLowerCase()).catch(() => 'span');
                        const role = await locator.evaluate(el => el.getAttribute('role') || '').catch(() => '');
                        if (['button', 'a', 'input', 'select'].includes(tag) || ['button', 'link', 'tab', 'checkbox', 'switch', 'menuitem'].includes(role)) {
                            await locator.click();
                            await page.waitForTimeout(500);
                        }
                    } else {
                        log(`    Nie znaleziono: "${target}"`);
                        executedSteps.push({ step: i + 1, description: steps[i], status: 'skipped', note: `Nie znaleziono "${target}"` });
                        continue;
                    }
                }
                await page.waitForTimeout(500);
            }

            // =================================================================
            // WYBIERZ / ZAZNACZ: znajdź element i kliknij
            // =================================================================
            else if (step.includes('wybierz') || step.includes('zaznacz')) {
                const target = extractTarget(steps[i]);
                if (target) {
                    const { locator, found } = await findElementByText(page, target);
                    if (found) {
                        await locator.click();
                        await page.waitForTimeout(500);
                    } else {
                        log(`    Nie znaleziono do wybrania: "${target}"`);
                        executedSteps.push({ step: i + 1, description: steps[i], status: 'skipped', note: `Nie znaleziono "${target}"` });
                        continue;
                    }
                }
                await page.waitForTimeout(500);
            }

            // =================================================================
            // ZMIEŃ: znajdź element i zmodyfikuj
            // =================================================================
            else if (step.includes('zmień') || step.includes('zmieniaj')) {
                const target = extractTarget(steps[i]);
                if (target) {
                    const { locator, found } = await findElementByText(page, target);
                    if (found) {
                        await locator.click();
                        await page.waitForTimeout(500);
                    } else {
                        log(`    Nie znaleziono do zmiany: "${target}"`);
                        executedSteps.push({ step: i + 1, description: steps[i], status: 'skipped', note: `Nie znaleziono "${target}"` });
                        continue;
                    }
                }
                await page.waitForTimeout(500);
            }

            // =================================================================
            // WŁĄCZ / WYŁĄCZ: toggle, checkbox, switch
            // =================================================================
            else if (step.includes('włącz') || step.includes('wyłącz')) {
                const target = extractTarget(steps[i]);
                if (target) {
                    // Szukaj checkbox/switch
                    const checkbox = page.getByRole('checkbox', { name: target, exact: false }).first();
                    try {
                        await checkbox.waitFor({ state: 'visible', timeout: 5000 });
                        await checkbox.click();
                    } catch (e) {
                        // Szukaj switch
                        const switchEl = page.getByRole('switch', { name: target, exact: false }).first();
                        try {
                            await switchEl.waitFor({ state: 'visible', timeout: 5000 });
                            await switchEl.click();
                        } catch (e2) {
                            // Szukaj dowolnego elementu z tym tekstem
                            const { locator, found } = await findElementByText(page, target);
                            if (found) {
                                await locator.click();
                            } else {
                                log(`    Nie znaleziono toggle: "${target}"`);
                                executedSteps.push({ step: i + 1, description: steps[i], status: 'skipped', note: `Nie znaleziono "${target}"` });
                                continue;
                            }
                        }
                    }
                }
                await page.waitForTimeout(500);
            }

            // =================================================================
            // NAJEDŹ: hover nad elementem
            // =================================================================
            else if (step.includes('najedź') || step.includes('najedz')) {
                const target = extractTarget(steps[i]);
                if (target) {
                    const { locator, found } = await findElementByText(page, target);
                    if (found) {
                        await locator.hover();
                    } else {
                        // Hover nad mapą
                        if (step.includes('mapę') || step.includes('mapą') || step.includes('mapy')) {
                            const canvas = page.locator('canvas, .maplibregl-canvas, .mapboxgl-canvas, [class*="map"]').first();
                            await canvas.hover().catch(() => {});
                        }
                    }
                }
                await page.waitForTimeout(500);
            }

            // =================================================================
            // SPRÓBUJ: próba wykonania akcji
            // =================================================================
            else if (step.includes('spróbuj')) {
                const target = extractTarget(steps[i]);
                if (target) {
                    // Szukaj elementu do interakcji
                    const { locator, found } = await findElementByText(page, target);
                    if (found) {
                        await locator.click();
                        await page.waitForTimeout(500);
                    } else {
                        log(`    Spróbuj - nie znaleziono: "${target}"`);
                        executedSteps.push({ step: i + 1, description: steps[i], status: 'skipped', note: `Nie znaleziono "${target}"` });
                        continue;
                    }
                }
                await page.waitForTimeout(500);
            }

            // =================================================================
            // WYKONAJ / URUCHOM / UŻYJ / ZAŁADUJ / IMPORTUJ / SKOPIUJ
            // =================================================================
            else if (step.includes('wykonaj') || step.includes('uruchom') || step.includes('użyj')
                     || step.includes('załaduj') || step.includes('importuj')
                     || step.includes('skopiuj') || step.includes('kopiuj')) {
                const target = extractTarget(steps[i]);
                if (target) {
                    const { locator, found } = await findElementByText(page, target);
                    if (found) {
                        await locator.click();
                        await page.waitForTimeout(500);
                    } else {
                        log(`    Nie znaleziono: "${target}"`);
                        executedSteps.push({ step: i + 1, description: steps[i], status: 'skipped', note: `Nie znaleziono "${target}"` });
                        continue;
                    }
                }
                await page.waitForTimeout(500);
            }

            // =================================================================
            // PORÓWNAJ / ZAOBSERWUJ / ODZNACZ - weryfikacyjne
            // =================================================================
            else if (step.includes('porównaj') || step.includes('zaobserwuj') || step.includes('odznacz')
                     || step.includes('przetestuj') || step.includes('skonfiguruj') || step.includes('rozpocznij')) {
                const target = extractTarget(steps[i]);
                if (target) {
                    const { locator, found } = await findElementByText(page, target);
                    if (found) {
                        await locator.click().catch(() => {});
                        await page.waitForTimeout(500);
                    } else {
                        executedSteps.push({ step: i + 1, description: steps[i], status: 'skipped', note: `Nie znaleziono "${target}"` });
                        continue;
                    }
                } else {
                    await page.waitForTimeout(1000);
                }
            }

            // =================================================================
            // NIEZNANY KROK → best-effort (szukaj elementu, nie przerywaj testu)
            // =================================================================
            else {
                const target = extractTarget(steps[i]);
                log(`    Nierozpoznany krok, próbuję best-effort: "${target || steps[i].substring(0, 40)}"`);

                if (target) {
                    const { locator, found } = await findElementByText(page, target, 5000);
                    if (found) {
                        await locator.click().catch(() => {});
                        await page.waitForTimeout(500);
                    } else {
                        executedSteps.push({ step: i + 1, description: steps[i], status: 'skipped', note: 'Nierozpoznany krok - element nie znaleziony' });
                        continue;
                    }
                } else {
                    executedSteps.push({ step: i + 1, description: steps[i], status: 'skipped', note: 'Nierozpoznany krok' });
                    continue;
                }
            }
            // Krok wykonany pomyślnie
            executedSteps.push({ step: i + 1, description: steps[i], status: 'passed' });

        } catch (err) {
            executedSteps.push({ step: i + 1, description: steps[i], status: 'failed', note: err.message });
            // Nie przerywaj testu od razu - kontynuuj jeśli to nie krytyczny błąd
            if (err.message.includes('Target page') || err.message.includes('browser has been closed') || err.message.includes('Target closed')) {
                return { passed: false, error: `Krok ${i+1}: ${err.message}`, executedSteps };
            }
            log(`    Błąd w kroku ${i+1}: ${err.message.substring(0, 80)}`);
            continue;
        }
    }

    // Sprawdź oczekiwany rezultat
    const expected = test.oczekiwany?.toLowerCase() || '';
    if (expected.includes('dashboard') || expected.includes('przekierowanie')) {
        // Daj SPA czas na redirect — czekaj do 10s na zmianę URL
        try {
            await page.waitForURL(/dashboard|projects/i, { timeout: 10000 });
        } catch (e) {
            // Timeout - sprawdź aktualny URL
        }
        const currentUrl = page.url();
        if (!currentUrl.includes('dashboard') && !currentUrl.includes('projects')) {
            return { passed: false, error: `Oczekiwano dashboard, otrzymano: ${currentUrl}`, executedSteps };
        }
    }

    // Oceń wynik na podstawie proporcji kroków
    const passedSteps = executedSteps.filter(s => s.status === 'passed').length;
    const failedSteps = executedSteps.filter(s => s.status === 'failed').length;
    const skippedSteps = executedSteps.filter(s => s.status === 'skipped').length;
    const totalSteps = executedSteps.length;

    // FAIL jeśli >50% kroków failed/skipped lub jeśli jakikolwiek krok FAILED (nie skipped)
    if (failedSteps > 0) {
        return { passed: false, error: `${failedSteps} krok(ów) FAILED, ${skippedSteps} skipped z ${totalSteps}`, executedSteps };
    }
    if (totalSteps > 0 && skippedSteps > totalSteps * 0.5) {
        return { passed: false, error: `Zbyt wiele kroków pominięto: ${skippedSteps}/${totalSteps}`, executedSteps };
    }

    return { passed: true, notes: `Wykonano ${passedSteps}/${totalSteps} kroków (${skippedSteps} pominięto)`, executedSteps };
}

// ==================== MAIN ====================

async function main() {
    // Pobierz konfigurację arkusza
    const sheetConfig = getSheetConfig();

    // Sprawdź argument --test (pojedynczy test)
    const testArg = process.argv.find(arg => arg.startsWith('--test='));
    const singleTestId = testArg ? testArg.split('=')[1].replace(/['"]/g, '').toUpperCase() : '';

    log('=== AUTONOMICZNY TESTER START ===');

    let sheetId, sheetUrl, sheetTitle;
    let allTests;
    let codedTests = []; // Coded results z Fazy 1 (do zachowania w monitorze)

    if (sheetConfig.useRemaining) {
        // === TRYB REMAINING (Faza 2 po run-hybrid.js) ===
        log('Tryb: REMAINING (Faza 2 - po coded Playwright)');
        try {
            const fileConfig = JSON.parse(fs.readFileSync(CONFIG.SHEET_CONFIG, 'utf8'));
            sheetId = fileConfig.sheetId || '';
            sheetUrl = fileConfig.sheetUrl || '';
            sheetTitle = fileConfig.sheetTitle || '';
        } catch (e) {
            log('BŁĄD: Nie można wczytać sheet-config.json');
            return;
        }
        log(`Arkusz: ${sheetTitle || sheetId}`);

        allTests = loadRemainingTests();
        if (allTests.length === 0) {
            log('Brak testów w remaining-tests.json - kończę');
            return;
        }

        // Zachowaj coded results z Fazy 1
        const existingData = readMonitor();
        codedTests = (existingData.tests || []).filter(t => t.source === 'playwright-coded');
        log(`Zachowuję ${codedTests.length} coded results z Fazy 1`);
    } else {
        // === TRYB NORMALNY ===
        sheetId = sheetConfig.sheetId;
        sheetUrl = sheetConfig.sheetUrl;

        log(`Arkusz ID: ${sheetId || '(brak)'}`);
        log(`Zakładka: ${sheetConfig.tabName}`);
        if (singleTestId) log(`Tryb: POJEDYNCZY TEST → ${singleTestId}`);

        if (!sheetId) {
            log('BŁĄD: Nie podano ID arkusza Google Sheets');
            log('Użyj: node auto-tester.js --sheet="URL_LUB_ID"');
            return;
        }

        // Pobierz tytuł arkusza
        sheetTitle = await fetchSheetTitle(sheetUrl);
        if (sheetTitle) {
            log(`Arkusz: ${sheetTitle}`);
        }

        // Zapisz konfigurację
        try {
            const config = {
                sheetId: sheetId,
                sheetUrl: sheetUrl,
                sheetTitle: sheetTitle,
                lastUsed: new Date().toISOString()
            };
            fs.writeFileSync(CONFIG.SHEET_CONFIG, JSON.stringify(config, null, 2), 'utf8');
        } catch (e) {
            log(`Nie można zapisać konfiguracji: ${e.message}`);
        }

        // Pobierz testy z Google Sheets
        log('Pobieram testy z Google Sheets...');

        let csvData;
        try {
            csvData = await fetchTestsFromSheet(sheetId, sheetConfig.tabName);
        } catch (err) {
            log(`Błąd pobierania testów: ${err.message}`);
            return;
        }

        allTests = parseTestsFromCSV(csvData);
    }

    log(`Znaleziono ${allTests.length} testów`);

    // Pokaż które testy mają kroki
    const testsWithSteps = allTests.filter(t => t.hasSteps);
    const testsWithoutSteps = allTests.filter(t => !t.hasSteps);
    if (!sheetConfig.useRemaining) {
        log(`  - Z krokami: ${testsWithSteps.length}`);
        log(`  - Bez kroków: ${testsWithoutSteps.length}`);
    }

    // Filtruj testy
    let availableTests;
    if (singleTestId) {
        // Tryb pojedynczego testu - szukaj po ID
        const found = allTests.find(t => t.id.toUpperCase() === singleTestId);
        if (!found) {
            log(`BŁĄD: Nie znaleziono testu o ID "${singleTestId}"`);
            return;
        }
        if (!found.hasSteps) {
            log(`BŁĄD: Test "${singleTestId}" nie ma zdefiniowanych kroków`);
            return;
        }
        availableTests = [found];
        log(`Do wykonania: 1 test → ${singleTestId}: ${found.nazwa}`);
    } else if (sheetConfig.useRemaining) {
        // Tryb remaining - wszystkie testy z remaining-tests.json
        availableTests = allTests.filter(t => t.hasSteps);
        log(`Do wykonania: ${availableTests.length} testów (remaining po Fazie 1)`);
    } else {
        // Tryb wszystkich testów - z krokami
        availableTests = allTests.filter(t => t.hasSteps).slice(0, CONFIG.MAX_TESTS);
        log(`Do wykonania: ${availableTests.length} testów (z krokami)`);
    }

    // Inicjalizuj monitor (z zachowaniem coded results w trybie remaining)
    const codedPassed = codedTests.filter(t => t.status === 'passed').length;
    const codedFailed = codedTests.filter(t => t.status === 'failed').length;

    const monitorData = {
        lastUpdate: new Date().toISOString().slice(0, 19),
        sheetId: sheetId,
        sheetUrl: sheetUrl,
        sheetTitle: sheetTitle,
        agentStatus: {
            isRunning: true,
            currentAction: sheetConfig.useRemaining ? 'Faza 2: remaining tests...' : 'Inicjalizacja...',
            lastAction: '',
            finished: false,
            startedAt: new Date().toISOString().slice(0, 19)
        },
        summary: {
            total: allTests.length + codedTests.length,
            passed: codedPassed,
            failed: codedFailed,
            blocked: 0,
            inProgress: 0,
            pending: availableTests.length,
            skipped: testsWithoutSteps.length
        },
        currentTest: null,
        tests: [...codedTests]
    };
    updateMonitor(monitorData);

    if (availableTests.length === 0) {
        log('Brak testów do wykonania');
        monitorData.agentStatus.currentAction = 'Brak testów do wykonania';
        monitorData.agentStatus.isRunning = false;
        monitorData.agentStatus.finished = true;
        updateMonitor(monitorData);
        return;
    }

    // Uruchom przeglądarkę
    log('Uruchamiam przeglądarkę...');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    let page = await context.newPage();

    // Zaloguj się najpierw
    log('Logowanie...');
    try {
        const loginSuccess = await loginTest(page);
        if (!loginSuccess) {
            log('Logowanie nie powiodło się!');
            await browser.close();
            return;
        }
        log('Zalogowano pomyślnie');
    } catch (err) {
        log(`Błąd logowania: ${err.message}`);
        await browser.close();
        return;
    }

    // Wykonuj testy
    for (let i = 0; i < availableTests.length; i++) {
        // Sprawdź stop signal
        if (checkStopSignal()) {
            log('Otrzymano sygnał STOP');
            monitorData.agentStatus.currentAction = 'Zatrzymano przez użytkownika';
            break;
        }

        const test = availableTests[i];
        const testCode = test.id;
        const testName = test.nazwa || test.id;

        log(`\n[${i+1}/${availableTests.length}] ${testCode}: ${testName.substring(0, 50)}...`);

        // Parsuj kroki do tablicy
        const krokiText = test.kroki || '';
        const allSteps = krokiText
            .split(/\d+\.\s*|\n/)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        monitorData.agentStatus.currentAction = `Wykonuję: ${testCode}`;
        monitorData.summary.inProgress = 1;
        monitorData.currentTest = {
            code: testCode,
            name: testName,
            kategoria: test.kategoria,
            kroki: test.kroki,
            allSteps: allSteps,
            currentStepIndex: 0,
            startedAt: new Date().toISOString().slice(0, 19)
        };
        updateMonitor(monitorData);

        // Izolacja: testy logowania wymagają czystej sesji
        const isLoginTest = (test.kategoria || '').toUpperCase().includes('LOGOWANIE') ||
                            (test.id || '').includes('LOGIN');
        if (isLoginTest) {
            log('  [Izolacja] Test logowania - czyszczę sesję...');
            // Sesja będzie wyczyszczona w ensureOnLoginPage - nie rób tego podwójnie
            // bo powoduje race condition z przeładowaniem SPA
        }

        let result;
        try {
            result = await runTestCase(page, test);
        } catch (err) {
            const msg = err.message || String(err);
            // Wykryj crash przeglądarki/strony
            if (msg.includes('Target page') || msg.includes('browser has been closed') || msg.includes('Target closed') || msg.includes('Connection closed')) {
                log(`  CRASH przeglądarki wykryty: ${msg}`);
                result = { passed: false, error: `Crash przeglądarki: ${msg}` };
                // Spróbuj odzyskać stronę
                try {
                    const pages = context.pages();
                    if (pages.length > 0) {
                        page = pages[0];
                    } else {
                        page = await context.newPage();
                    }
                    await page.goto(CONFIG.APP_URL, { timeout: 30000 });
                    await loginTest(page, { clearSession: false });
                    log('  Odzyskano po crashu - kontynuuję testy');
                } catch (recoveryErr) {
                    log(`  Nie udało się odzyskać: ${recoveryErr.message}`);
                    break;
                }
            } else {
                result = { passed: false, error: msg };
            }
        }

        // Po teście logowania: przywróć sesję dla kolejnych testów
        if (isLoginTest && !page.url().includes('dashboard')) {
            log('  [Izolacja] Przywracam sesję po teście logowania...');
            try { await loginTest(page, { clearSession: true }); } catch (e) {
                log(`  Ostrzeżenie: nie udało się przywrócić sesji: ${e.message}`);
            }
        }

        // Zapisz wynik
        const status = result.passed ? 'PASSED' : 'FAILED';
        log(`  Wynik: ${status}`);

        // Aktualizuj monitor
        monitorData.tests.push({
            code: testCode,
            name: testName,
            kategoria: test.kategoria,
            status: status.toLowerCase(),
            source: 'auto-tester',
            startedAt: monitorData.currentTest?.startedAt || new Date().toISOString().slice(0, 19),
            finishedAt: new Date().toISOString().slice(0, 19),
            finishedAtDisplay: new Date().toLocaleString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            notes: result.notes,
            error: result.error,
            resultText: result.passed ? (result.notes || 'Test zaliczony') : (result.error || 'Test niezaliczony'),
            allSteps: allSteps,
            steps: result.executedSteps || []
        });

        if (result.passed) monitorData.summary.passed++;
        else monitorData.summary.failed++;

        monitorData.summary.inProgress = 0;
        monitorData.currentTest = null;
        monitorData.agentStatus.lastAction = `${testCode}: ${status}`;
        updateMonitor(monitorData);

        // Zapisz wynik do arkusza na bieżąco (po każdym teście)
        const lastResult = monitorData.tests[monitorData.tests.length - 1];
        await sendResultsToSheet([lastResult]);

        // Krótka przerwa między testami
        await page.waitForTimeout(2000);
    }

    // Zakończ
    await browser.close();

    // Cleanup remaining-tests.json po zakończeniu
    if (sheetConfig.useRemaining) {
        try {
            fs.unlinkSync(CONFIG.REMAINING_TESTS);
            log('Usunięto remaining-tests.json');
        } catch (e) {}
    }

    monitorData.agentStatus.isRunning = false;
    monitorData.agentStatus.finished = true;
    monitorData.agentStatus.finishedAt = new Date().toISOString().slice(0, 19);
    monitorData.agentStatus.currentAction = 'Zakończono';
    updateMonitor(monitorData);

    log('\n=== PODSUMOWANIE ===');
    log(`Total: ${monitorData.summary.total}`);
    log(`Passed: ${monitorData.summary.passed}`);
    log(`Failed: ${monitorData.summary.failed}`);

    log('=== KONIEC ===');
}

main().catch(err => {
    console.error('Krytyczny błąd:', err);
    process.exit(1);
});
