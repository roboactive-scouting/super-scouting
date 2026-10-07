// The initial-JS budget (RB.18): the entry chunk and its static imports, gzipped, must stay
// at or under BUDGET_KB. 205 KB = measured 199.4 KB + headroom (user decision 2026-10-07):
// react-dom, dexie and react-router (~128 KB) are needed at first paint on the offline
// competition path, and the service worker fetches the app once, before the venue. Every lazy chunk is printed and must be in the service worker's
// precache, so a lazy route still opens offline. Run after `pnpm build`.
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 205;

const dist = 'apps/client/dist';
const manifestPath = join(dist, '.vite/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
// The manifest lists source paths and dependency versions; dist is deployable, so remove it
// once read (vite.config.ts also skips it on Vercel, which never runs this script).
rmSync(manifestPath);
if (readdirSync(join(dist, '.vite')).length === 0) rmSync(join(dist, '.vite'), { recursive: true });
const entry = Object.values(manifest).find((c) => c.isEntry);
const seen = new Set();
const walk = (key) => {
  const c = manifest[key] ?? Object.values(manifest).find((m) => m.file === key);
  if (!c || seen.has(c.file)) return;
  seen.add(c.file);
  for (const i of c.imports ?? []) walk(i);
};
walk(Object.keys(manifest).find((k) => manifest[k] === entry));
const initialFiles = new Set(seen);
const gz = (f) => gzipSync(readFileSync(join(dist, f))).length;
const initial = [...seen].reduce((s, f) => s + gz(f), 0);
console.log(`initial JS ${(initial / 1024).toFixed(1)} KB gzip`);
const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const lazy = Object.values(manifest).filter((c) => c.isDynamicEntry);
// A lazy entry also needs the shared chunks it imports (outside the initial set) to open offline.
const lazyFiles = new Set();
const walkLazy = (key) => {
  const c = manifest[key] ?? Object.values(manifest).find((m) => m.file === key);
  if (!c || initialFiles.has(c.file) || lazyFiles.has(c.file)) return;
  lazyFiles.add(c.file);
  for (const i of c.imports ?? []) walkLazy(i);
};
for (const c of lazy) {
  console.log(`  lazy ${c.file} ${(gz(c.file) / 1024).toFixed(1)} KB`);
  walkLazy(c.file);
}
for (const file of lazyFiles) {
  if (!sw.includes(file)) {
    console.error(`not precached: ${file}`);
    process.exit(1);
  }
}
if (initial > BUDGET_KB * 1024) {
  console.error(`initial JS over ${BUDGET_KB} KB gzip`);
  process.exit(1);
}
