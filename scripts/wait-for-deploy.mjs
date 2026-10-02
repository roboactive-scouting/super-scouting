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
//
// A server Vercel skipped as "not affected" (see docs/ops/BUILD-CONTEXT.md §5). Vercel does
// not rebuild a project when a push changes nothing it is built from, so a client-only push
// leaves the server on an older commit for good and an exact-commit match would time out.
// A live commit is therefore also accepted when (1) it is an ancestor of the expected one
// and (2) `git diff` between them is empty for every path the server is built from. Then
// that deployment IS the expected server, byte for byte. Anything else — a server change,
// a commit this checkout does not know (CI needs `fetch-depth: 0`), a newer commit — keeps
// waiting, exactly as before.
import { execFileSync } from 'node:child_process';

/** What the server function is built from: itself, the packages it bundles, the workspace. */
export const SERVER_INPUTS = [
  'apps/server',
  'packages/shared',
  'packages/db',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'turbo.json',
  '.npmrc',
  '.nvmrc',
];

/** Answers per live commit: the same stale deploy is polled every 10 s, git runs once. */
const sameBuildCache = new Map();

/** True when `live` deploys the same server as `expected`; false on any doubt. */
function sameServerBuild(live, expected) {
  if (!sameBuildCache.has(live)) sameBuildCache.set(live, compareServerBuild(live, expected));
  return sameBuildCache.get(live);
}

function compareServerBuild(live, expected) {
  // Only a commit SHA can be compared; anything else is never "the same server".
  if (!/^[0-9a-f]{7,40}$/i.test(live) || !/^[0-9a-f]{7,40}$/i.test(expected)) return false;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', live, expected], { stdio: 'ignore' });
    execFileSync('git', ['diff', '--quiet', live, expected, '--', ...SERVER_INPUTS], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    // Not an ancestor, a server input changed (diff exits 1), or an unknown commit.
    return false;
  }
}

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

    if (
      healthy &&
      expectedCommit &&
      typeof body.commit === 'string' &&
      body.commit !== expectedCommit &&
      sameServerBuild(body.commit, expectedCommit)
    ) {
      console.warn(
        `deploy ready: GET ${url} serves ${body.commit}, which builds the same server as ` +
          `${expectedCommit} (no change under ${SERVER_INPUTS.join(', ')}; Vercel skipped it as not affected)`,
      );
      process.exit(0);
    } else if (healthy && expectedCommit && body.commit !== expectedCommit) {
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
