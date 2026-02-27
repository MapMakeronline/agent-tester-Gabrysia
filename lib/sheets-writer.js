/**
 * Google Sheets API v4 Writer - JWT auth via service account.
 *
 * Replaces all Apps Script webhook calls with direct Sheets API v4.
 * Zero external dependencies - uses Node.js built-in crypto + https.
 *
 * Usage:
 *   const { batchUpdateResults, updateCell, readRange } = require('./sheets-writer');
 *   await batchUpdateResults(results, rowMap);
 *   await updateCell(5, 'G', 'PASSED');
 *   const data = await readRange('Arkusz1!A1:I200');
 */

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ==================== CONFIG ====================

const CONFIG_DIR = path.resolve(__dirname, '..', 'config');
const SA_PATH = process.env.SHEETS_SA_PATH || path.join(CONFIG_DIR, 'sheets-service-account.json');
const SHEET_CONFIG_PATH = path.join(CONFIG_DIR, 'sheet-config.json');

let _saCredentials = null;
let _sheetConfig = null;
let _tokenCache = { token: null, expiresAt: 0 };

function loadServiceAccount() {
    if (_saCredentials) return _saCredentials;
    _saCredentials = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
    return _saCredentials;
}

function loadSheetConfig() {
    if (_sheetConfig) return _sheetConfig;
    try {
        _sheetConfig = JSON.parse(fs.readFileSync(SHEET_CONFIG_PATH, 'utf8'));
    } catch {
        _sheetConfig = {
            sheetId: '1wFlv0KrT4JNTXAnGO4mwtDXPkh2dIxQzfM0VCXxA1jA',
            tabName: 'Arkusz1',
        };
    }
    return _sheetConfig;
}

// ==================== JWT AUTH ====================

function base64url(buf) {
    return buf.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Create a signed JWT and exchange it for a Google OAuth2 access token.
 * Caches the token for 50 minutes (tokens are valid for 60 min).
 */
async function getAccessToken() {
    const now = Math.floor(Date.now() / 1000);

    // Return cached token if still valid
    if (_tokenCache.token && _tokenCache.expiresAt > now + 60) {
        return _tokenCache.token;
    }

    const sa = loadServiceAccount();

    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    };

    const segments = [
        base64url(Buffer.from(JSON.stringify(header))),
        base64url(Buffer.from(JSON.stringify(payload))),
    ];

    const signingInput = segments.join('.');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = sign.sign(sa.private_key);
    segments.push(base64url(signature));

    const jwt = segments.join('.');

    // Exchange JWT for access token
    const tokenData = await httpRequest('POST', 'oauth2.googleapis.com', '/token', null, {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
    });

    const parsed = JSON.parse(tokenData);
    if (!parsed.access_token) {
        throw new Error(`JWT token exchange failed: ${tokenData}`);
    }

    _tokenCache = {
        token: parsed.access_token,
        expiresAt: now + (parsed.expires_in || 3600) - 600, // 10 min buffer
    };

    return _tokenCache.token;
}

// ==================== HTTP HELPERS ====================

function httpRequest(method, hostname, reqPath, headers, body) {
    return new Promise((resolve, reject) => {
        let postData = '';
        const opts = {
            hostname,
            path: reqPath,
            method,
            headers: { ...headers },
        };

        if (body) {
            if (typeof body === 'string') {
                postData = body;
            } else if (headers && headers['Content-Type'] === 'application/json') {
                postData = JSON.stringify(body);
            } else {
                // form-urlencoded
                postData = new URLSearchParams(body).toString();
                opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            }
            opts.headers['Content-Length'] = Buffer.byteLength(postData);
        }

        const req = https.request(opts, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });

        if (postData) req.write(postData);
        req.end();
    });
}

