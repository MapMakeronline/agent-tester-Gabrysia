import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = process.env.BASE_URL || 'https://universe-mapmaker.web.app';
const IS_HEADLESS = process.env.HEADLESS === '1';
const STORAGE_STATE_PATH = path.resolve(__dirname, 'data', 'auth-storage-state.json');

// In headless/server mode, use storageState from global-setup login (if available)
const storageState = IS_HEADLESS && fs.existsSync(STORAGE_STATE_PATH) ? STORAGE_STATE_PATH : undefined;

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
    storageState,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
