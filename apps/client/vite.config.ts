import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function gitShortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig(() => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt', // never auto-reload; activate on the next cold start
      injectRegister: null,
      manifest: {
        name: 'ROBACTIVE Scouting',
        short_name: 'Scouting',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#161a21',
        background_color: '#f4f6f8',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,webp,png,svg}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // SPEC-FINAL 18.1: Android Chrome from the last ~2 years, iOS Safari 16+.
  // The manifest feeds scripts/check-bundle.mjs, which deletes it after reading; Vercel's deploy
  // build never runs that script, so it skips the manifest and nothing readable ships in dist.
  build: { target: ['chrome111', 'safari16'], manifest: !process.env.VERCEL },
  define: {
    // VITE_APP_VERSION is injected at build time, never typed by hand (ENVIRONMENT.md §1).
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      process.env.VITE_APP_VERSION ??
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
        gitShortSha(),
    ),
    // The build date (UTC, YYYY-MM-DD) for the Home footer.
    'import.meta.env.VITE_APP_BUILT_AT': JSON.stringify(
      process.env.VITE_APP_BUILT_AT ?? new Date().toISOString().slice(0, 10),
    ),
  },
  server: { port: 5173 },
}));
