import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'theme.css'), 'utf8');
const outdoorAt = css.indexOf("[data-theme='outdoor']");
const LIGHT = css.slice(0, outdoorAt);
const OUTDOOR = css.slice(outdoorAt);

/** Every colour token of docs/design/theme.css, which this file is generated from. */
const TOKENS = [
  '--bg',
  '--surface',
  '--line',
  '--line-2',
  '--control-border',
  '--ink',
  '--ink-2',
  '--muted',
  '--faint',
  '--rail',
  '--rail-raised',
  '--rail-ink',
  '--rail-muted',
  '--rail-line',
  '--accent',
  '--accent-ink',
  '--accent-tint',
  '--on-accent',
  '--warn',
  '--warn-tint',
  '--alliance-red',
  '--alliance-red-tint',
  '--alliance-blue',
  '--alliance-blue-tint',
  '--alliance-red-strong',
  '--alliance-blue-strong',
];

describe('theme tokens (THEME.md, SPEC-FINAL 17.4)', () => {
  it.each(TOKENS)('light defines %s as a hex', (t) => {
    expect(LIGHT).toMatch(new RegExp(`${t}:\\s*#[0-9a-f]{6};`, 'i'));
  });
  it.each(TOKENS)('outdoor redefines %s', (t) => {
    expect(OUTDOOR).toMatch(new RegExp(`${t}:\\s*#[0-9a-f]{6};`, 'i'));
  });
  it('copies the light values from docs/design/theme.css exactly', () => {
    const design = readFileSync(
      join(import.meta.dirname, '../../../../docs/design/theme.css'),
      'utf8',
    );
    for (const t of TOKENS) {
      const want = new RegExp(`${t}:\\s*(#[0-9a-f]{6});`, 'i').exec(design)?.[1]?.toLowerCase();
      const got = new RegExp(`${t}:\\s*(#[0-9a-f]{6});`, 'i').exec(LIGHT)?.[1]?.toLowerCase();
      expect(got, t).toBe(want);
    }
  });
  it('has no red outside the alliance tokens', () => {
    const reds = [...css.matchAll(/--([a-z0-9-]+):\s*#([0-9a-f]{6})/gi)].filter(([, , hex]) => {
      const r = parseInt(hex!.slice(0, 2), 16),
        g = parseInt(hex!.slice(2, 4), 16),
        b = parseInt(hex!.slice(4, 6), 16);
      return r > 150 && g < 90 && b < 90;
    });
    const names = reds.map(([, name]) => name!);
    // Positive control: the scan must actually see the alliance red, or it passes vacuously.
    expect(names).toEqual(['alliance-red', 'alliance-red-strong']);
    expect(names.filter((n) => !n.startsWith('alliance-red'))).toEqual([]);
  });
});
