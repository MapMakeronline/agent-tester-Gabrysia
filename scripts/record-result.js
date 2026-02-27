/**
 * Helper do szybkiego zapisu wyniku testu
 *
 * Użycie:
 * node record-result.js <runId> <testCode> <status> [errorMessage] [screenshotPath]
 *
 * Przykłady:
 * node record-result.js 1 TC-LOGIN-001 passed
 * node record-result.js 1 TC-LOGIN-002 failed "Nie znaleziono przycisku logowania"
 * node record-result.js 1 TC-LOGIN-003 blocked "Wymaga plików testowych"
 */

const db = require('./db.js');

async function recordResult() {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.error('Użycie: node record-result.js <runId> <testCode> <status> [errorMessage] [screenshotPath]');
        console.error('Status: passed, failed, blocked, skipped');
        process.exit(1);
    }

    const [runId, testCode, status, errorMessage, screenshotPath] = args;

    // Walidacja statusu
    const validStatuses = ['passed', 'failed', 'blocked', 'skipped'];
    if (!validStatuses.includes(status)) {
        console.error(`Nieprawidłowy status: ${status}. Dozwolone: ${validStatuses.join(', ')}`);
        process.exit(1);
    }

    try {
        await db.connect();

        // Znajdź lub utwórz test case
        let testCase = await db.getTestCase(testCode);
        let testCaseId;

        if (!testCase) {
            // Utwórz nowy test case
            testCaseId = await db.addTestCase({
                code: testCode,
                name: testCode,
                category: extractCategory(testCode),
                priority: 'P2'
            });
            console.log(`Utworzono nowy test case: ${testCode} (ID: ${testCaseId})`);
        } else {
            testCaseId = testCase.id;
        }

        // Zapisz wynik
        const now = new Date().toISOString();
        await db.addTestResult({
            runId: parseInt(runId),
            testCaseId: testCaseId,
            status: status,
            startedAt: now,
            finishedAt: now,
            durationMs: 0,
            errorMessage: errorMessage || null,
            screenshotPath: screenshotPath || null,
            notes: null
        });

        console.log(`Zapisano wynik: ${testCode} = ${status.toUpperCase()}`);

        // Jeśli FAILED, sprawdź/dodaj known bug
        if (status === 'failed' && errorMessage) {
            const bugs = await db.getKnownBugsForTest(testCode);
            if (bugs.length === 0) {
                await db.addKnownBug({
                    testCaseCode: testCode,
                    description: errorMessage.substring(0, 100),
                    severity: 'medium',
                    status: 'open'
                });
                console.log(`Dodano nowy known bug dla: ${testCode}`);
            } else {
                console.log(`Known bug już istnieje dla: ${testCode}`);
            }
        }

        db.close();

        // Daj czas na zapis
        await new Promise(resolve => setTimeout(resolve, 100));

    } catch (err) {
        console.error('Błąd:', err.message || err);
        console.error(err.stack);
        process.exit(1);
    }
}

function extractCategory(testCode) {
    // TC-LOGIN-001 -> LOGIN
    // TC-PROJ-002 -> PROJ
    const match = testCode.match(/TC-([A-Z]+)-/);
    return match ? match[1] : 'UNKNOWN';
}

recordResult();
