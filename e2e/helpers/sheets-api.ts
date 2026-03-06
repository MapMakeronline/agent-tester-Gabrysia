/**
 * Google Sheets API v4 Writer (TypeScript) - JWT auth via service account.
 *
 * Used by sheets-reporter.ts to write test results directly to Google Sheets
 * without the broken Apps Script webhook.
 *
 * Zero external dependencies - uses Node.js built-in crypto + https.
 */

import * as crypto from 'crypto';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

// ==================== CONFIG ====================

// __dirname = e2e/helpers → up 2 levels = tester root (works locally and in K8s /app)
const AGENT_ROOT = path.resolve(__dirname, '..', '..');

const SA_PATH = process.env.SHEETS_SA_PATH ||
  path.resolve(AGENT_ROOT, 'config', 'sheets-service-account.json');

const SHEET_CONFIG_PATH = path.resolve(AGENT_ROOT, 'config', 'sheet-config.json');

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface SheetConfig {
  sheetId: string;
  tabName?: string;
}

interface TokenCache {
  token: string | null;
  expiresAt: number;
}

interface BatchResult {
  written: number;
  errors: number;
}

export interface SheetTestResult {
  code: string;
  status: string;
  resultText: string;
  finishedAtDisplay: string;
  source: 'playwright-coded';
}

let _saCredentials: ServiceAccount | null = null;
let _sheetConfig: SheetConfig | null = null;
let _tokenCache: TokenCache = { token: null, expiresAt: 0 };

function loadServiceAccount(): ServiceAccount {
  if (_saCredentials) return _saCredentials;
  _saCredentials = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
  return _saCredentials!;
}

function loadSheetConfig(): SheetConfig {
  if (_sheetConfig) return _sheetConfig;
  try {
    _sheetConfig = JSON.parse(fs.readFileSync(SHEET_CONFIG_PATH, 'utf8'));
  } catch {
    _sheetConfig = {
      sheetId: '1wFlv0KrT4JNTXAnGO4mwtDXPkh2dIxQzfM0VCXxA1jA',
      tabName: 'Arkusz1',
    };
  }
  return _sheetConfig!;
}

// ==================== JWT AUTH ====================

function base64url(buf: Buffer): string {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

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

  const tokenData = await httpRequest('POST', 'oauth2.googleapis.com', '/token', undefined, {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const parsed = JSON.parse(tokenData);
  if (!parsed.access_token) {
    throw new Error(`JWT token exchange failed: ${tokenData}`);
  }

  _tokenCache = {
    token: parsed.access_token,
    expiresAt: now + (parsed.expires_in || 3600) - 600,
  };

  return _tokenCache.token!;
}

// ==================== HTTP HELPERS ====================

function httpRequest(
  method: string,
  hostname: string,
  reqPath: string,
  headers?: Record<string, string>,
  body?: string | Record<string, string>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let postData = '';
    const opts: https.RequestOptions = {
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
        postData = new URLSearchParams(body).toString();
        (opts.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded';
      }
      (opts.headers as Record<string, string>)['Content-Length'] = String(Buffer.byteLength(postData));
    }

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
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

async function sheetsApiRequest(method: string, endpoint: string, body?: unknown): Promise<string> {
  const token = await getAccessToken();
  const config = loadSheetConfig();
  const spreadsheetId = config.sheetId;

  const basePath = `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const fullPath = endpoint ? `${basePath}/${endpoint}` : basePath;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  return httpRequest(method, 'sheets.googleapis.com', fullPath, headers, body ? JSON.stringify(body) : undefined);
}

// ==================== PUBLIC API ====================

/**
 * Fetch TC-ID → row number mapping directly from column A of the sheet.
 * Used as fallback when tests-queue.json is missing (e.g. fresh K8s pod).
 */
async function fetchRowMapFromSheet(): Promise<Record<string, number>> {
  try {
    const config = loadSheetConfig();
    const tabName = config.tabName || 'Arkusz1';
    const response = await sheetsApiRequest('GET', `values/${encodeURIComponent(tabName + '!A:A')}`);
    const parsed = JSON.parse(response);
    const values: string[][] = parsed.values || [];
    const map: Record<string, number> = {};
    values.forEach((row, i) => {
      if (row[0] && /^TC-/.test(row[0])) {
        map[row[0]] = i + 1; // 1-indexed row number
      }
    });
    console.log(`[sheets-api] Fetched rowMap from sheet: ${Object.keys(map).length} entries`);
    return map;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[sheets-api] fetchRowMapFromSheet failed: ${msg}`);
    return {};
  }
}

/**
 * Batch update test results in Google Sheets.
 * Writes columns G (status), H (result text), I (date) for each result.
 * If rowMap is empty (no tests-queue.json), fetches mapping from the sheet directly.
 */
export async function batchUpdateSheetResults(
  results: SheetTestResult[],
  rowMap: Record<string, number>,
): Promise<BatchResult> {
  if (!results || results.length === 0) return { written: 0, errors: 0 };

  // Fallback: fetch rowMap from sheet when tests-queue.json was not available
  const effectiveRowMap = Object.keys(rowMap).length > 0
    ? rowMap
    : await fetchRowMapFromSheet();

  const config = loadSheetConfig();
  const tabName = config.tabName || 'Arkusz1';

  const data: Array<{ range: string; values: string[][] }> = [];
  for (const result of results) {
    const row = effectiveRowMap[result.code];
    if (!row) continue;

    const status = (result.status || '').toUpperCase();
    const prefix = '[Coded] ';
    const resultText = prefix + result.resultText;
    const dateStr = result.finishedAtDisplay || new Date().toLocaleString('pl-PL');

    data.push({
      range: `${tabName}!G${row}:I${row}`,
      values: [[status, resultText, dateStr]],
    });
  }

  if (data.length === 0) return { written: 0, errors: 0 };

  try {
    const response = await sheetsApiRequest('POST', 'values:batchUpdate', {
      valueInputOption: 'USER_ENTERED',
      data,
    });
    const parsed = JSON.parse(response);
    const updated = parsed.totalUpdatedCells || 0;
    const written = Math.floor(updated / 3);
    console.log(`[sheets-api] Batch updated ${written}/${data.length} rows in Google Sheet`);
    return { written, errors: data.length - written };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[sheets-api] Batch update failed: ${msg}`);
    return { written: 0, errors: data.length };
  }
}
