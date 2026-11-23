import { defineConfig } from '@playwright/test';

// Extension specs launch their own persistent Chromium context (see tests/e2e/fixtures.ts).
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    headless: true,
  },
  projects: [{ name: 'chromium' }],
});
