import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'wait-for-deploy.mjs');

let server: ReturnType<typeof createServer> | undefined;

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server?.close(resolve));
    server = undefined;
  }
});

/** Starts a local /health server whose response is decided by `respond`, and returns its base URL. */
async function startHealthServer(
  respond: (requestCount: number) => { status: number; body: unknown },
) {
  let requestCount = 0;
  server = createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    requestCount += 1;
    const { status, body } = respond(requestCount);
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
  await new Promise((resolve) => server?.listen(0, resolve));
  const address = server?.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind a port');
  return `http://127.0.0.1:${address.port}`;
}

function run(baseUrl: string, extraEnv: Record<string, string> = {}) {
  return execFileAsync('node', [SCRIPT], {
    env: {
      ...process.env,
      SMOKE_API_BASE_URL: baseUrl,
      WAIT_FOR_DEPLOY_INTERVAL_MS: '20',
      WAIT_FOR_DEPLOY_TIMEOUT_MS: '300',
      ...extraEnv,
    },
  });
}

describe('wait-for-deploy', () => {
  it('exits 0 immediately when the health body already reports the expected commit', async () => {
    const baseUrl = await startHealthServer(() => ({
      status: 200,
      body: { status: 'ok', database: 'ok', commit: 'abc123' },
    }));
    await expect(run(baseUrl, { EXPECTED_COMMIT_SHA: 'abc123' })).resolves.toBeDefined();
  });

  it('polls past a stale commit and exits 0 once the expected commit appears', async () => {
    const baseUrl = await startHealthServer((count) => ({
      status: 200,
      body: { status: 'ok', database: 'ok', commit: count < 3 ? 'stale000' : 'abc123' },
    }));
    // Progress and readiness lines both go through console.warn, which Node sends to stderr.
    const { stderr } = await run(baseUrl, { EXPECTED_COMMIT_SHA: 'abc123' });
    expect(stderr).toContain('waiting for abc123');
    expect(stderr).toContain('deploy ready');
  });

  it('keeps polling and exits 1 naming the last-seen commit when it never matches', async () => {
    const baseUrl = await startHealthServer(() => ({
      status: 200,
      body: { status: 'ok', database: 'ok', commit: 'stale000' },
    }));
    await expect(run(baseUrl, { EXPECTED_COMMIT_SHA: 'abc123' })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/stale000[\s\S]*abc123/),
    });
  });

  it('treats a missing commit field as not-ready while an expected SHA is set', async () => {
    const baseUrl = await startHealthServer(() => ({
      status: 200,
      body: { status: 'ok', database: 'ok' },
    }));
    await expect(run(baseUrl, { EXPECTED_COMMIT_SHA: 'abc123' })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('null'),
    });
  });

  it('exits 0 on a plain healthy response when no EXPECTED_COMMIT_SHA is set', async () => {
    const baseUrl = await startHealthServer(() => ({
      status: 200,
      body: { status: 'ok', database: 'ok' },
    }));
    await expect(run(baseUrl)).resolves.toBeDefined();
  });
});
