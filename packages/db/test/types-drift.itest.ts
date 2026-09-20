import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('generated database types', () => {
  it('match the linked dev project (regenerate with `pnpm --filter @frc/db db:types`)', () => {
    const committed = readFileSync(
      fileURLToPath(new URL('../src/database.types.ts', import.meta.url)),
      'utf8',
    );
    const fresh = execFileSync(
      'pnpm',
      ['exec', 'supabase', 'gen', 'types', 'typescript', '--linked', '--schema', 'public'],
      {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        encoding: 'utf8',
        shell: true,
      },
    );
    expect(fresh.trim()).toBe(committed.trim());
  });
});
