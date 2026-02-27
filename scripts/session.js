/**
 * Helper do zarządzania sesjami testowymi
 *
 * Użycie:
 * node session.js start [mode]     - Rozpocznij nową sesję
 * node session.js end <runId> <total> <passed> <failed> <blocked> [notes]
 * node session.js status <runId>   - Pokaż status sesji
 * node session.js stats            - Pokaż globalne statystyki
 */

const db = require('./db.js');

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        showHelp();
        process.exit(1);
    }

    try {
        await db.connect();

        switch (command) {
            case 'start':
                await startSession(args[1] || 'smart');
                break;
            case 'end':
                await endSession(args.slice(1));
                break;
            case 'status':
                await showSessionStatus(args[1]);
                break;
            case 'stats':
                await showStats();
                break;
            default:
                console.error(`Nieznana komenda: ${command}`);
                showHelp();
                process.exit(1);
        }

        db.close();

    } catch (err) {
        console.error('Błąd:', err.message);
        process.exit(1);
    }
}

async function startSession(mode) {
    const run = await db.startTestRun({ mode, source: 'cli' });
    console.log(`Sesja rozpoczęta!`);
    console.log(`RUN_ID=${run.id}`);
    console.log(`SESSION_ID=${run.sessionId}`);
    console.log(`\nUżyj RUN_ID do zapisywania wyników:`);
    console.log(`  node record-result.js ${run.id} TC-XXX-001 passed`);
    console.log(`  node record-result.js ${run.id} TC-XXX-002 failed "Opis błędu"`);
}

async function endSession(args) {
    if (args.length < 5) {
        console.error('Użycie: node session.js end <runId> <total> <passed> <failed> <blocked> [notes]');
        process.exit(1);
    }

    const [runId, total, passed, failed, blocked, ...notesArr] = args;
    const notes = notesArr.join(' ') || null;

    await db.endTestRun(parseInt(runId), {
        total: parseInt(total),
        passed: parseInt(passed),
        failed: parseInt(failed),
        blocked: parseInt(blocked),
        notes: notes
    });

    console.log(`Sesja ${runId} zakończona!`);
    console.log(`  Total: ${total}`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Blocked: ${blocked}`);
    if (notes) console.log(`  Notes: ${notes}`);
}

async function showSessionStatus(runId) {
    if (!runId) {
        console.error('Użycie: node session.js status <runId>');
        process.exit(1);
    }

    const run = await db.getTestRun(parseInt(runId));
    if (!run) {
        console.error(`Nie znaleziono sesji: ${runId}`);
        process.exit(1);
    }

    console.log(`\n=== Sesja ${run.id} ===`);
    console.log(`Session ID: ${run.session_id}`);
    console.log(`Status: ${run.status}`);
    console.log(`Started: ${run.started_at}`);
    console.log(`Finished: ${run.finished_at || 'W trakcie...'}`);
    console.log(`\nStatystyki:`);
    console.log(`  Total: ${run.total_tests}`);
    console.log(`  Passed: ${run.passed}`);
    console.log(`  Failed: ${run.failed}`);
    console.log(`  Blocked: ${run.blocked}`);
    console.log(`  Skipped: ${run.skipped}`);

    if (run.notes) {
        console.log(`\nNotatki: ${run.notes}`);
    }

    // Pokaż wyniki testów
    const results = await db.getResultsForRun(parseInt(runId));
    if (results.length > 0) {
        console.log(`\nWyniki testów (${results.length}):`);
        results.forEach(r => {
            const icon = r.status === 'passed' ? '✅' :
                        r.status === 'failed' ? '❌' :
                        r.status === 'blocked' ? '🚫' : '⏭️';
            console.log(`  ${icon} ${r.code}: ${r.status.toUpperCase()}${r.error_message ? ' - ' + r.error_message : ''}`);
        });
    }
}

async function showStats() {
    const stats = await db.getStats();

    console.log(`\n=== Statystyki globalne ===`);
    console.log(`Test cases: ${stats.testCases}`);
    console.log(`Sesje testowe: ${stats.testRuns}`);
    console.log(`Wyniki testów: ${stats.totalResults}`);
    console.log(`Otwarte bugi: ${stats.openBugs}`);

    if (Object.keys(stats.resultsByStatus).length > 0) {
        console.log(`\nWyniki wg statusu:`);
        Object.entries(stats.resultsByStatus).forEach(([status, count]) => {
            const icon = status === 'passed' ? '✅' :
                        status === 'failed' ? '❌' :
                        status === 'blocked' ? '🚫' : '⏭️';
            console.log(`  ${icon} ${status}: ${count}`);
        });
    }

    // Oblicz pass rate
    const total = stats.totalResults;
    const passed = stats.resultsByStatus['passed'] || 0;
    if (total > 0) {
        const passRate = ((passed / total) * 100).toFixed(1);
        console.log(`\nPass rate: ${passRate}%`);
    }
}

function showHelp() {
    console.log(`
Zarządzanie sesjami testowymi

Użycie:
  node session.js start [mode]     - Rozpocznij nową sesję (mode: smart, full, p1)
  node session.js end <runId> <total> <passed> <failed> <blocked> [notes]
  node session.js status <runId>   - Pokaż status sesji
  node session.js stats            - Pokaż globalne statystyki

Przykłady:
  node session.js start smart
  node session.js end 1 10 7 2 1 "Sesja zakończona pomyślnie"
  node session.js status 1
  node session.js stats
`);
}

main();
