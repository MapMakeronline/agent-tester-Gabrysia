// Filter test queue - removes completed tests
// Usage: node filter-queue.js

const fs = require('fs');
const path = require('path');

// Load queue
const queuePath = path.join(__dirname, '..', 'data', 'tests-queue.json');
const queue = JSON.parse(fs.readFileSync(queuePath));
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

console.log('Original queue: ' + queue.tests.length + ' tests');
console.log('Filtering...');

// For now, just output the queue as-is
// Agent will check completed status for each test during iteration

// Write index file to track progress
const state = {
  total: queue.tests.length,
  currentIndex: 0,
  today: today,
  startedAt: new Date().toISOString()
};

const statePath = path.join(__dirname, '..', 'data', 'test-state.json');
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log('State initialized: ' + state.total + ' tests to process');
console.log('Starting index: 0');
