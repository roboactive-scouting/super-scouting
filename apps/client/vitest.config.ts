import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // supplied by the VitePWA plugin in vite.config.ts, which this config does not load
      'virtual:pwa-register': fileURLToPath(
        new URL('./src/test/pwa-register-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // userEvent-heavy page tests (the builder's, the entry's) run 3–5.5 s on this machine under a
    // full-suite load, so the 5 s default failed them at random (DEVIATIONS 1.37). A hang still fails.
    testTimeout: 15_000,
  },
});
