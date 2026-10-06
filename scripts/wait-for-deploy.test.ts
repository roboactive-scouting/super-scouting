import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
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
    // A wide window: it exits the moment abc123 appears, and three polls in 300 ms is a
    // coin toss while the whole monorepo suite shares the CPU.
    const { stderr } = await run(baseUrl, {
      EXPECTED_COMMIT_SHA: 'abc123',
      WAIT_FOR_DEPLOY_TIMEOUT_MS: '3000',
    });
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

  describe('a deploy Vercel skipped as "not affected"', () => {
    /** A throwaway repo: commits in order, each writing the given files. Returns the SHAs. */
    function repo(...commits: Record<string, string>[]) {
      const dir = mkdtempSync(join(tmpdir(), 'wait-deploy-'));
      const git = (...args: string[]) =>
        execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
      git('init', '-q');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'test');
      const shas = commits.map((files, i) => {
        for (const [path, content] of Object.entries(files)) {
          mkdirSync(dirname(join(dir, path)), { recursive: true });
          writeFileSync(join(dir, path), content);
        }
        git('add', '-A');
        git('commit', '-q', '-m', `commit ${i}`);
        return git('rev-parse', 'HEAD');
      });
      return { dir, shas };
    }

    function runIn(cwd: string, baseUrl: string, expected: string) {
      return execFileAsync('node', [SCRIPT], {
        cwd,
        env: {
          ...process.env,
          SMOKE_API_BASE_URL: baseUrl,
          EXPECTED_COMMIT_SHA: expected,
          WAIT_FOR_DEPLOY_INTERVAL_MS: '20',
          WAIT_FOR_DEPLOY_TIMEOUT_MS: '300',
        },
      });
    }

    const serving = (commit: string) =>
      startHealthServer(() => ({ status: 200, body: { status: 'ok', database: 'ok', commit } }));

    it('accepts an older live commit when nothing the server builds from changed since', async () => {
      const { dir, shas } = repo(
        { 'apps/server/src/app.ts': 'v1', 'apps/client/src/a.ts': 'v1' },
        { 'apps/client/src/a.ts': 'v2', 'docs/x.md': 'notes' },
      );
      const baseUrl = await serving(shas[0]!);
      const { stderr } = await runIn(dir, baseUrl, shas[1]!);
      expect(stderr).toContain('deploy ready');
      expect(stderr).toContain('builds the same server');
    }, 20_000);

    // git init + two commits + one script run per case: slow on a loaded Windows runner.
    it.each(['apps/server/src/app.ts', 'packages/shared/src/x.ts', 'pnpm-lock.yaml'])(
      'keeps waiting when %s changed since the live commit',
      async (changed) => {
        const { dir, shas } = repo({ 'apps/server/src/app.ts': 'v1' }, { [changed]: 'v2' });
        const baseUrl = await serving(shas[0]!);
        await expect(runIn(dir, baseUrl, shas[1]!)).rejects.toMatchObject({ code: 1 });
      },
      20_000,
    );

    it('keeps waiting when the live commit is not an ancestor of the expected one', async () => {
      const { dir, shas } = repo({ 'apps/server/src/app.ts': 'v1' }, { 'apps/client/a.ts': 'v2' });
      // The NEWER commit is live while CI checks the older: never treat that as ready.
      const baseUrl = await serving(shas[1]!);
      await expect(runIn(dir, baseUrl, shas[0]!)).rejects.toMatchObject({ code: 1 });
    }, 20_000);

    it('keeps waiting when the live commit is unknown to this checkout', async () => {
      const { dir, shas } = repo({ 'apps/server/src/app.ts': 'v1' });
      const baseUrl = await serving('0123456789abcdef0123456789abcdef01234567');
      await expect(runIn(dir, baseUrl, shas[0]!)).rejects.toMatchObject({ code: 1 });
    }, 20_000);
  });

  it('exits 0 on a plain healthy response when no EXPECTED_COMMIT_SHA is set', async () => {
    const baseUrl = await startHealthServer(() => ({
      status: 200,
      body: { status: 'ok', database: 'ok' },
    }));
    await expect(run(baseUrl)).resolves.toBeDefined();
  });
});
