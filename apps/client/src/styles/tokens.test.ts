import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');
const outdoorAt = css.indexOf("[data-theme='outdoor']");

const TOKENS = [
  '--bg',
  '--surface',
  '--surface-raised',
  '--border',
  '--text',
  '--text-muted',
  '--brand',
  '--brand-plate',
  '--on-brand',
  '--focus',
];

describe('theme tokens (SPEC-FINAL 17.4)', () => {
  it('defines every token in the dark default theme', () => {
    const dark = css.slice(css.indexOf(':root'), outdoorAt);
    for (const token of TOKENS) expect(dark, token).toContain(`${token}:`);
  });

  it('redefines every token in the outdoor high-contrast theme', () => {
    const outdoor = css.slice(outdoorAt);
    for (const token of TOKENS) expect(outdoor, token).toContain(`${token}:`);
  });

  it('uses the exact spec values for the dark defaults', () => {
    expect(css).toContain('--bg: #0A0A0B');
    expect(css).toContain('--brand: #FFEA07');
    expect(css).toContain('--brand-plate: #0A0A0B');
  });

  it('keeps the brand plate near-black in the outdoor theme too', () => {
    const outdoor = css.slice(outdoorAt);
    expect(outdoor).toContain('--brand-plate: #0A0A0B');
    expect(outdoor).toContain('--focus: #09090B');
  });

  it('defines the functional status colours separately from the brand', () => {
    for (const token of [
      '--status-played',
      '--status-broke-down',
      '--status-disabled',
      '--status-no-show',
      '--danger',
      '--warning',
      '--sync-offline',
      '--sync-syncing',
      '--sync-online',
    ]) {
      expect(css, token).toContain(`${token}:`);
    }
  });

  it('never puts brand yellow anywhere in the shading ramp, in EITHER theme', () => {
    const ramp = ['--shade-worst', '--shade-mid', '--shade-best'];
    for (const theme of [css.slice(0, outdoorAt), css.slice(outdoorAt)]) {
      for (const token of ramp) {
        expect(theme, token).toContain(`${token}:`);
        const value = theme.slice(theme.indexOf(`${token}:`), theme.indexOf(`${token}:`) + 24);
        expect(value.toUpperCase(), token).not.toContain('FFEA07');
      }
    }
  });
});
