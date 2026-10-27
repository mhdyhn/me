import { defineConfig } from '@playwright/test';

// These tests mock the API and never touch a real account or database.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.ts',
  timeout: 45_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4177',
    browserName: 'chromium',
    serviceWorkers: 'block',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: 'npm run dev -- --port 4177 --strictPort',
    url: 'http://127.0.0.1:4177/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
