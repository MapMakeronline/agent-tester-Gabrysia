/**
 * Google Sheets API dla Agent Tester
 *
 * Łączy się z arkuszem Google przez Apps Script Web App
 *
 * Użycie:
 *   node google-sheets-api.js getTests
 *   node google-sheets-api.js getTests --category=LOGOWANIE
 *   node google-sheets-api.js getStats
 *   node google-sheets-api.js updateTest --row=5 --column="Completed At" --value="2026-02-05"
 *   node google-sheets-api.js addResult --row=5 --status=PASSED --notes="Test zaliczony"
 */

const https = require('https');
const url = require('url');

// URL do Google Apps Script Web App
const API_URL = 'https://script.google.com/macros/s/AKfycbzV0LbIFePBoARK0iRfH_k90Hu9LEhG1hvW-vYyBZB7uvR4t19PYYYVu5KSXJG1npVwhQ/exec';

function makeRequest(params) {
    return new Promise((resolve, reject) => {
        const queryString = new URLSearchParams(params).toString();
        const fullUrl = `${API_URL}?${queryString}`;

        const parsedUrl = new url.URL(fullUrl);

        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            // Handle redirects (Google Apps Script often redirects)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new url.URL(res.headers.location);
                const redirectOptions = {
                    hostname: redirectUrl.hostname,
                    path: redirectUrl.pathname + redirectUrl.search,
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                };

                const redirectReq = https.request(redirectOptions, (redirectRes) => {
                    let redirectData = '';
                    redirectRes.on('data', chunk => redirectData += chunk);
                    redirectRes.on('end', () => {
                        try {
                            resolve(JSON.parse(redirectData));
                        } catch (e) {
                            resolve({ raw: redirectData });
                        }
                    });
                });

                redirectReq.on('error', reject);
                redirectReq.end();
                return;
            }

            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ raw: data });
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function getTests(category = null) {
    const params = { action: 'getTests' };
    if (category) params.category = category;
    return await makeRequest(params);
}

async function getStats() {
    return await makeRequest({ action: 'getStats' });
}

async function updateTest(row, column, value) {
    return await makeRequest({
        action: 'updateTest',
        row: row,
        column: column,
        value: value
    });
}

async function addResult(row, status, notes) {
    const now = new Date().toISOString().slice(0, 10);

    // Aktualizuj datę ukończenia jeśli PASSED
    if (status === 'PASSED') {
        await updateTest(row, 'Completed At', now);
    }

    // Aktualizuj Last Modified
    await updateTest(row, 'Last Modified', now);

    // Dodaj notatki o wyniku testu
    const resultNote = `[${now}] ${status}: ${notes || ''}`;
    return await updateTest(row, 'Notes', resultNote);
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    // Parse named arguments
    const params = {};
    args.slice(1).forEach(arg => {
        if (arg.startsWith('--')) {
            const [key, value] = arg.slice(2).split('=');
            params[key] = value;
        }
    });

    try {
        let result;

        switch (command) {
            case 'getTests':
                result = await getTests(params.category);
                break;

            case 'getStats':
                result = await getStats();
                break;

            case 'updateTest':
                if (!params.row || !params.column) {
                    console.error('Usage: node google-sheets-api.js updateTest --row=N --column="Column Name" --value="Value"');
                    process.exit(1);
                }
                result = await updateTest(params.row, params.column, params.value || '');
                break;

            case 'addResult':
                if (!params.row || !params.status) {
                    console.error('Usage: node google-sheets-api.js addResult --row=N --status=PASSED|FAILED --notes="..."');
                    process.exit(1);
                }
                result = await addResult(params.row, params.status, params.notes);
                break;

            default:
                console.log(`
Google Sheets API dla Agent Tester

Komendy:
  getTests                          Pobierz wszystkie testy
  getTests --category=LOGOWANIE     Pobierz testy z kategorii
  getStats                          Pobierz statystyki
  updateTest --row=N --column="X" --value="Y"   Aktualizuj komórkę
  addResult --row=N --status=PASSED --notes="..." Zapisz wynik testu

Przykłady:
  node google-sheets-api.js getStats
  node google-sheets-api.js getTests --category=NAV
  node google-sheets-api.js addResult --row=5 --status=PASSED --notes="Dashboard widoczny"
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
