#!/usr/bin/env node
// Waits for the Vercel deployment under test to be live and healthy before the
// smoke suite (scripts/smoke.mjs) runs against it. CI and Vercel both react to
// the same push with no ordering guarantee: CI's own steps finish in well under
// a minute, but the matching client+server Vercel deployment can take several
// minutes. Without this wait, the smoke suite can hit a stale or not-yet-ready
// deployment and fail for reasons that have nothing to do with the commit under
// test (see docs/plans/DEVIATIONS.md, "CI's smoke suite raced the Vercel
// deployment it depends on and lost, twice").
//
// A plain "GET /health returns 200" wait is not enough: the *previous*
// deployment also answers 200, so a healthy-but-stale server passes this wait
// instantly and the smoke suite then hits stale code (see
// docs/plans/DEVIATIONS.md, "wait:deploy now waits for the deployed commit").
// When EXPECTED_COMMIT_SHA is set, "ready" additionally requires the health
// body's `commit` field to equal it — /health reports VERCEL_GIT_COMMIT_SHA
// (apps/server/src/config.ts, apps/server/src/app.ts). A healthy response
// serving a different (or missing) commit is logged and polling continues;
// it means either the old deployment is still live, or the new one hasn't
// finished rolling out. If EXPECTED_COMMIT_SHA is not set, this behaves exactly
// as a plain health check — useful for local runs where there is no deployed
// commit to compare against.
//
// Polling: every 10s, for up to 8 minutes (48 attempts). That comfortably fits
// inside the workflow's 20-minute job timeout alongside the other steps
// (install, lint, typecheck, migrations, unit tests, smoke, build), while
// giving a slow Vercel build room to finish. Both are overridable via env vars
// for local testing without waiting the full 8 minutes.
const base = process.env.SMOKE_API_BASE_URL;
if (!base) {
  console.error('SMOKE_API_BASE_URL is not set. See docs/ops/ENVIRONMENT.md §3.');
  process.exit(1);
}

const expectedCommit = process.env.EXPECTED_COMMIT_SHA || null;
const intervalMs = Number(process.env.WAIT_FOR_DEPLOY_INTERVAL_MS) || 10_000;
const timeoutMs = Number(process.env.WAIT_FOR_DEPLOY_TIMEOUT_MS) || 8 * 60_000;

const url = `${base.replace(/\/+$/, '')}/health`;
const deadline = Date.now() + timeoutMs;

let lastSeen = 'no response yet';
let lastSeenCommit = null;

while (Date.now() < deadline) {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));

    const healthy = res.status === 200 && body.status === 'ok' && body.database === 'ok';

    if (healthy && expectedCommit && body.commit !== expectedCommit) {
      lastSeen = `${res.status} ${JSON.stringify(body)}`;
      lastSeenCommit = body.commit ?? null;
      console.warn(
        `deploy not ready yet: serving ${lastSeenCommit}, waiting for ${expectedCommit}`,
      );
    } else if (healthy) {
      console.warn(`deploy ready: GET ${url} -> 200 ${JSON.stringify(body)}`);
      process.exit(0);
    } else {
      lastSeen = `${res.status} ${JSON.stringify(body)}`;
      lastSeenCommit = body.commit ?? null;
      console.warn(`deploy not ready yet: GET ${url} -> ${lastSeen}`);
    }
  } catch (err) {
    lastSeen = err instanceof Error ? err.message : String(err);
    console.warn(`deploy not reachable yet: GET ${url} -> ${lastSeen}`);
  }

  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

const commitNote = expectedCommit
  ? ` Last commit seen: ${lastSeenCommit === null ? 'null (never reported one)' : lastSeenCommit}, waiting for: ${expectedCommit}.`
  : '';
console.error(
  `wait-for-deploy timed out after ${timeoutMs}ms waiting for ${url} to become healthy. ` +
    `Last response seen: ${lastSeen}.${commitNote}`,
);
process.exit(1);
