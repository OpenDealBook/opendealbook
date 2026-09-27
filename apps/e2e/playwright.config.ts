import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    navigationTimeout: 15 * 1000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Uncomment to let Playwright boot the web app itself. Leave it off when you
  // already run `pnpm --filter web dev` in another terminal against a local
  // Supabase stack; reuseExistingServer keeps that running server in place.
  //
  // webServer: {
  //   command: 'pnpm --filter web dev',
  //   url: baseURL,
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  //   stdout: 'pipe',
  //   stderr: 'pipe',
  // },
});
