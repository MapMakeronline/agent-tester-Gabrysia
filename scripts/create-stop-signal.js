/**
 * Tworzy plik stop-signal.txt aby zatrzymać agenta testera
 *
 * Użycie:
 * node create-stop-signal.js
 *
 * Agent sprawdza ten plik przed każdym testem i zatrzymuje się jeśli zawiera "STOP"
 */

const fs = require('fs');
const path = require('path');

const SIGNAL_FILE = path.join(__dirname, '..', 'monitor', 'stop-signal.txt');

function createStopSignal() {
    try {
        fs.writeFileSync(SIGNAL_FILE, 'STOP', 'utf8');
        console.log('Stop signal utworzony!');
        console.log(`Plik: ${SIGNAL_FILE}`);
        console.log('Agent zatrzyma się przed kolejnym testem.');
    } catch (err) {
        console.error('Błąd tworzenia stop signal:', err.message);
        process.exit(1);
    }
}

createStopSignal();
