import { describe, expect, it } from 'vitest';
import { FIELD_TYPES } from '../forms/config';
import { SCORABLE_FIELD_TYPES } from '../forms/scoring';
import type { FormFieldDefinition } from '../forms/types';
import { hydrateComputed, scoreEntry, scoreField } from './score';
import type { EngineEntry, ScoringRule } from './types';

const field = (
  key: string,
  type: FormFieldDefinition['type'],
  config: Record<string, unknown> = {},
): FormFieldDefinition => ({
  id: key,
  key,
  label: key,
  help_text: null,
  type,
  section: null,
  display_order: 1,
  required: false,
  default_value: null,
  config,
  visibility_condition: null,
  deprecated: false,
  description: 'x',
  unit: 'count',
  phase: 'auto',
  direction: 'higher_is_better',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
});

const rule = (
  field_key: string,
  points: number,
  option_points: Record<string, number> | null = null,
): ScoringRule => ({ field_key, points, option_points });

type Scored = Pick<EngineEntry, 'robot_status' | 'data'>;
const scored = (robot_status: Scored['robot_status'], data: Record<string, unknown>): Scored => ({
  robot_status,
  data,
});

const options = {
  options: [
    { value: 'none', label: 'None' },
    { value: 'high', label: 'High' },
  ],
};

describe('scoreField (SPEC-FINAL 4.1)', () => {
  it('gives a toggle its points when true and zero when false', () => {
    expect(scoreField(field('t', 'toggle'), rule('t', 2), true)).toBe(2);
    expect(scoreField(field('t', 'toggle'), rule('t', 2), false)).toBe(0);
  });

  it('multiplies a counter and a number by their points per unit', () => {
    expect(scoreField(field('c', 'counter'), rule('c', 5), 3)).toBe(15);
    expect(scoreField(field('n', 'number'), rule('n', 0.5), 4)).toBe(2);
  });

  it('reads option points for a single select', () => {
    expect(
      scoreField(field('s', 'single_select', options), rule('s', 0, { none: 0, high: 10 }), 'high'),
    ).toBe(10);
  });

  it('sums option points for a multi select', () => {
    expect(
      scoreField(field('m', 'multi_select', options), rule('m', 0, { none: 1, high: 10 }), [
        'none',
        'high',
      ]),
    ).toBe(11);
  });

  it('counts each selected option of a multi select once, even if the payload repeats it', () => {
    expect(
      scoreField(field('m', 'multi_select', options), rule('m', 0, { high: 10 }), ['high', 'high']),
    ).toBe(10);
  });

  it('scores nothing at all for every unscorable type', () => {
    for (const type of [
      'rating',
      'timer',
      'event_log',
      'position',
      'cycle_path',
      'short_text',
      'long_text',
      'computed',
      'section',
    ] as const) {
      expect(scoreField(field('x', type), rule('x', 5), 3), type).toBe(0);
    }
  });

  it('scores nothing for any type outside the five of 4.1, even when a rule names it', () => {
    const scorable: readonly string[] = SCORABLE_FIELD_TYPES;
    const unscorable = FIELD_TYPES.filter((t) => !scorable.includes(t));
    expect(unscorable).toHaveLength(FIELD_TYPES.length - 5);
    const values: unknown[] = [3, true, 'high', ['high'], [{ type: 'score', t: 1 }], 'text'];
    for (const type of unscorable) {
      for (const value of values) {
        expect(scoreField(field('x', type, options), rule('x', 5, { high: 10 }), value), type).toBe(
          0,
        );
      }
    }
  });

  it('scores nothing for a field with no rule', () => {
    expect(scoreField(field('c', 'counter'), undefined, 9)).toBe(0);
    expect(scoreField(field('t', 'toggle'), undefined, true)).toBe(0);
  });

  it('treats a missing value as zero points, not as a null score', () => {
    expect(scoreField(field('c', 'counter'), rule('c', 5), undefined)).toBe(0);
    expect(scoreField(field('c', 'counter'), rule('c', 5), null)).toBe(0);
    expect(scoreField(field('s', 'single_select', options), rule('s', 0, { high: 10 }), null)).toBe(
      0,
    );
    expect(scoreField(field('m', 'multi_select', options), rule('m', 0, { high: 10 }), null)).toBe(
      0,
    );
  });

  it('scores a value of the wrong shape as zero rather than coercing it', () => {
    expect(scoreField(field('c', 'counter'), rule('c', 5), '3')).toBe(0);
    expect(scoreField(field('c', 'counter'), rule('c', 5), Number.NaN)).toBe(0);
    expect(scoreField(field('c', 'counter'), rule('c', 5), Number.POSITIVE_INFINITY)).toBe(0);
    expect(scoreField(field('t', 'toggle'), rule('t', 2), 'true')).toBe(0);
    expect(scoreField(field('t', 'toggle'), rule('t', 2), 1)).toBe(0);
  });

  it('treats an unknown option as zero rather than throwing', () => {
    expect(
      scoreField(field('s', 'single_select', options), rule('s', 0, { high: 10 }), 'moon'),
    ).toBe(0);
  });

  it('never reads an option score off Object.prototype', () => {
    const select = field('s', 'single_select', options);
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(scoreField(select, rule('s', 0, { high: 10 }), key), key).toBe(0);
    }
    expect(
      scoreField(field('m', 'multi_select', options), rule('m', 0, { high: 10 }), [
        'high',
        'constructor',
      ]),
    ).toBe(10);
  });

  it('never returns a negative score, because penalties are data and not deductions', () => {
    expect(scoreField(field('c', 'counter'), rule('c', 0), 5)).toBe(0);
    // A negative rule never reaches the table (validateScoringRules), but if one did, it
    // would score nothing rather than subtract.
    expect(scoreField(field('c', 'counter'), rule('c', -3), 5)).toBe(0);
    expect(scoreField(field('t', 'toggle'), rule('t', -3), true)).toBe(0);
    expect(scoreField(field('n', 'number'), rule('n', 2), -4)).toBe(0);
    expect(
      scoreField(field('s', 'single_select', options), rule('s', 0, { high: -10 }), 'high'),
    ).toBe(0);
    expect(
      scoreField(field('m', 'multi_select', options), rule('m', 0, { none: -5, high: 10 }), [
        'none',
        'high',
      ]),
    ).toBe(10);
  });

  it('scores nothing for points that are not a finite number', () => {
    expect(scoreField(field('c', 'counter'), rule('c', Number.NaN), 5)).toBe(0);
    expect(scoreField(field('t', 'toggle'), rule('t', Number.POSITIVE_INFINITY), true)).toBe(0);
  });
});

