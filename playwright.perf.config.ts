import { defineConfig } from '@playwright/test';

// Content script benchmark (`npm run bench`), kept out of the default e2e run.
export default defineConfig({
  testDir: './tests/perf',
  testMatch: '*.bench.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  workers: 1,
  timeout: 300_000,
  use: {
    headless: true,
    // Same browser build as the extension context in tests/e2e/fixtures.ts.
    channel: 'chromium',
  },
  projects: [{ name: 'chromium' }],
});
