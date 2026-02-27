/**
 * Zarządza stanem sesji testowej
 *
 * Komendy:
 *   node session-manager.js status             - pokaż stan sesji
 *   node session-manager.js start CATEGORY     - rozpocznij nową sesję dla kategorii
 *   node session-manager.js complete TEST_ID   - oznacz test jako wykonany
 *   node session-manager.js remaining          - pokaż pozostałe testy
 *   node session-manager.js reset              - wyczyść sesję
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'data', 'session-state.json');
const QUEUE_FILE = path.join(__dirname, '..', 'data', 'tests-queue.json');

function readState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {
        return {
            sessionId: null,
            startedAt: null,
            category: null,
            totalTests: 0,
            completedTests: [],
            status: 'idle'
        };
    }
}

function writeState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function readQueue() {
    try {
        return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    } catch {
        return { tests: [] };
    }
}

const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
    case 'status': {
        const state = readState();
        const queue = readQueue();
        const remaining = queue.tests?.filter(t => !state.completedTests.includes(t.id)) || [];

        console.log(JSON.stringify({
            status: state.status,
            category: state.category,
            totalTests: state.totalTests,
            completedCount: state.completedTests.length,
            remainingCount: remaining.length,
            isFinished: remaining.length === 0 && state.totalTests > 0
        }));
        break;
    }

    case 'start': {
        if (!arg) {
            console.error('Użycie: node session-manager.js start CATEGORY');
            process.exit(1);
        }
        const state = readState();
        state.sessionId = Date.now().toString(36);
        state.startedAt = new Date().toISOString();
        state.category = arg;
        state.completedTests = [];
        state.status = 'running';
        writeState(state);
        console.log(JSON.stringify({ action: 'started', sessionId: state.sessionId }));
        break;
    }

    case 'complete': {
        if (!arg) {
            console.error('Użycie: node session-manager.js complete TEST_ID');
            process.exit(1);
        }
        const state = readState();
        if (!state.completedTests.includes(arg)) {
            state.completedTests.push(arg);
            writeState(state);
        }
        console.log(JSON.stringify({
            action: 'completed',
            testId: arg,
            totalCompleted: state.completedTests.length
        }));
        break;
    }

    case 'remaining': {
        const state = readState();
        const queue = readQueue();
        const remaining = queue.tests?.filter(t => !state.completedTests.includes(t.id)) || [];
        console.log(JSON.stringify({
            count: remaining.length,
            tests: remaining.slice(0, 20) // max 20 dla czytelności
        }));
        break;
    }

    case 'set-total': {
        const state = readState();
        state.totalTests = parseInt(arg) || 0;
        writeState(state);
        console.log(JSON.stringify({ action: 'set-total', totalTests: state.totalTests }));
        break;
    }

    case 'set-category': {
        const state = readState();
        state.category = arg;
        writeState(state);
        console.log(JSON.stringify({ action: 'set-category', category: arg }));
        break;
    }

    case 'finish': {
        const state = readState();
        state.status = 'finished';
        writeState(state);
        console.log(JSON.stringify({ action: 'finished' }));
        break;
    }

    case 'reset': {
        writeState({
            sessionId: null,
            startedAt: null,
            category: null,
            totalTests: 0,
            completedTests: [],
            status: 'idle'
        });
        console.log(JSON.stringify({ action: 'reset' }));
        break;
    }

    default:
        console.log(`
Zarządzanie sesją testową

Komendy:
  status            - pokaż stan sesji
  start CATEGORY    - rozpocznij sesję dla kategorii
  complete TEST_ID  - oznacz test jako wykonany
  remaining         - pokaż pozostałe testy
  set-total N       - ustaw liczbę testów
  set-category      - ustaw nazwę kategorii
  finish            - oznacz sesję jako zakończoną
  reset             - wyczyść sesję
`);
}
