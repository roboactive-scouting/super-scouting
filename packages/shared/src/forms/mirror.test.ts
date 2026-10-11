import { describe, expect, it } from 'vitest';
import { denormalizeForAlliance, normalizeForAlliance } from './mirror';

const p = { x: 0.25, y: 0.75 };

describe('alliance normalization (SPEC-FINAL 5.6)', () => {
  it('leaves red coordinates untouched on every axis', () => {
    for (const axis of ['none', 'horizontal', 'vertical', 'both'] as const) {
      expect(normalizeForAlliance(p, 'red', axis)).toEqual(p);
    }
  });

  it('mirrors blue on the configured axis', () => {
    expect(normalizeForAlliance(p, 'blue', 'none')).toEqual(p);
    expect(normalizeForAlliance(p, 'blue', 'horizontal')).toEqual({ x: 0.75, y: 0.75 });
    expect(normalizeForAlliance(p, 'blue', 'vertical')).toEqual({ x: 0.25, y: 0.25 });
    expect(normalizeForAlliance(p, 'blue', 'both')).toEqual({ x: 0.75, y: 0.25 });
  });

  it('round-trips, so a stored point can be drawn back where it was tapped', () => {
    for (const axis of ['none', 'horizontal', 'vertical', 'both'] as const) {
      const stored = normalizeForAlliance(p, 'blue', axis);
      expect(denormalizeForAlliance(stored, 'blue', axis)).toEqual(p);
    }
  });

  it('keeps every coordinate inside the unit square', () => {
    for (const axis of ['none', 'horizontal', 'vertical', 'both'] as const) {
      const out = normalizeForAlliance({ x: 0, y: 1 }, 'blue', axis);
      expect(out.x).toBeGreaterThanOrEqual(0);
      expect(out.x).toBeLessThanOrEqual(1);
      expect(out.y).toBeGreaterThanOrEqual(0);
      expect(out.y).toBeLessThanOrEqual(1);
    }
  });
});
