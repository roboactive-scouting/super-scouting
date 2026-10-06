import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DURATION, EASING } from '@/lib/motion';

const css = readFileSync(join(import.meta.dirname, 'motion.css'), 'utf8');
const safeAt = css.indexOf('@media (prefers-reduced-motion: no-preference)');

const EASING_VARS: Record<keyof typeof EASING, string> = {
  standard: '--motion-easing-standard',
  standardDecelerate: '--motion-easing-standard-decelerate',
  standardAccelerate: '--motion-easing-standard-accelerate',
  emphasizedDecelerate: '--motion-easing-emphasized-decelerate',
  emphasizedAccelerate: '--motion-easing-emphasized-accelerate',
};

describe('motion tokens (Material 3 easing and duration, SPEC-FINAL 17.9)', () => {
  it('defines every M3 easing curve at the value lib/motion.ts uses', () => {
    for (const [key, name] of Object.entries(EASING_VARS)) {
      expect(css, name).toContain(`${name}: ${EASING[key as keyof typeof EASING]};`);
    }
  });

  it('defines every M3 duration at the value lib/motion.ts uses', () => {
    for (const [name, ms] of Object.entries(DURATION)) {
      expect(css, name).toContain(`--motion-duration-${name}: ${ms}ms;`);
    }
  });

  it('declares every animation and transition inside the no-preference block only', () => {
    expect(safeAt).toBeGreaterThan(-1);
    const before = css.slice(0, safeAt);
    expect(before).not.toMatch(/\banimation\s*:/);
    expect(before).not.toMatch(/\btransition(-duration|-property)?\s*:/);
  });

  it('never loops: nothing moves on its own', () => {
    expect(css).not.toMatch(/infinite/);
  });
});
