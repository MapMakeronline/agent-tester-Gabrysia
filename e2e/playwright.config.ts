import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://universe-mapmaker.web.app';
const CDP_ENDPOINT = process.env.CDP_ENDPOINT || '';

export default defineConfig({
  globalSetup: require.resolve('./e2e/global-setup'),
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list'], ['./e2e/helpers/sheets-reporter.ts']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ...(CDP_ENDPOINT ? { connectOptions: { wsEndpoint: CDP_ENDPOINT } } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
