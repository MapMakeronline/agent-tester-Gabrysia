/**
 * Shared logger — single log() implementation for all scripts.
 */

function log(msg) {
    const time = new Date().toLocaleTimeString('pl-PL');
    console.log(`[${time}] ${msg}`);
}

module.exports = { log };
