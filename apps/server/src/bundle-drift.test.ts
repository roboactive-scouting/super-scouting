import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('the deployed function bundle', () => {
  it('matches src/handler.ts (regenerate with `pnpm --filter @frc/server build`)', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    // Build to a temp file, never over the committed one: a stale bundle fails every run
    // instead of being rewritten by the first and passing the next.
    const dir = mkdtempSync(join(tmpdir(), 'frc-bundle-'));
    try {
      const outfile = join(dir, 'index.js');
      execFileSync('node', ['scripts/build-function.mjs', '--outfile', outfile], {
        cwd: root,
        stdio: 'pipe',
      });
      const committed = readFileSync(join(root, 'api', 'index.js'), 'utf8');
      expect(readFileSync(outfile, 'utf8')).toBe(committed);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
