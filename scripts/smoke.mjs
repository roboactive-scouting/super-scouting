#!/usr/bin/env node
// Phase 0 smoke suite: the /health wiring check alone (SPEC-FINAL 19.3, D30).
// Phase 1 task 1.62 replaces this with the full suite of 18.4.
const base = process.env.SMOKE_API_BASE_URL;
if (!base) {
  console.error('SMOKE_API_BASE_URL is not set. See docs/ops/ENVIRONMENT.md §3.');
  process.exit(1);
}

const url = `${base.replace(/\/+$/, '')}/health`;
const res = await fetch(url, { headers: { accept: 'application/json' } });
const body = await res.json().catch(() => ({}));

if (res.status !== 200 || body.status !== 'ok' || body.database !== 'ok') {
  console.error(`smoke failed: GET ${url} -> ${res.status} ${JSON.stringify(body)}`);
  process.exit(1);
}
console.warn(`smoke ok: GET ${url} -> 200 ${JSON.stringify(body)}`);
