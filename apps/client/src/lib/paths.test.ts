import { describe, expect, it } from 'vitest';
import { entryPath, isEntryPath, PATHS } from './paths';

describe('paths (redesign R.4)', () => {
  it('puts Home at / and Scout at /scout', () => {
    expect(PATHS.home).toBe('/');
    expect(PATHS.scout).toBe('/scout');
  });

  it('builds the entry route with its alliance', () => {
    expect(entryPath('m-1', 't-1', 'blue')).toBe('/entry/m-1/t-1?alliance=blue');
  });

  it('knows the data-entry path, and nothing else as it (SPEC-FINAL 17.9)', () => {
    expect(isEntryPath('/scout')).toBe(true);
    expect(isEntryPath('/entry/m-1/t-1')).toBe(true);
    expect(isEntryPath('/entries')).toBe(false);
    expect(isEntryPath('/')).toBe(false);
    expect(isEntryPath('/scouting-report')).toBe(false);
  });
});
