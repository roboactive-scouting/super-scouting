import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('the deployed function bundle', () => {
  it('matches src/handler.ts (regenerate with `pnpm --filter @frc/server build`)', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const committed = readFileSync(`${root}/api/index.js`, 'utf8');
    execFileSync('node', ['scripts/build-function.mjs'], { cwd: root, stdio: 'pipe' });
    const fresh = readFileSync(`${root}/api/index.js`, 'utf8');
    expect(fresh).toBe(committed);
  });
});
