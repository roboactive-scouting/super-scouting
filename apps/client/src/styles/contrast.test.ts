import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');
const outdoorAt = css.indexOf("[data-theme='outdoor']");
const THEMES = { dark: css.slice(0, outdoorAt), outdoor: css.slice(outdoorAt) };

function token(theme: string, name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(theme);
  if (!match?.[1]) throw new Error(`${name} is not a six-digit hex in this theme`);
  return match[1];
}

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const channel = (at: number) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('alliance colours (SPEC-FINAL v1.3 17.4, 17.7)', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    it(`clears 3:1 as a UI boundary on every surface, ${name} theme`, () => {
      for (const alliance of ['--alliance-red', '--alliance-blue']) {
        for (const surface of ['--bg', '--surface', '--surface-raised']) {
          expect(
            contrast(token(theme, alliance), token(theme, surface)),
            `${alliance} on ${surface}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it(`is never brand yellow, ${name} theme`, () => {
      for (const alliance of ['--alliance-red', '--alliance-blue']) {
        expect(token(theme, alliance).toUpperCase()).not.toBe('#FFEA07');
      }
    });
  }
});
