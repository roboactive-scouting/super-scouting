import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-results',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    channel: 'chrome',
    baseURL: 'http://localhost:4173',
    locale: 'en-GB',
    timezoneId: 'Asia/Jerusalem',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_API_BASE_URL: 'http://api.test',
      VITE_DEVICE_WIPE_CODE: 'WIPE2096',
      VITE_APP_VERSION: '1.4.0',
    },
  },
});
