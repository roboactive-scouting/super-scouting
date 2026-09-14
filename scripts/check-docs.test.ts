import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { missingHeadings, REQUIRED } from './check-docs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('required ops documentation (SPEC-FINAL 19.5)', () => {
  it('every required document carries every required section', () => {
    for (const [path, required] of Object.entries(REQUIRED)) {
      expect(missingHeadings(readFileSync(join(ROOT, path), 'utf8'), required), path).toEqual([]);
    }
  });

  it('no required document contains a value that looks like a secret', () => {
    for (const path of Object.keys(REQUIRED)) {
      const text = readFileSync(join(ROOT, path), 'utf8');
      expect(text, path).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/); // a JWT-shaped string
      expect(text, path).not.toMatch(/sb[ps]_[A-Za-z0-9]{20,}/); // a Supabase key
    }
  });

  it('reports a missing section rather than passing silently', () => {
    expect(missingHeadings('# nothing\n', ['Accounts to create'])).toEqual(['Accounts to create']);
  });
});
