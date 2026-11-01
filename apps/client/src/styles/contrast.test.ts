import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'theme.css'), 'utf8');
const outdoorAt = css.indexOf("[data-theme='outdoor']");
const THEMES = { light: css.slice(0, outdoorAt), outdoor: css.slice(outdoorAt) };

function token(theme: string, name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6});`).exec(theme);
  if (!m?.[1]) throw new Error(`${name} missing`);
  return m[1];
}
function luminance(hex: string): number {
  const ch = (at: number) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground, background, minimum] — the pairs THEME.md "Palette" promises. */
const TEXT: [string, string, number][] = [
  ['--ink', '--surface', 4.5],
  ['--ink', '--bg', 4.5],
  ['--ink-2', '--surface', 4.5],
  ['--muted', '--surface', 4.5],
  ['--muted', '--bg', 4.5],
  ['--accent', '--surface', 4.5],
  ['--accent', '--bg', 4.5],
  ['--accent-ink', '--accent-tint', 4.5],
  ['--on-accent', '--accent', 4.5],
  ['--warn', '--surface', 4.5],
  ['--warn', '--warn-tint', 4.5],
  ['--alliance-red', '--surface', 4.5],
  ['--alliance-red', '--alliance-red-tint', 4.5],
  ['--alliance-blue', '--surface', 4.5],
  ['--alliance-blue', '--alliance-blue-tint', 4.5],
  // A picked station tile: white text on the strong fill, and the YOUR STATION tag's
  // strong-colour text on its white background (the same two colours, either way round).
  ['--on-accent', '--alliance-red-strong', 4.5],
  ['--on-accent', '--alliance-blue-strong', 4.5],
  ['--alliance-red-strong', '--on-accent', 4.5],
  ['--alliance-blue-strong', '--on-accent', 4.5],
  ['--rail-ink', '--rail', 4.5],
  ['--rail-muted', '--rail', 4.5],
  ['--rail-ink', '--rail', 3],
  ['--rail-ink', '--rail-raised', 3],
  ['--control-border', '--surface', 3],
  ['--control-border', '--bg', 3],
  // Waiting to send on the rail (task 1.38): the sync dot and the bottom bar's count.
  ['--rail-warn', '--rail', 3],
  ['--on-rail-warn', '--rail-warn', 4.5],
  // The QR receiver's done screen (task 1.48): its detail lines on the whole-screen --accent.
  ['--on-accent-soft', '--accent', 4.5],
];

describe.each(Object.entries(THEMES))('%s theme contrast (SPEC-FINAL 17.7)', (_name, theme) => {
  it.each(TEXT)('%s on %s ≥ %s', (fg, bg, min) => {
    expect(ratio(token(theme, fg), token(theme, bg))).toBeGreaterThanOrEqual(min);
  });
});

describe('the picked station tile pairs (THEME.md "Palette")', () => {
  it.each([
    ['--alliance-red-strong', 7.47],
    ['--alliance-blue-strong', 7.4],
  ])('light: white on %s is %s:1', (strong, want) => {
    const got = ratio(token(THEMES.light, '--on-accent'), token(THEMES.light, strong));
    expect(Math.round(got * 100) / 100).toBe(want);
  });

  it.each(['--alliance-red', '--alliance-blue'])(
    'outdoor: %s-strong is no lighter than the outdoor %s',
    (base) => {
      const strong = token(THEMES.outdoor, `${base}-strong`);
      const white = token(THEMES.outdoor, '--on-accent');
      expect(ratio(white, strong)).toBeGreaterThanOrEqual(
        ratio(white, token(THEMES.outdoor, base)),
      );
    },
  );
});

/*
 * The sticky match timer (THEME "Sticky match timer", outdoor check 2026-10-09; task 1.34). Its
 * colours are tokens with outdoor values: the amber countdown is text on the --rail-raised bar
 * (4.5:1), and every segment of the phase bar is a graphic against that bar (3:1). The mockup's
 * literal rest colour was 1.42:1, and --accent is under 3:1 there, which is why the current
 * phase fills with its own token. Phase tag and Start match keep white on --accent (above).
 */
describe.each(Object.entries(THEMES))('%s sticky match timer contrast', (_name, theme) => {
  it('the last-10-s countdown is ≥ 4.5:1 on the bar', () => {
    expect(
      ratio(token(theme, '--timer-warn'), token(theme, '--rail-raised')),
    ).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['--timer-bar-rest', '--timer-bar-done', '--timer-bar-fill'])(
    '%s is ≥ 3:1 against the bar',
    (segment) => {
      expect(ratio(token(theme, segment), token(theme, '--rail-raised'))).toBeGreaterThanOrEqual(3);
    },
  );
  it('the rail-ink total and reset are ≥ 4.5:1 on the bar', () => {
    expect(ratio(token(theme, '--rail-ink'), token(theme, '--rail-raised'))).toBeGreaterThanOrEqual(
      4.5,
    );
  });
  it('done and rest segments are told apart (≥ 2:1 between them)', () => {
    expect(
      ratio(token(theme, '--timer-bar-done'), token(theme, '--timer-bar-rest')),
    ).toBeGreaterThanOrEqual(2);
  });
});
