import { defineConfig, devices } from '@playwright/test';

import { VARIANT_URL, WEB_URL } from './tests/fixtures/stack';

// Global setup starts both web servers itself, after it has minted the Novu and
// Documenso keys their env needs; see tests/global-setup.ts.
export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: Number(process.env.E2E_WORKERS ?? (process.env.CI ? 1 : 3)),
  reporter: 'html',
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  use: {
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    navigationTimeout: 60 * 1000,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: ['**/*.variant.spec.ts', '**/full-deal.spec.ts', '**/gotenberg-down.spec.ts'],
      use: { ...devices['Desktop Chrome'], baseURL: WEB_URL },
    },
    {
      name: 'full-deal',
      testMatch: '**/full-deal.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: WEB_URL },
    },
    {
      name: 'gotenberg-down',
      testMatch: '**/gotenberg-down.spec.ts',
      dependencies: ['chromium', 'full-deal'],
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'], baseURL: WEB_URL },
    },
    {
      name: 'variant',
      testMatch: '**/*.variant.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: VARIANT_URL },
    },
  ],
});
