import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from '@playwright/test';

const IS_HEADLESS = process.env.HEADLESS === '1';
const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';
const BASE_URL = process.env.BASE_URL || 'https://universe-mapmaker.web.app';
const MAPMAKER_USER = process.env.MAPMAKER_USER || process.env.TEST_USER || 'Mestwin';
const MAPMAKER_PASS = process.env.MAPMAKER_PASS || process.env.TEST_PASS || 'Kaktus,1';

const STORAGE_STATE_PATH = path.resolve(__dirname, '..', 'data', 'auth-storage-state.json');

/**
 * Global setup:
 * - Local mode (CDP): verifies Chrome is reachable on CDP port
 * - Server mode (HEADLESS=1): logs in programmatically and saves storageState
 */
async function globalSetup() {
  if (IS_HEADLESS) {
    await headlessSetup();
  } else {
    await cdpSetup();
  }
}

/** Server mode: launch browser, login, save auth state for all tests */
async function headlessSetup() {
  console.log('[global-setup] Headless mode — performing programmatic login...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.getByRole('textbox', { name: /nazwa użytkownika/i }).fill(MAPMAKER_USER);
    await page.getByRole('textbox', { name: /hasło/i }).fill(MAPMAKER_PASS);
    await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await page.waitForURL(/\/(dashboard|projects|map)/, { timeout: 30_000 });

    // Save auth state for all tests
    const dataDir = path.dirname(STORAGE_STATE_PATH);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    await context.storageState({ path: STORAGE_STATE_PATH });

    console.log(`[global-setup] Login OK — storageState saved to ${STORAGE_STATE_PATH}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[global-setup] Login failed: ${msg}`);
    throw new Error(
      `Headless login failed at ${BASE_URL}/login\n` +
      `User: ${MAPMAKER_USER}\n` +
      `Error: ${msg}\n` +
      `Check MAPMAKER_USER / MAPMAKER_PASS env vars.`,
    );
  } finally {
    await browser.close();
  }
}

/** Local mode: verify Chrome CDP is reachable */
async function cdpSetup() {
  const available = await checkCDP();
  if (!available) {
    throw new Error(
      `Chrome DevTools Protocol not available at ${CDP_URL}\n` +
      `Start Chrome with: chrome --remote-debugging-port=9222 --user-data-dir="%TEMP%\\chrome-dev"\n` +
      `Or run: node scripts/init-session.js (auto-starts Chrome)`,
    );
  }
  console.log(`[global-setup] Chrome CDP available at ${CDP_URL}`);
}

function checkCDP(): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL('/json/version', CDP_URL);
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          console.log(`[global-setup] Chrome ${info['Browser'] || 'unknown'}`);
          resolve(true);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export default globalSetup;
