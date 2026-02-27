/**
 * Prosty skrypt testowy używający Playwright
 * Użycie: node run-test.js --test=TC-BUG-006
 */

const { chromium } = require('playwright');

const TESTS = {
    'TC-BUG-006': {
        name: 'Problem z ładowaniem',
        row: 34,
        async run(page) {
            // Test: Sprawdź czy aplikacja ładuje się bez błędów
            const errors = [];
            page.on('pageerror', err => errors.push(err.message));
            page.on('console', msg => {
                if (msg.type() === 'error') errors.push(msg.text());
            });

            await page.goto('https://universe-mapmaker.web.app', { timeout: 30000 });
            await page.waitForLoadState('networkidle', { timeout: 30000 });

            // Sprawdź czy strona się załadowała
            const title = await page.title();
            if (!title) throw new Error('Strona nie ma tytułu');

            // Sprawdź czy nie ma krytycznych błędów
            const criticalErrors = errors.filter(e =>
                e.includes('TypeError') ||
                e.includes('ReferenceError') ||
                e.includes('SyntaxError')
            );

            if (criticalErrors.length > 0) {
                throw new Error('Błędy JS: ' + criticalErrors.join('; '));
            }

            return { passed: true, notes: `Strona załadowana. Tytuł: "${title}". Błędów krytycznych: 0` };
        }
    },
    'TC-LOGIN-001': {
        name: 'Logowanie poprawnymi danymi',
        row: 22,
        async run(page) {
            await page.goto('https://universe-mapmaker.web.app/login', { timeout: 60000 });
            await page.waitForLoadState('load');
            await page.waitForTimeout(3000); // Poczekaj na załadowanie React

            // Znajdź i wypełnij pole username
            const usernameInput = await page.locator('input').first();
            await usernameInput.fill('Mestwin');

            // Znajdź i wypełnij pole password
            const passwordInput = await page.locator('input[type="password"]');
            await passwordInput.fill('Kaktus,1');

            // Kliknij przycisk zaloguj
            const loginButton = await page.locator('button[type="submit"]');
            await loginButton.click();

            // Czekaj na przekierowanie (do 30 sekund)
            await page.waitForURL(/dashboard|projects|\/$/i, { timeout: 30000 });

            const url = page.url();
            if (url.includes('dashboard') || url.includes('projects') || url === 'https://universe-mapmaker.web.app/') {
                return { passed: true, notes: `Zalogowano pomyślnie. URL: ${url}` };
            } else {
                throw new Error(`Nieprawidłowe przekierowanie: ${url}`);
            }
        }
    }
};

async function runTest(testCode) {
    const test = TESTS[testCode];
    if (!test) {
        console.log(JSON.stringify({ error: `Nieznany test: ${testCode}` }));
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        const result = await test.run(page);
        console.log(JSON.stringify({
            success: true,
            code: testCode,
            name: test.name,
            row: test.row,
            status: result.passed ? 'PASSED' : 'FAILED',
            notes: result.notes
        }));
    } catch (err) {
        console.log(JSON.stringify({
            success: true,
            code: testCode,
            name: test.name,
            row: test.row,
            status: 'FAILED',
            error: err.message
        }));
    } finally {
        await browser.close();
    }
}

// Parse arguments
const args = process.argv.slice(2);
const testArg = args.find(a => a.startsWith('--test='));
if (!testArg) {
    console.log('Użycie: node run-test.js --test=TC-XXX-000');
    console.log('Dostępne testy:', Object.keys(TESTS).join(', '));
    process.exit(1);
}

const testCode = testArg.split('=')[1];
runTest(testCode);