describe('scoreEntry', () => {
  const fields = [
    field('auto', 'counter'),
    field('climb', 'single_select', options),
    field('notes', 'long_text'),
  ];
  const rules = [rule('auto', 5), rule('climb', 0, { none: 0, high: 10 })];

  it('sums the field points of one robot', () => {
    expect(
      scoreEntry(scored('played', { auto: 3, climb: 'high', notes: 'x' }), fields, rules),
    ).toBe(25);
  });

  it('scores a broke_down robot on the data it did record', () => {
    expect(scoreEntry(scored('broke_down', { auto: 1 }), fields, rules)).toBe(5);
  });

  it('returns null, never zero, for a no-show or a disabled robot', () => {
    expect(scoreEntry(scored('no_show', {}), fields, rules)).toBeNull();
    expect(scoreEntry(scored('disabled', {}), fields, rules)).toBeNull();
  });

  it('returns null for a dead robot even if its payload somehow carries values', () => {
    expect(scoreEntry(scored('no_show', { auto: 9, climb: 'high' }), fields, rules)).toBeNull();
    expect(scoreEntry(scored('disabled', { auto: 9, climb: 'high' }), fields, rules)).toBeNull();
  });

  it('gives a played robot that scored nothing a real zero', () => {
    expect(scoreEntry(scored('played', {}), fields, rules)).toBe(0);
  });

  it('scores a super entry, which has no robot status, on its data', () => {
    expect(scoreEntry(scored(null, { auto: 2 }), fields, rules)).toBe(10);
  });

  it('ignores a field that has no scoring rule', () => {
    expect(scoreEntry(scored('played', { notes: 'long note' }), fields, rules)).toBe(0);
  });

  it('ignores a rule that names no field of the set, and a rule on an unscorable field', () => {
    expect(
      scoreEntry(scored('played', { auto: 1, notes: 'x', ghost: 4 }), fields, [
        ...rules,
        rule('ghost', 100),
        rule('notes', 100),
      ]),
    ).toBe(5);
  });

  it('never subtracts a penalty: fouls recorded as data leave the score unchanged', () => {
    const withFouls = [...fields, field('fouls', 'counter')];
    const clean = scoreEntry(scored('played', { auto: 3, fouls: 0 }), withFouls, rules);
    const dirty = scoreEntry(scored('played', { auto: 3, fouls: 7 }), withFouls, rules);
    expect(clean).toBe(15);
    expect(dirty).toBe(15);
  });

  it('scores a key once even if the field set lists it twice', () => {
    const doubled = [field('auto', 'counter'), field('auto', 'counter')];
    expect(scoreEntry(scored('played', { auto: 3 }), doubled, [rule('auto', 5)])).toBe(15);
  });

  it('recomputes a computed field at read time, so an expression fix repairs history', () => {
    const computed = field('total', 'computed');
    computed.config = {
      result_type: 'float',
      expression: {
        kind: 'op',
        op: '*',
        left: { kind: 'field', key: 'auto' },
        right: { kind: 'literal', value: 2 },
      },
    };
    // the stored payload carries a STALE value from an older expression
    const entry = scored('played', { auto: 3, total: 999 });
    const hydrated = hydrateComputed(entry.data, [field('auto', 'counter'), computed]);
    expect(hydrated.total).toBe(6);
    expect(entry.data.total).toBe(999);
  });

  it('never scores a computed field, even with a rule naming it', () => {
    const computed = field('total', 'computed', {
      result_type: 'float',
      expression: { kind: 'field', key: 'auto' },
    });
    expect(
      scoreEntry(
        scored('played', { auto: 3, total: 3 }),
        [field('auto', 'counter'), computed],
        [rule('total', 100)],
      ),
    ).toBe(0);
  });

  it('re-scores immediately when the model changes, because nothing is stored', () => {
    const entry = scored('played', { auto: 3 });
    expect(scoreEntry(entry, fields, [rule('auto', 5)])).toBe(15);
    expect(scoreEntry(entry, fields, [rule('auto', 2)])).toBe(6);
  });
});