async function sheetsApiRequest(method, endpoint, body) {
    const token = await getAccessToken();
    const config = loadSheetConfig();
    const spreadsheetId = config.sheetId;

    const basePath = `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
    const fullPath = endpoint ? `${basePath}/${endpoint}` : basePath;

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    return httpRequest(method, 'sheets.googleapis.com', fullPath, headers, body ? JSON.stringify(body) : null);
}

// ==================== PUBLIC API ====================

/**
 * Batch update test results in Google Sheets.
 * Writes columns G (status), H (result text), I (date) for each result.
 *
 * @param {Array<{code: string, status: string, resultText?: string, name?: string, finishedAtDisplay?: string, source?: string}>} results
 * @param {Record<string, number>} rowMap - TC-ID -> row number mapping
 * @returns {Promise<{written: number, errors: number}>}
 */
async function batchUpdateResults(results, rowMap) {
    if (!results || results.length === 0) return { written: 0, errors: 0 };

    const config = loadSheetConfig();
    const tabName = config.tabName || 'Arkusz1';

    const data = [];
    for (const result of results) {
        const row = rowMap[result.code];
        if (!row) continue;

        const status = (result.status || '').toUpperCase();
        const prefix = result.source === 'playwright-coded' ? '[Coded] ' : '[LLM] ';
        const resultText = prefix + (result.resultText || result.name || '');
        const dateStr = result.finishedAtDisplay || new Date().toLocaleString('pl-PL');

        data.push({
            range: `${tabName}!G${row}:I${row}`,
            values: [[status, resultText, dateStr]],
        });
    }

    if (data.length === 0) return { written: 0, errors: 0 };

    const endpoint = `values:batchUpdate`;
    const body = {
        valueInputOption: 'USER_ENTERED',
        data,
    };

    try {
        const response = await sheetsApiRequest('POST', endpoint, body);
        const parsed = JSON.parse(response);
        const updated = parsed.totalUpdatedCells || 0;
        const written = Math.floor(updated / 3); // 3 cells per row (G, H, I)
        return { written, errors: data.length - written };
    } catch (e) {
        console.error(`[sheets-writer] Batch update failed: ${e.message}`);
        return { written: 0, errors: data.length };
    }
}

/**
 * Update a single cell in the spreadsheet.
 *
 * @param {number} row - Row number (1-based)
 * @param {string} column - Column letter (e.g. 'G')
 * @param {string} value - Cell value
 * @returns {Promise<boolean>}
 */
async function updateCell(row, column, value) {
    const config = loadSheetConfig();
    const tabName = config.tabName || 'Arkusz1';
    const range = encodeURIComponent(`${tabName}!${column}${row}`);

    const endpoint = `values/${range}?valueInputOption=USER_ENTERED`;
    const body = { values: [[value]] };

    try {
        await sheetsApiRequest('PUT', endpoint, body);
        return true;
    } catch (e) {
        console.error(`[sheets-writer] updateCell(${column}${row}) failed: ${e.message}`);
        return false;
    }
}

/**
 * Read a range from the spreadsheet.
 *
 * @param {string} range - A1 notation range (e.g. 'Arkusz1!A1:I200')
 * @returns {Promise<string[][]>} - 2D array of cell values
 */
async function readRange(range) {
    const token = await getAccessToken();
    const config = loadSheetConfig();
    const spreadsheetId = config.sheetId;

    const encodedRange = encodeURIComponent(range);
    const reqPath = `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodedRange}`;

    const headers = {
        'Authorization': `Bearer ${token}`,
    };

    try {
        const response = await httpRequest('GET', 'sheets.googleapis.com', reqPath, headers, null);
        const parsed = JSON.parse(response);
        return parsed.values || [];
    } catch (e) {
        console.error(`[sheets-writer] readRange(${range}) failed: ${e.message}`);
        return [];
    }
}

/**
 * Invalidate the cached access token (e.g. for testing).
 */
function clearTokenCache() {
    _tokenCache = { token: null, expiresAt: 0 };
    _saCredentials = null;
    _sheetConfig = null;
}

module.exports = {
    getAccessToken,
    batchUpdateResults,
    updateCell,
    readRange,
    clearTokenCache,
};
