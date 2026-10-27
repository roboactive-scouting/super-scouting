import { describe, expect, it } from 'vitest';
import { domainPosition, SHADE_MIX_BEST, SHADE_MIX_WORST, shadeFor } from './shading';

/*
 * Task 1.59's test (pulled forward into task 1.53), adapted to the THEME ramp the user locked on
 * 2026-10-23 (v1.40): one hue, the accent, mixed into the surface 6 % (worst) → 52 % (best) —
 * not red → green — and `neutral` is a FLAT shade (`--line-2`), not "no scale" (null). Null is
 * kept for no value at all, which the caller prints as "—".
 */
const domain = { kind: 'range' as const, min: 0, max: 10 };

describe('value shading (SPEC-FINAL 12.6, THEME "Value shading")', () => {
  it('maps the worst value to the palest end and the best to the darkest for higher_is_better', () => {
    const worst = shadeFor(0, domain, 'higher_is_better')!;
    const best = shadeFor(10, domain, 'higher_is_better')!;
    expect(worst.position).toBe(0);
    expect(best.position).toBe(1);
    expect(worst.mix).toBe(SHADE_MIX_WORST);
    expect(best.mix).toBe(SHADE_MIX_BEST);
    expect(SHADE_MIX_WORST).toBe(6);
    expect(SHADE_MIX_BEST).toBe(52);
  });

  it('inverts the scale for lower_is_better, so the darkest is low', () => {
    expect(shadeFor(0, domain, 'lower_is_better')!.position).toBe(1);
    expect(shadeFor(10, domain, 'lower_is_better')!.position).toBe(0);
    expect(shadeFor(0, domain, 'lower_is_better')!.mix).toBe(52);
  });

  it('shades neutral flat — no ramp at all — even with a domain', () => {
    const neutral = shadeFor(5, domain, 'neutral')!;
    expect(neutral.flat).toBe(true);
    expect(neutral.mix).toBe(0);
    expect(shadeFor(0, domain, 'neutral')).toEqual(shadeFor(10, domain, 'neutral'));
  });

  it('uses a declared expected_range as the domain, not the observed values', () => {
    const declared = { kind: 'range' as const, min: 0, max: 100 };
    expect(shadeFor(10, declared, 'higher_is_better')!.position).toBeCloseTo(0.1, 6);
  });

  it('clamps a value outside the declared range to its end', () => {
    expect(shadeFor(140, { kind: 'range', min: 0, max: 100 }, 'higher_is_better')!.position).toBe(
      1,
    );
    expect(shadeFor(-3, domain, 'higher_is_better')!.position).toBe(0);
  });

  it('fixes the domain at 0 to 1 for a rate, because absolute level matters', () => {
    expect(shadeFor(0.5, { kind: 'rate' }, 'higher_is_better')!.position).toBeCloseTo(0.5, 6);
  });

  it('uses option rank for an ordinal enum, top of the list being the lowest rank', () => {
    const ordinal = { kind: 'ordinal' as const, options: ['none', 'park', 'low', 'high'] };
    expect(shadeFor('none', ordinal, 'higher_is_better')!.position).toBe(0);
    expect(shadeFor('high', ordinal, 'higher_is_better')!.position).toBe(1);
    expect(shadeFor('park', ordinal, 'higher_is_better')!.position).toBeCloseTo(1 / 3, 6);
    // An average rank (the team page's ordinal metric) is placed on the same scale.
    expect(shadeFor(1.5, ordinal, 'higher_is_better')!.position).toBeCloseTo(0.5, 6);
    // An option the list does not hold cannot be placed: no shade.
    expect(shadeFor('deep', ordinal, 'higher_is_better')).toBeNull();
  });

  it('returns null for a missing value, which the caller renders as the no-data em dash', () => {
    expect(shadeFor(null, domain, 'higher_is_better')).toBeNull();
    expect(shadeFor(undefined, domain, 'higher_is_better')).toBeNull();
    expect(shadeFor(Number.NaN, domain, 'higher_is_better')).toBeNull();
    expect(shadeFor(null, domain, 'neutral')).toBeNull();
  });

  it('falls back to a flat shade when min equals max', () => {
    const flat = shadeFor(7, { kind: 'range', min: 7, max: 7 }, 'higher_is_better')!;
    expect(flat.position).toBe(0.5);
    expect(flat.flat).toBe(true);
    expect(flat.mix).toBe(0);
    expect(shadeFor('a', { kind: 'ordinal', options: ['a'] }, 'higher_is_better')!.flat).toBe(true);
  });

  it('is flat when there is a value but no domain to place it in', () => {
    expect(shadeFor(3, null, 'higher_is_better')!.flat).toBe(true);
  });

  it('varies lightness monotonically across the ramp, so it survives colour blindness', () => {
    const lightnesses = [0, 0.25, 0.5, 0.75, 1].map(
      (p) => shadeFor(p * 10, domain, 'higher_is_better')!.lightness,
    );
    const ascending = lightnesses.every((l, i) => i === 0 || l > lightnesses[i - 1]!);
    const descending = lightnesses.every((l, i) => i === 0 || l < lightnesses[i - 1]!);
    expect(ascending || descending).toBe(true);
  });

  it('places a value without the direction for a meter, and a single point at the middle', () => {
    expect(domainPosition(2.5, domain)).toBeCloseTo(0.25, 6);
    expect(domainPosition(4, { kind: 'range', min: 4, max: 4 })).toBe(0.5);
    expect(domainPosition(null, domain)).toBeNull();
    expect(domainPosition(3, null)).toBeNull();
  });
});
