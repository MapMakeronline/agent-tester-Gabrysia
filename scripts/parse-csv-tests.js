const fs = require('fs');
const path = require('path');

const csvPath = path.join(process.env.USERPROFILE, '.playwright-mcp', 'data.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');

// Parse CSV - handle quoted fields with newlines
function parseCSV(text) {
  const lines = [];
  let currentLine = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && !insideQuotes) {
      insideQuotes = true;
    } else if (char === '"' && insideQuotes) {
      if (nextChar === '"') {
        currentField += '"';
        i++; // skip next quote
      } else {
        insideQuotes = false;
      }
    } else if (char === ',' && !insideQuotes) {
      currentLine.push(currentField);
      currentField = '';
    } else if (char === '\n' && !insideQuotes) {
      currentLine.push(currentField);
      lines.push(currentLine);
      currentLine = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField);
    lines.push(currentLine);
  }

  return lines;
}

const lines = parseCSV(csvContent);
const header = lines[0];

// Find column indices
const colID = 0;
const colCategory = 1;
const colName = 2;
const colSteps = 3;
const colRequirements = 4;
const colExpected = 5;
const colStatus = 6;

const tests = [];

// Start from line 1 (skip header at line 0)
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  const id = line[colID] || '';
  const category = line[colCategory] || '';
  const name = line[colName] || '';
  const steps = line[colSteps] || '';
  const requirements = line[colRequirements] || '';
  const expected = line[colExpected] || '';
  const status = line[colStatus] || '';

  // Only include tests with non-empty steps
  if (steps.trim()) {
    // Parse steps into array
    const stepsArray = steps.split('\n').map(s => s.trim()).filter(s => s);

    tests.push({
      row: i + 1, // CSV line index + 1 = sheet row (line 0 is header = row 1, line 1 = row 2)
      id: id,
      category: category,
      name: name,
      steps: stepsArray,
      requirements: requirements,
      expected: expected,
      status: status
    });
  }
}

console.log(JSON.stringify({
  sheetId: '1wFlv0KrT4JNTXAnGO4mwtDXPkh2dIxQzfM0VCXxA1jA',
  sheetTitle: 'Testy_Lista',
  totalTests: tests.length,
  tests: tests
}, null, 2));
