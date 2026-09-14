import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = import.meta.dirname;
const FORBIDDEN: RegExp[] = [
  /from 'node:/,
  /from 'fs'/,
  /from 'path'/,
  /from 'crypto'/,
  /process\.env/,
  /@supabase\/supabase-js/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) return [];
    return [full];
  });
}

describe('packages/shared is browser-safe (SPEC-FINAL 16.1)', () => {
  it('imports no Node built-in, reads no process.env and never touches supabase-js', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(text)) offenders.push(`${file}: ${String(pattern)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
