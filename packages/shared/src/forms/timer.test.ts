import { describe, expect, it } from 'vitest';
import { timerConfig } from '../api/forms';
import { formatClock, matchEndSeconds, phaseAt, timerConfigSchema } from './timer';

const standard = {
  phases: [
    { phase: 'auto' as const, seconds: 15 },
    { phase: 'teleop' as const, seconds: 135 },
    { phase: 'endgame' as const, seconds: 30 },
  ],
};

describe('timer_config (SPEC-FINAL 8.4)', () => {
  it('accepts the standard shape and an empty phase list', () => {
    expect(timerConfigSchema.parse(standard)).toEqual(standard);
    expect(timerConfigSchema.parse({ phases: [] }).phases).toEqual([]);
  });

  it('uses the same phase vocabulary as field metadata', () => {
    expect(
      timerConfigSchema.safeParse({ phases: [{ phase: 'halftime', seconds: 10 }] }).success,
    ).toBe(false);
  });

  it('refuses a zero or negative duration', () => {
    expect(timerConfigSchema.safeParse({ phases: [{ phase: 'auto', seconds: 0 }] }).success).toBe(
      false,
    );
  });

  it('computes match end as the sum of the phase durations', () => {
    expect(matchEndSeconds(standard)).toBe(180);
  });

  it('has no match end when there are no phases', () => {
    expect(matchEndSeconds({ phases: [] })).toBeNull();
  });

  it('reports which phase a moment falls in, consecutively and in list order', () => {
    expect(phaseAt(standard, 0)).toBe('auto');
    expect(phaseAt(standard, 14.9)).toBe('auto');
    expect(phaseAt(standard, 15)).toBe('teleop');
    expect(phaseAt(standard, 149)).toBe('teleop');
    expect(phaseAt(standard, 150)).toBe('endgame');
    expect(phaseAt(standard, 180)).toBeNull();
  });

  // Beyond the plan: the schema is updateForm's own, so the editor and the server agree.
  it('is the schema updateForm checks, not a second definition', () => {
    expect(timerConfigSchema).toBe(timerConfig);
  });

  it('refuses a phase named twice, a fraction of a second, and more than an hour', () => {
    const twice = timerConfigSchema.safeParse({
      phases: [
        { phase: 'auto', seconds: 15 },
        { phase: 'auto', seconds: 15 },
      ],
    });
    expect(twice.success).toBe(false);
    expect(twice.error?.issues[0]?.path).toEqual(['phases', 1, 'phase']);
    expect(timerConfigSchema.safeParse({ phases: [{ phase: 'auto', seconds: 1.5 }] }).success).toBe(
      false,
    );
    expect(
      timerConfigSchema.safeParse({ phases: [{ phase: 'auto', seconds: 3601 }] }).success,
    ).toBe(false);
    expect(
      timerConfigSchema.safeParse({ phases: [{ phase: 'auto', seconds: 3600 }] }).success,
    ).toBe(true);
  });

  it('formats a length as m:ss', () => {
    expect(formatClock(15)).toBe('0:15');
    expect(formatClock(135)).toBe('2:15');
    expect(formatClock(180)).toBe('3:00');
    expect(formatClock(3600)).toBe('60:00');
  });
});
