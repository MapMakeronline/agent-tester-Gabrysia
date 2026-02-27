/**
 * Google Sheets API dla Agent Tester
 *
 * Uses Sheets API v4 via service account (lib/sheets-writer.js).
 *
 * Uzycie:
 *   node google-sheets-api.js getTests
 *   node google-sheets-api.js getTests --category=LOGOWANIE
 *   node google-sheets-api.js updateTest --row=5 --column=G --value="PASSED"
 *   node google-sheets-api.js addResult --row=5 --status=PASSED --notes="Test zaliczony"
 *   node google-sheets-api.js readRange --range="Arkusz1!A1:I10"
 */

const sheetsWriter = require('../lib/sheets-writer');
const { fetchCSV, parseSheetTests } = require('../lib/sheets');

async function getTests(category = null) {
    const config = require('../config/sheet-config.json');
    const csv = await fetchCSV(config.sheetId, config.tabName || 'Arkusz1');
    const tests = parseSheetTests(csv, { includeStatus: true });
    if (category) {
        const upper = category.toUpperCase();
        return tests.filter(t => t.kategoria.toUpperCase().includes(upper));
    }
    return tests;
}

async function updateTest(row, column, value) {
    const ok = await sheetsWriter.updateCell(parseInt(row), column, value);
    return { success: ok, row, column, value };
}

async function addResult(row, status, notes) {
    const now = new Date().toLocaleString('pl-PL');
    const resultText = `[${status}] ${notes || ''}`;

    const { written, errors } = await sheetsWriter.batchUpdateResults([{
        code: `row-${row}`,
        status,
        resultText,
        finishedAtDisplay: now,
        source: 'google-sheets-api',
    }], { [`row-${row}`]: parseInt(row) });

    return { success: written > 0, written, errors };
}

async function readRange(range) {
    return await sheetsWriter.readRange(range);
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    // Parse named arguments
    const params = {};
    args.slice(1).forEach(arg => {
        if (arg.startsWith('--')) {
            const eqIdx = arg.indexOf('=');
            if (eqIdx > 0) {
                params[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
            } else {
                params[arg.slice(2)] = true;
            }
        }
    });

    try {
        let result;

        switch (command) {
            case 'getTests':
                result = await getTests(params.category);
                break;

            case 'updateTest':
                if (!params.row || !params.column) {
                    console.error('Usage: node google-sheets-api.js updateTest --row=N --column=G --value="Value"');
                    process.exit(1);
                }
                result = await updateTest(params.row, params.column, params.value || '');
                break;

            case 'addResult':
                if (!params.row || !params.status) {
                    console.error('Usage: node google-sheets-api.js addResult --row=N --status=PASSED --notes="..."');
                    process.exit(1);
                }
                result = await addResult(params.row, params.status, params.notes);
                break;

            case 'readRange':
                if (!params.range) {
                    console.error('Usage: node google-sheets-api.js readRange --range="Arkusz1!A1:I10"');
                    process.exit(1);
                }
                result = await readRange(params.range);
                break;

            default:
                console.log(`
Google Sheets API dla Agent Tester (Sheets API v4)

Komendy:
  getTests                          Pobierz wszystkie testy (CSV)
  getTests --category=LOGOWANIE     Pobierz testy z kategorii
  updateTest --row=N --column=G --value="Y"   Aktualizuj komorke
  addResult --row=N --status=PASSED --notes="..." Zapisz wynik testu
  readRange --range="Arkusz1!A1:I10"  Odczytaj zakres

Przyklady:
  node google-sheets-api.js getTests --category=NAV
  node google-sheets-api.js updateTest --row=5 --column=G --value=PASSED
  node google-sheets-api.js addResult --row=5 --status=PASSED --notes="Dashboard widoczny"
  node google-sheets-api.js readRange --range="Arkusz1!G2:I10"
`);
                process.exit(0);
        }

        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}

main();