describe('hydrateComputed (SPEC-FINAL 5.7)', () => {
  const ratio = field('ratio', 'computed', {
    result_type: 'float',
    expression: {
      kind: 'op',
      op: '/',
      left: { kind: 'field', key: 'a' },
      right: { kind: 'field', key: 'b' },
    },
  });

  it('drops a stale value when the expression now yields null (division by zero)', () => {
    const out = hydrateComputed({ a: 4, b: 0, ratio: 2 }, [ratio]);
    expect('ratio' in out).toBe(false);
    expect(out).toEqual({ a: 4, b: 0 });
  });

  it('drops the value of a computed field with no expression', () => {
    const bare = field('bare', 'computed', { result_type: 'float', expression: null });
    expect(hydrateComputed({ bare: 5 }, [bare])).toEqual({});
  });

  it('records no value for a computed field its own condition hides (5.8)', () => {
    const hidden = { ...ratio, visibility_condition: { field_key: 'show', op: '=', value: true } };
    expect(hydrateComputed({ a: 4, b: 2, show: false }, [hidden as FormFieldDefinition])).toEqual({
      a: 4,
      b: 2,
      show: false,
    });
    expect(hydrateComputed({ a: 4, b: 2, show: true }, [hidden as FormFieldDefinition]).ratio).toBe(
      2,
    );
  });

  it('leaves every non-computed key exactly as stored', () => {
    expect(hydrateComputed({ a: 4, b: 2, extra: 'x' }, [field('a', 'counter'), ratio])).toEqual({
      a: 4,
      b: 2,
      extra: 'x',
      ratio: 2,
    });
  });
});
