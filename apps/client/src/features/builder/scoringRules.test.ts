import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { scoringUniverse, type FieldTypeName } from '@frc/shared';
import { field } from '@/test/formFixtures';
import { isZeroRule, ruleLost, ruleOf, useScoring, wholeRuleSet } from './scoringRules';

const select = (key: string, values: string[]) =>
  field({
    key,
    type: 'single_select',
    config: { options: values.map((value) => ({ value, label: value })) },
  });

describe('scoring rules (task 1.30)', () => {
  it('reads a row’s rule; 0 everywhere is no rule', () => {
    expect(ruleOf(field({ key: 'a', points: null, option_points: null }))).toBeNull();
    expect(ruleOf(field({ key: 'a', points: 4 }))).toEqual({ points: 4, option_points: null });
    expect(isZeroRule({ points: 0, option_points: { a: 0 } })).toBe(true);
    expect(isZeroRule({ points: 0, option_points: { a: 2 } })).toBe(false);
  });

  it('a rule is lost only where the type cannot carry it (fix round 1, I1)', () => {
    const each = { points: 4, option_points: null };
    const byOption = { points: 0, option_points: { none: 0, high: 12 } };
    // A counter's points carry to a number or a toggle; a select's to the other select.
    expect(ruleLost('number', each)).toBe(false);
    expect(ruleLost('toggle', each)).toBe(false);
    expect(ruleLost('multi_select', byOption)).toBe(false);
    // Not scored, or select ↔ non-select: lost.
    expect(ruleLost('long_text', each)).toBe(true);
    expect(ruleLost('single_select', each)).toBe(true);
    expect(ruleLost('counter', byOption)).toBe(true);
    // A rule that scores nothing is never lost.
    expect(ruleLost('long_text', { points: 0, option_points: null })).toBe(false);
  });

  it('a type that loses the rule makes the scoring dirty; a type that keeps it does not', () => {
    const row = field({ key: 'tele_high', points: 4 });
    const live = (type: FieldTypeName) => [{ id: row.id, type }];
    const { result, rerender } = renderHook(({ type }) => useScoring([row], live(type)), {
      initialProps: { type: 'counter' as FieldTypeName },
    });
    expect(result.current.dirty).toBe(false);
    rerender({ type: 'number' });
    expect(result.current.dirty).toBe(false);
    expect(result.current.ruleFor(row.id)).toEqual({ points: 4, option_points: null });
    rerender({ type: 'long_text' });
    expect(result.current.dirty).toBe(true);
    // Once the set is sent without it, the rule is gone here too, and nothing is unsent.
    act(() =>
      result.current.markSent(
        new Map<string, FieldTypeName>([[row.id, 'long_text']]),
        new Set([row.id]),
      ),
    );
    expect(result.current.ruleFor(row.id)).toBeNull();
    expect(result.current.dirty).toBe(false);
  });

  it('markSent drops the rule of a field removed before it was ever saved (final review, I1)', () => {
    const row = field({ key: 'tele_high', points: 4 });
    const { result } = renderHook(() => useScoring([row], [{ id: row.id, type: 'counter' }]));
    // A palette field (new-1) got 5 points, then was removed: its rule is still held.
    act(() => result.current.setRule('new-1', { points: 5, option_points: null }));
    act(() =>
      result.current.markSent(
        new Map<string, FieldTypeName>([[row.id, 'counter']]),
        new Set([row.id]),
      ),
    );
    expect(result.current.ruleFor('new-1')).toBeNull();
    expect(result.current.ruleFor(row.id)).toEqual({ points: 4, option_points: null });
    expect(result.current.dirty).toBe(false);
  });

  it('counts only a rule that changed as this session’s; markSent takes what was sent (I4)', () => {
    const row = field({ key: 'tele_high', points: 4 });
    const { result } = renderHook(() => useScoring([row], [{ id: row.id, type: 'counter' }]));
    act(() => result.current.setRule(row.id, { points: 4, option_points: null }));
    expect(result.current.edited.size).toBe(0);
    act(() => result.current.setRule(row.id, { points: 8, option_points: null }));
    expect([...result.current.edited]).toEqual([row.id]);
    const types = new Map<string, FieldTypeName>([[row.id, 'counter']]);
    act(() =>
      result.current.markSent(
        types,
        new Set([row.id]),
        new Map([[row.id, { points: 9, option_points: null }]]),
      ),
    );
    expect(result.current.ruleFor(row.id)).toEqual({ points: 9, option_points: null });
    expect(result.current.edited.size).toBe(0);
    expect(result.current.dirty).toBe(false);
  });

  it('sends this version’s rules by key, the partner’s for keys it lacks, and nothing outside the universe', () => {
    const mine = [field({ key: 'auto_high' }), select('climb', ['none', 'high'])];
    const retired = field({ key: 'old', deprecated: true });
    const partnerOnly = field({ key: 'tele_high', points: 4 });
    const stale = field({ key: 'auto_high', points: 99 });
    const rules = new Map([
      [mine[0]!.id, { points: 6, option_points: null }],
      [mine[1]!.id, { points: 0, option_points: { none: 0, high: 12, gone: 3 } }],
      [retired.id, { points: 2, option_points: null }],
    ]);
    const universe = scoringUniverse([partnerOnly], mine);
    expect(
      wholeRuleSet({
        live: mine,
        others: [retired],
        partner: [stale, partnerOnly],
        rules,
        universe,
      }),
    ).toEqual([
      { field_key: 'auto_high', points: 6 },
      // An option neither version has is dropped, not sent.
      { field_key: 'climb', points: 0, option_points: { none: 0, high: 12 } },
      { field_key: 'tele_high', points: 4 },
    ]);
  });

  it('drops a rule that scores nothing, and a rule on a type that is not scored', () => {
    const counter = field({ key: 'c' });
    const notes = field({ key: 'n', type: 'long_text' });
    const rules = new Map([
      [counter.id, { points: 0, option_points: null }],
      [notes.id, { points: 3, option_points: null }],
    ]);
    expect(
      wholeRuleSet({
        live: [counter, notes],
        others: [],
        partner: [],
        rules,
        universe: scoringUniverse([], [counter, notes]),
      }),
    ).toEqual([]);
  });
});
