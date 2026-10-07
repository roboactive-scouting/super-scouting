import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import { displayValue, donePhases, filledCount, isFilled, phasesOf, swipeStep } from './phases';

const f = (key: string, phase: FormFieldDefinition['phase'], over: object = {}) =>
  ({ key, label: key, type: 'counter', phase, config: {}, ...over }) as FormFieldDefinition;

describe('entry phases', () => {
  it('orders phases by the match, drops empty ones, and files a phaseless field under notes', () => {
    const phases = phasesOf([f('n', 'post_match'), f('x', null), f('a', 'auto')]);
    expect(phases.map((p) => p.key)).toEqual(['auto', 'post_match']);
    expect(phases[1]!.fields.map((x) => x.key)).toEqual(['n', 'x']);
  });

  it('counts a chosen 0 or false as filled, an untouched or empty field as not', () => {
    expect([0, false, 'x'].every(isFilled)).toBe(true);
    expect([undefined, null, ''].some(isFilled)).toBe(false);
    const [auto] = phasesOf([f('a', 'auto'), f('b', 'auto')]);
    expect(filledCount(auto!, { a: 0 })).toBe(1);
    expect(donePhases(phasesOf([f('a', 'auto'), f('t', 'teleop')]), { t: 3 })).toEqual(
      new Set(['teleop']),
    );
  });

  it('turns a sideways gesture of 60 px or more into a step, and ignores a scroll', () => {
    expect(swipeStep(-60, 5)).toBe(1);
    expect(swipeStep(80, -10)).toBe(-1);
    expect(swipeStep(-59, 0)).toBe(0);
    expect(swipeStep(-70, 90)).toBe(0);
  });

  it('reads values for the confirm list', () => {
    expect(displayValue(f('t', 'auto', { type: 'toggle' }), false)).toBe('No');
    const select = f('c', 'endgame', {
      type: 'single_select',
      config: { options: [{ value: 'deep', label: 'Deep' }] },
    });
    expect(displayValue(select, 'deep')).toBe('Deep');
    // an untouched control reads what it shows; a text or a choice has nothing to show
    expect(displayValue(f('a', 'auto'), undefined)).toBe('0');
    expect(displayValue(f('t', 'auto', { type: 'toggle' }), undefined)).toBe('No');
    expect(displayValue(f('c', 'endgame', { type: 'single_select' }), undefined)).toBe('—');
    expect(displayValue(f('n', 'post_match', { type: 'long_text' }), '')).toBe('—');
    expect(displayValue(f('a', 'auto'), 3)).toBe('3');
  });
});
