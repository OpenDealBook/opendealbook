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
    navigationTimeout: 60 * 1000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Playwright boots the web app itself against the local Supabase stack, so a
  // run owns the full server lifecycle. reuseExistingServer keeps an already
  // running `pnpm --filter web dev` in place; the dev server compiles routes on
  // first hit, so the readiness timeout is generous.
  webServer: {
    command: 'pnpm --filter web dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
