import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-results',
  // 60 s since task 1.38: every shoot() takes each picture in Light and in Outdoor, axe each time,
  // so a screen-heavy test does twice the work it did at 30 s.
  timeout: 60_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    channel: 'chrome',
    baseURL: 'http://localhost:4173',
    locale: 'en-GB',
    timezoneId: 'Asia/Jerusalem',
    serviceWorkers: 'block',
    // Still screens: axe never measures contrast mid-fade (the smoke-home flake).
    reducedMotion: 'reduce',
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
      // The QR receiver's camera is the stub the specs drive (vite.config.ts; task 1.48).
      E2E_QR_CAMERA: 'stub',
    },
  },
});
