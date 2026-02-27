import { test as base, chromium } from '@playwright/test';

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';

export const test = base.extend({
  browser: [async ({}, use) => {
    const browser = await chromium.connectOverCDP(CDP_URL, { isLocal: true });
    await use(browser);
  }, { scope: 'worker' }],

  context: async ({ browser }, use) => {
    // Use the existing default context from CDP Chrome (preserves logged-in session)
    const contexts = browser.contexts();
    const context = contexts[0] || await browser.newContext();
    await use(context);
    // Don't close the default context — it belongs to the Chrome session
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
