import { test as base, chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const IS_HEADLESS = process.env.HEADLESS === '1';
const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';
const STORAGE_STATE_PATH = path.resolve(__dirname, '..', 'data', 'auth-storage-state.json');

export const test = base.extend({
  browser: [async ({}, use) => {
    let browser;
    if (IS_HEADLESS) {
      // Server mode: launch Chromium directly (no CDP)
      browser = await chromium.launch({ headless: true });
    } else {
      // Local mode: connect to user's Chrome via CDP
      browser = await chromium.connectOverCDP(CDP_URL, { isLocal: true });
    }
    await use(browser);
    if (IS_HEADLESS) {
      await browser.close();
    }
  }, { scope: 'worker' }],

  context: async ({ browser }, use) => {
    let context;
    if (IS_HEADLESS) {
      // Server mode: create new context with saved auth state (if available)
      const storageState = fs.existsSync(STORAGE_STATE_PATH) ? STORAGE_STATE_PATH : undefined;
      context = await browser.newContext({ storageState });
    } else {
      // Local mode: reuse existing CDP context (preserves logged-in session)
      const contexts = browser.contexts();
      context = contexts[0] || await browser.newContext();
    }
    await use(context);
    if (IS_HEADLESS) {
      await context.close();
    }
  },

  page: async ({ context, baseURL }, use) => {
    const page = await context.newPage();
    // Apply baseURL from config to relative goto calls
    const originalGoto = page.goto.bind(page);
    page.goto = async (url: string, options?: any) => {
      if (baseURL && url.startsWith('/')) {
        url = baseURL + url;
      }
      return originalGoto(url, options);
    };
    await use(page);

    // Cleanup: close open modals/dialogs to prevent state leaks between tests
    try {
      const dialogs = page.locator('[role="dialog"], [role="alertdialog"], .MuiModal-root');
      if (await dialogs.count() > 0) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
      // Dismiss any snackbar/toast notifications
      const snackbar = page.locator('.MuiSnackbar-root .MuiAlert-action button');
      if (await snackbar.count() > 0) {
        await snackbar.first().click({ timeout: 1000 }).catch(() => {});
      }
    } catch {
      // Cleanup is best-effort — don't fail the test teardown
    }

    await page.close();
  },
});

/**
 * Clears auth state so the page shows the login/register form.
 * Use in tests that need an unauthenticated state (login tests, register tests).
 */
export async function clearSession(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

export { expect } from '@playwright/test';
