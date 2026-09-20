#!/usr/bin/env node
// Bundles the Vercel function at build time (SPEC-FINAL 16.1 follow-up — see
// docs/plans/DEVIATIONS.md "the durable ESM-under-Vercel fix"). Vercel transpiles
// apps/server's api/*.ts files individually rather than bundling them, so a
// workspace package whose `main` points at TypeScript source (like @frc/shared)
// can never be resolved by Node's runtime ESM loader. Bundling src/handler.ts
// ourselves — inlining every relative import and every workspace package,
// leaving only real npm dependencies external — sidesteps that entirely.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

await build({
  absWorkingDir: root, // keeps the bundle's embedded source comments CWD-independent
  entryPoints: ['src/handler.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  // Real npm dependencies stay external — Vercel's own file tracing includes
  // them from node_modules, the same way it already does for the deployed
  // function today. Everything else (apps/server/src/**, @frc/shared, @frc/db's
  // type-only surface) gets inlined.
  external: ['hono', '@supabase/supabase-js', 'zod'],
});
