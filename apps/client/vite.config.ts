import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

function gitShortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // SPEC-FINAL 18.1: Android Chrome from the last ~2 years, iOS Safari 16+.
  build: { target: ['chrome111', 'safari16'] },
  define: {
    // VITE_APP_VERSION is injected at build time, never typed by hand (ENVIRONMENT.md §1).
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      process.env.VITE_APP_VERSION ??
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
        gitShortSha(),
    ),
  },
  server: { port: 5173 },
}));
