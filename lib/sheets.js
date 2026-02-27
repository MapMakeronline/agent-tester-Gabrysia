/**
 * Google Sheets helpers — fetch CSV, parse tests, make API requests.
 */

const https = require('https');
const url = require('url');
const { parseCSV } = require('./csv');

/**
 * Fetch CSV data from a public Google Sheet.
 * Handles one redirect (Google often 302s).
 * Detects non-public sheets (HTML response).
 */
function fetchCSV(sheetId, sheetName) {
    let csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    if (sheetName) {
        csvUrl += `&sheet=${encodeURIComponent(sheetName)}`;
    }

    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(csvUrl);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: { 'Accept': 'text/csv' }
        };

        function handleResponse(res) {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (data.trimStart().startsWith('<!DOCTYPE') || data.trimStart().startsWith('<html')) {
                    reject(new Error('Arkusz nie jest publiczny! Udostępnij go jako "Każdy kto ma link > Przeglądający"'));
                    return;
                }
                resolve(data);
            });
        }

        const req = https.request(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location);
                const redirectOptions = {
                    hostname: redirectUrl.hostname,
                    path: redirectUrl.pathname + redirectUrl.search,
                    method: 'GET',
                    headers: { 'Accept': 'text/csv' }
                };
                const redirectReq = https.request(redirectOptions, handleResponse);
                redirectReq.on('error', reject);
                redirectReq.end();
                return;
            }
            handleResponse(res);
        });

        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

/**
 * Parse test list from CSV rows.
 * Returns array of { id, rowIndex, kategoria, nazwa, kroki, hasSteps, wymogi, oczekiwany }.
 * Optional extra columns (status, wynik) are included when present.
 */
function parseSheetTests(csvData, { includeStatus = false } = {}) {
    const rows = parseCSV(csvData);
    if (rows.length < 2) return [];

    const header = rows[0].map(h => h.toLowerCase().trim());
    const tests = [];
    const seenIds = new Set();

    const colMap = {
        id: header.findIndex(h => h === 'id' || h.includes('id')),
        kategoria: header.findIndex(h => h === 'kategoria' || h.includes('kategor')),
        nazwa: header.findIndex(h => h === 'nazwa testu' || h.includes('nazwa')),
        kroki: header.findIndex(h => h === 'kroki' || h.includes('krok')),
        wymogi: header.findIndex(h => h === 'wymogi' || h.includes('wymog') || h.includes('warun')),
        oczekiwany: header.findIndex(h => h === 'oczekiwany rezultat' || h.includes('oczekiwan')),
        status: header.findIndex(h => h === 'status'),
        wynik: header.findIndex(h => h === 'wynik'),
    };

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0 || row.every(cell => !cell || !cell.trim())) continue;

        const id = colMap.id >= 0 ? row[colMap.id]?.trim() : '';
        if (!id || !id.startsWith('TC-')) continue;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const kroki = colMap.kroki >= 0 ? row[colMap.kroki]?.trim() : '';

        const test = {
            id,
            rowIndex: i + 1,
            kategoria: colMap.kategoria >= 0 ? row[colMap.kategoria]?.trim() : '',
            nazwa: colMap.nazwa >= 0 ? row[colMap.nazwa]?.trim() : '',
            kroki,
            hasSteps: kroki.length > 0,
            wymogi: colMap.wymogi >= 0 ? row[colMap.wymogi]?.trim() : '',
            oczekiwany: colMap.oczekiwany >= 0 ? row[colMap.oczekiwany]?.trim() : '',
        };

        if (includeStatus) {
            test.status = colMap.status >= 0 ? row[colMap.status]?.trim().toUpperCase() : 'PENDING';
            test.wynik = colMap.wynik >= 0 ? row[colMap.wynik]?.trim() : '';
        }

        tests.push(test);
    }

    return tests;
}

/**
 * Make a GET request to Google Apps Script Web App.
 * Handles one redirect (Apps Script always redirects).
 */
function makeGoogleRequest(apiUrl, params) {
    return new Promise((resolve, reject) => {
        const queryString = new URLSearchParams(params).toString();
        const fullUrl = `${apiUrl}?${queryString}`;
        const parsedUrl = new url.URL(fullUrl);

        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        };

        function handleResponse(res) {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve({ raw: data }); }
            });
        }

        const req = https.request(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new url.URL(res.headers.location);
                const redirectOptions = {
                    hostname: redirectUrl.hostname,
                    path: redirectUrl.pathname + redirectUrl.search,
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                };
                const redirectReq = https.request(redirectOptions, handleResponse);
                redirectReq.on('error', reject);
                redirectReq.end();
                return;
            }
            handleResponse(res);
        });

        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
        req.end();
    });
}

module.exports = { fetchCSV, parseSheetTests, makeGoogleRequest };
