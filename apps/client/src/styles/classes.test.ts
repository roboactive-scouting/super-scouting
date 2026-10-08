import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Class-name rules no type checker sees, over every non-test source file in src/
 * (SPEC-FINAL 17.4, 17.7, 17.9; THEME.md "Colour rules").
 */
const SRC = join(import.meta.dirname, '..');
const FILES = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ path: f.replaceAll('\\', '/'), source: readFileSync(join(SRC, f), 'utf8') }));

/** Code without its comments: a comment may say "transition" or "white" in prose. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

function hits(pattern: RegExp, scan: (s: string) => string = code): string[] {
  return FILES.flatMap(({ path, source }) =>
    [...scan(source).matchAll(pattern)].map((m) => `${path}: ${m[0]}`),
  );
}

/** The Tailwind colour-bearing utility prefixes: `text-`, `bg-`, `ring-`, `border-t-` and so on. */
const COLOUR_PREFIX =
  '(?:text|bg|border(?:-[setblrxy])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|divide|decoration|caret|accent|shadow|placeholder)';

/** Not inside a longer word or utility: `go-to-white` is not `to-white`. */
const START = String.raw`(?<![\w-])`;
const END = String.raw`(?![\w-])`;

const PALETTE = new RegExp(
  `${START}${COLOUR_PREFIX}-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-${String.raw`\d{2,3}`})${END}`,
  'g',
);

/** Token names the redesign retired (the aliases RB.18 deleted from theme.css), as any colour utility. */
const RETIRED_TOKEN_UTILITY = new RegExp(
  `${START}${COLOUR_PREFIX}-(?:text-muted|text|border|surface-raised|brand-plate|on-brand|brand|focus|danger|warning|status-[a-z-]+|sync-(?:online|offline|syncing))${END}`,
  'g',
);

const LEGACY_NAME =
  /brand-plate|status-(played|broke|disabled|no-show)|sync-(online|offline|syncing)|PRIMARY_BUTTON|motion-transition|state-layer|enter-(fade|rise|scale|drawer|sheet-up)|usePlayOnChange|var\(--(text|text-muted|border|brand|on-brand|focus|danger|warning)\)/g;

/**
 * Class tokens that move (`animate-*`, `transition*`) without a `motion-safe` variant anywhere in
 * their variant chain. `transition-none` and `animate-none` stop motion, so they are always fine.
 */
function unsafeMotionTokens(source: string): string[] {
  return source.split(/[\s'"`{}(),]+/).filter((token) => {
    const parts = token.split(':');
    const utility = parts[parts.length - 1] ?? '';
    if (!/^(animate-(?!none\b)|transition(-(?!none$)|$))/.test(utility)) return false;
    return !parts.slice(0, -1).includes('motion-safe');
  });
}

describe('class names in src/', () => {
  it('scans the sources (positive control)', () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES.some((f) => f.path === 'components/ui/button.tsx')).toBe(true);
  });

  it('sizes text in rem, never px, so it follows the OS text size (17.7)', () => {
    expect(hits(/text-\[\d+(\.\d+)?px\]/g)).toEqual([]);
  });

  it('colours only through theme tokens: no white, black or Tailwind palette colours', () => {
    expect(hits(PALETTE)).toEqual([]);
  });

  it('uses none of the pre-redesign names or retired token utilities (RB.18)', () => {
    expect(hits(LEGACY_NAME, (s) => s)).toEqual([]);
    expect(hits(RETIRED_TOKEN_UTILITY)).toEqual([]);
  });

  it('moves only under motion-safe:, so reduced motion gets still screens (17.9)', () => {
    const unsafe = FILES.filter(({ path }) => !path.endsWith('.css')).flatMap(({ path, source }) =>
      unsafeMotionTokens(code(source)).map((token) => `${path}: ${token}`),
    );
    expect(unsafe).toEqual([]);
  });
});

describe('the class-name rules themselves', () => {
  const found = (re: RegExp, text: string) => text.match(re) ?? [];

  it('palette: catches white, black and palette steps, with variants', () => {
    for (const bad of [
      'bg-white',
      'text-black',
      'hover:border-red-500',
      'ring-slate-300',
      'to-white',
    ])
      expect(found(PALETTE, bad), bad).toHaveLength(1);
  });

  it('palette: ignores tokens and the same letters inside other words', () => {
    for (const ok of [
      'bg-surface',
      'text-ink',
      'go-to-white',
      'bg-gradient-to-white-ish',
      'text-whitespace',
    ])
      expect(found(PALETTE, ok), ok).toHaveLength(0);
  });

  it('retired tokens: catches every retired name under any utility prefix', () => {
    for (const bad of [
      'text-danger',
      'bg-brand',
      'ring-focus',
      'border-warning',
      'border-t-border',
      'text-text',
      'text-text-muted',
      'bg-surface-raised',
      'text-on-brand',
      'bg-status-played',
      'fill-sync-offline',
      'lg:hover:bg-brand/10',
    ])
      expect(found(RETIRED_TOKEN_UTILITY, bad), bad).toHaveLength(1);
  });

  it('retired tokens: accepts the current names', () => {
    for (const ok of [
      'text-ink',
      'text-muted',
      'bg-accent',
      'ring-accent',
      'border-line',
      'text-warn',
      'border-control-border',
      'focus:ring-2',
      'bg-surface',
    ])
      expect(found(RETIRED_TOKEN_UTILITY, ok), ok).toHaveLength(0);
  });

  it('legacy names: catches the old helpers and variables', () => {
    for (const bad of [
      'brand-plate',
      'motion-transition',
      'state-layer',
      'usePlayOnChange',
      'var(--danger)',
    ])
      expect(found(LEGACY_NAME, bad), bad).toHaveLength(1);
  });

  it('motion: flags a bare transition or animation, or one only under another variant', () => {
    for (const bad of [
      'transition',
      'transition-colors',
      'animate-spin',
      'lg:transition',
      'hover:animate-pulse',
      'motion-reduce:transition',
    ])
      expect(unsafeMotionTokens(bad), bad).toEqual([bad]);
  });

  it('motion: accepts motion-safe in any position, and the none forms', () => {
    for (const ok of [
      'motion-safe:transition',
      'lg:motion-safe:transition',
      'motion-safe:lg:animate-spin',
      'motion-reduce:transition-none',
      'transition-none',
      'animate-none',
      'translate-x-1',
    ])
      expect(unsafeMotionTokens(ok), ok).toEqual([]);
  });
});
