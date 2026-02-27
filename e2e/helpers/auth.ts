import { Page } from '@playwright/test';

const TEST_USER = process.env.TEST_USER || 'Mestwin';
const TEST_PASS = process.env.TEST_PASS || 'Kaktus,1';

export async function login(page: Page) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: /nazwa użytkownika/i }).fill(TEST_USER);
  await page.getByRole('textbox', { name: /hasło/i }).fill(TEST_PASS);
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await page.waitForURL(/\/(dashboard|projects|map)/, { timeout: 15_000 });
}

export async function logout(page: Page) {
  await page.locator('.MuiAvatar-root').last().click();
  await page.getByRole('menuitem', { name: 'Wyloguj' }).click();
  await page.waitForURL(/\/login/);
}

export async function ensureLoggedIn(page: Page) {
  // Navigate to a protected route to check auth status
  await page.goto('/projects/my');
  await page.waitForLoadState('domcontentloaded');
  const url = page.url();
  // If still on /projects/my — user is authenticated
  if (url.includes('/projects/my')) {
    return;
  }
  // Otherwise we got redirected to login — need to authenticate
  await login(page);
}
