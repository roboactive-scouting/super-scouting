import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from '../forms/types';
import {
  AGGREGATIONS,
  aggregate,
  applyFilters,
  type Aggregation,
  type ComparisonOp,
} from './aggregate';
import { scoreEntry } from './score';
import type { EngineEntry, ScoringRule } from './types';

const n = [4, 8, 15, 16, 23, 42];

describe('aggregations (SPEC-FINAL 11.2)', () => {
  it('computes the plain ones', () => {
    expect(aggregate(n, 'avg')).toBeCloseTo(18, 6);
    expect(aggregate(n, 'median')).toBeCloseTo(15.5, 6);
    expect(aggregate(n, 'sum')).toBe(108);
    expect(aggregate(n, 'min')).toBe(4);
    expect(aggregate(n, 'max')).toBe(42);
    expect(aggregate(n, 'count')).toBe(6);
  });

  it('uses the POPULATION standard deviation and needs at least two values', () => {
    expect(aggregate([2, 4, 4, 4, 5, 5, 7, 9], 'stddev')).toBeCloseTo(2, 6);
    expect(aggregate([5], 'stddev')).toBeNull();
  });

  it('interpolates a percentile linearly', () => {
    expect(aggregate([1, 2, 3, 4], 'percentile', { percentile: 50 })).toBeCloseTo(2.5, 6);
    expect(aggregate([1, 2, 3, 4], 'percentile', { percentile: 25 })).toBeCloseTo(1.75, 6);
    expect(aggregate([1, 2, 3, 4], 'percentile', { percentile: 100 })).toBe(4);
  });

  it('computes rate as a 0..1 fraction, defaulting to points greater than zero', () => {
    expect(aggregate([0, 5, 0, 10], 'rate')).toBeCloseTo(0.5, 6);
    expect(aggregate([1, 2, 3, 4], 'rate', { rate_condition: { op: '>=', value: 3 } })).toBeCloseTo(
      0.5,
      6,
    );
  });

  it('computes the ordinary least-squares slope against the match sequence index', () => {
    expect(aggregate([1, 2, 3, 4], 'slope')).toBeCloseTo(1, 6);
    expect(aggregate([4, 3, 2, 1], 'slope')).toBeCloseTo(-1, 6);
    expect(aggregate([7], 'slope')).toBeNull();
  });

  it('makes best and worst direction-aware, and unavailable for neutral', () => {
    expect(aggregate(n, 'best', undefined, 'higher_is_better')).toBe(42);
    expect(aggregate(n, 'worst', undefined, 'higher_is_better')).toBe(4);
    expect(aggregate(n, 'best', undefined, 'lower_is_better')).toBe(4);
    expect(aggregate(n, 'worst', undefined, 'lower_is_better')).toBe(42);
    expect(aggregate(n, 'best', undefined, 'neutral')).toBeNull();
  });

  it('resolves a mode tie to the earliest option in the field list, and to the smallest numeric', () => {
    expect(
      aggregate(['high', 'none', 'high', 'none'], 'mode', { option_order: ['none', 'high'] }),
    ).toBe('none');
    expect(aggregate([3, 1, 3, 1], 'mode')).toBe(1);
  });

  it('orders a distribution by the option list for selects and ascending for numerics', () => {
    expect(
      aggregate(['high', 'none', 'high'], 'distribution', { option_order: ['none', 'high'] }),
    ).toEqual([
      { value: 'none', count: 1 },
      { value: 'high', count: 2 },
    ]);
    expect(aggregate([3, 1, 3], 'distribution')).toEqual([
      { value: 1, count: 1 },
      { value: 3, count: 2 },
    ]);
  });

  it('returns null on an empty value set for EVERY aggregation, never zero', () => {
    for (const aggregation of [
      'avg',
      'median',
      'sum',
      'min',
      'max',
      'count',
      'stddev',
      'percentile',
      'rate',
      'slope',
      'best',
      'worst',
      'mode',
      'distribution',
    ] as const) {
      expect(aggregate([], aggregation, { percentile: 50 }), aggregation).toBeNull();
    }
  });

  it('works on a sample of one, because the minimum sample size is one', () => {
    expect(aggregate([7], 'avg')).toBe(7);
    expect(aggregate([7], 'rate')).toBe(1);
  });

  it('ignores null values rather than treating them as zero', () => {
    expect(aggregate([4, null, 8] as never, 'avg')).toBeCloseTo(6, 6);
  });
});

const NUMERIC: Aggregation[] = [
  'avg',
  'median',
  'sum',
  'min',
  'max',
  'stddev',
  'percentile',
  'slope',
  'best',
  'worst',
];
const opts = { percentile: 50 };

describe('degenerate input: null, never zero (SPEC-FINAL 11.2)', () => {
  it('lists every aggregation of the spec', () => {
    expect([...AGGREGATIONS].sort()).toEqual(
      [
        'avg',
        'median',
        'sum',
        'min',
        'max',
        'count',
        'stddev',
        'percentile',
        'rate',
        'slope',
        'best',
        'worst',
        'mode',
        'distribution',
      ].sort(),
    );
  });

  it.each(AGGREGATIONS)('%s returns null on an empty value set', (aggregation) => {
    expect(aggregate([], aggregation, opts)).toBeNull();
  });

  it.each(AGGREGATIONS)('%s returns null when every value is null or undefined', (aggregation) => {
    expect(aggregate([null, undefined, null], aggregation, opts)).toBeNull();
  });

  it.each(AGGREGATIONS)('%s returns null when every value is NaN or ±Infinity', (aggregation) => {
    expect(aggregate([NaN, Infinity, -Infinity], aggregation, opts)).toBeNull();
  });

  it.each(NUMERIC)('%s returns null when no value is a number, rather than coercing', (agg) => {
    expect(aggregate(['5', true, 'high', [1, 2], { x: 1 }], agg, opts)).toBeNull();
  });

  it('a numeric aggregation reads only the numbers among mixed values', () => {
    expect(aggregate([4, '100', true, 8], 'avg')).toBe(6);
    expect(aggregate([4, '100', true, 8], 'max')).toBe(8);
  });

  it('mode and distribution return null when there is no category to count', () => {
    for (const agg of ['mode', 'distribution'] as const) {
      expect(aggregate([[], [], { x: 1, y: 2 }], agg), agg).toBeNull();
    }
  });

  it('drops NaN and Infinity from every count and denominator, not treating them as zero', () => {
    expect(aggregate([4, NaN, 8, Infinity], 'avg')).toBe(6);
    expect(aggregate([4, NaN, 8, -Infinity], 'min')).toBe(4);
    expect(aggregate([4, NaN, 8], 'count')).toBe(2);
    expect(aggregate([0, NaN, 5], 'rate')).toBe(0.5);
    expect(aggregate([NaN, 3, 3, NaN, NaN], 'mode')).toBe(3);
  });

  it('drops nulls from count and from rate’s denominator', () => {
    expect(aggregate([0, null, 5, undefined], 'count')).toBe(2);
    expect(aggregate([0, null, 5, undefined], 'rate')).toBe(0.5);
    expect(aggregate([null, 1, null, 2, null, 3], 'slope')).toBeCloseTo(1, 9);
  });

  it('gives every aggregation its answer on a sample of one', () => {
    const one = [7];
    expect(aggregate(one, 'avg')).toBe(7);
    expect(aggregate(one, 'median')).toBe(7);
    expect(aggregate(one, 'sum')).toBe(7);
    expect(aggregate(one, 'min')).toBe(7);
    expect(aggregate(one, 'max')).toBe(7);
    expect(aggregate(one, 'count')).toBe(1);
    expect(aggregate(one, 'stddev')).toBeNull();
    expect(aggregate(one, 'percentile', { percentile: 10 })).toBe(7);
    expect(aggregate(one, 'rate')).toBe(1);
    expect(aggregate(one, 'slope')).toBeNull();
    expect(aggregate(one, 'best')).toBe(7);
    expect(aggregate(one, 'worst')).toBe(7);
    expect(aggregate(one, 'mode')).toBe(7);
    expect(aggregate(one, 'distribution')).toEqual([{ value: 7, count: 1 }]);
  });

  it('a real zero is a value: zeros are counted, averaged and summed as zero', () => {
    expect(aggregate([0, 0], 'avg')).toBe(0);
    expect(aggregate([0, 0], 'sum')).toBe(0);
    expect(aggregate([0, 0], 'count')).toBe(2);
    expect(aggregate([0, 0], 'rate')).toBe(0);
    expect(aggregate([0, 0], 'stddev')).toBe(0);
  });

  it('returns null when a result overflows, never Infinity', () => {
    expect(aggregate([Number.MAX_VALUE, Number.MAX_VALUE], 'sum')).toBeNull();
    expect(aggregate([Number.MAX_VALUE, Number.MAX_VALUE], 'avg')).toBeNull();
    expect(aggregate([-Number.MAX_VALUE, Number.MAX_VALUE], 'stddev')).toBeNull();
    expect(aggregate([Number.MAX_VALUE, Number.MAX_VALUE], 'max')).toBe(Number.MAX_VALUE);
  });

  it('never returns negative zero', () => {
    expect(Object.is(aggregate([5, 5, 5], 'slope'), 0)).toBe(true);
    expect(Object.is(aggregate([-0, -0], 'sum'), 0)).toBe(true);
    expect(Object.is(aggregate([-0], 'avg'), 0)).toBe(true);
  });

  it('does not reorder or change its input', () => {
    const values = [3, 1, 2];
    aggregate(values, 'median');
    aggregate(values, 'percentile', { percentile: 90 });
    aggregate(values, 'distribution');
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('aggregation details', () => {
  it('takes the median of an odd count as its middle value', () => {
    expect(aggregate([9, 1, 5], 'median')).toBe(5);
  });

  it('handles negative values', () => {
    expect(aggregate([-3, -1, -2], 'min')).toBe(-3);
    expect(aggregate([-3, -1, -2], 'avg')).toBe(-2);
    expect(aggregate([-3, -1, -2], 'best', undefined, 'lower_is_better')).toBe(-3);
  });

  it('gives a zero standard deviation for equal values, and the population one for two', () => {
    expect(aggregate([4, 4, 4], 'stddev')).toBe(0);
    expect(aggregate([1, 3], 'stddev')).toBeCloseTo(1, 9); // sample stddev would be √2
  });

  it('sorts numerically, not as strings, before taking a percentile', () => {
    expect(aggregate([10, 9, 100], 'median')).toBe(10);
    expect(aggregate([10, 9, 100], 'percentile', { percentile: 0 })).toBe(9);
  });

  it('returns null for a missing or out-of-range percentile rather than guessing one', () => {
    expect(aggregate([1, 2, 3], 'percentile')).toBeNull();
    expect(aggregate([1, 2, 3], 'percentile', {})).toBeNull();
    expect(aggregate([1, 2, 3], 'percentile', { percentile: -1 })).toBeNull();
    expect(aggregate([1, 2, 3], 'percentile', { percentile: 101 })).toBeNull();
    expect(aggregate([1, 2, 3], 'percentile', { percentile: NaN })).toBeNull();
    expect(aggregate([1, 2, 3], 'percentile', { percentile: '50' as never })).toBeNull();
  });

  it('computes the slope through two points and against index, not value order', () => {
    expect(aggregate([10, 4], 'slope')).toBeCloseTo(-6, 9);
    // OLS through (1,2) (2,4) (3,3): slope 0.5, whatever the values' sorted order would say
    expect(aggregate([2, 4, 3], 'slope')).toBeCloseTo(0.5, 9);
  });

  it('counts a toggle’s true as a hit by default, and false as a miss', () => {
    expect(aggregate([true, false, true, true], 'rate')).toBe(0.75);
    expect(aggregate([false, false], 'rate')).toBe(0);
  });

  it('judges an explicit rate condition with the visibility-condition rule', () => {
    expect(
      aggregate(['high', 'none'], 'rate', { rate_condition: { op: '=', value: 'high' } }),
    ).toBe(0.5);
    expect(aggregate([1, 2], 'rate', { rate_condition: { op: '!=', value: 1 } })).toBe(0.5);
    // an ordered operator never holds for a non-number
    expect(aggregate(['5', 6], 'rate', { rate_condition: { op: '>', value: 1 } })).toBe(0.5);
  });

  it('makes worst unavailable for neutral too, and for an unknown direction', () => {
    expect(aggregate(n, 'worst', undefined, 'neutral')).toBeNull();
    expect(aggregate(n, 'best', undefined, 'sideways' as never)).toBeNull();
  });

  it('defaults best to higher-is-better when no direction is given', () => {
    expect(aggregate(n, 'best')).toBe(42);
    expect(aggregate(n, 'worst')).toBe(4);
  });

  it('breaks a string mode tie by code unit order when there is no option list', () => {
    expect(aggregate(['b', 'a', 'b', 'a'], 'mode')).toBe('a');
  });

  it('puts an option missing from the list after the listed ones', () => {
    const order = { option_order: ['low', 'high'] };
    expect(aggregate(['old', 'high', 'old', 'high'], 'mode', order)).toBe('high');
    expect(aggregate(['old', 'high', 'low'], 'distribution', order)).toEqual([
      { value: 'low', count: 1 },
      { value: 'high', count: 1 },
      { value: 'old', count: 1 },
    ]);
  });

  it('a clear mode wins over the option order', () => {
    expect(aggregate(['high', 'high', 'none'], 'mode', { option_order: ['none', 'high'] })).toBe(
      'high',
    );
  });

  it('counts each option of a multi select once per entry', () => {
    const values = [['a', 'b', 'a'], ['b'], []];
    expect(aggregate(values, 'distribution', { option_order: ['a', 'b'] })).toEqual([
      { value: 'a', count: 1 },
      { value: 'b', count: 2 },
    ]);
    expect(aggregate(values, 'mode', { option_order: ['a', 'b'] })).toBe('b');
    expect(aggregate(values, 'count')).toBe(3);
  });

  it('counts booleans, false before true', () => {
    expect(aggregate([true, false, true], 'distribution')).toEqual([
      { value: false, count: 1 },
      { value: true, count: 2 },
    ]);
    expect(aggregate([true, false], 'mode')).toBe(false);
  });

  it('keeps the number 1 and the string "1" apart', () => {
    expect(aggregate([1, '1', 1], 'distribution')).toEqual([
      { value: 1, count: 2 },
      { value: '1', count: 1 },
    ]);
  });

  it('returns null for an aggregation outside the catalogue', () => {
    expect(aggregate(n, 'variance' as never)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------

const entry = (over: Partial<EngineEntry>): EngineEntry => ({
  id: `e-${over.team_id ?? 't-1'}-${over.match_number ?? 1}`,
  form_version_id: 'fv-1',
  form_kind: 'match',
  event_id: 'ev-1',
  match_id: `m-${over.event_id ?? 'ev-1'}-${over.match_number ?? 1}`,
  team_id: 't-1',
  alliance: 'red',
  scouter_id: 'u-1',
  robot_status: 'played',
  data: {},
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  deleted_at: null,
  match_type: 'qualification',
  match_number: 1,
  event_sort_order: 1,
  ...over,
});

/** Match `m` of team t-1 at ev-1 with `auto` = value. */
const m = (match_number: number, auto: unknown, over: Partial<EngineEntry> = {}) =>
  entry({ match_number, data: { auto }, ...over });

const fieldDef = (
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

const fields = [fieldDef('auto', 'counter')];
const values = (entries: EngineEntry[], key = 'auto') => entries.map((e) => e.data[key]);
const matches = (entries: EngineEntry[]) => entries.map((e) => e.match_number);

describe('applyFilters (SPEC-FINAL 11.2 evaluation order)', () => {
  const five = [m(1, 2), m(2, 9), m(3, 1), m(4, 7), m(5, 8)];

  it('applies field_filters BEFORE last_n_matches', () => {
    // filter first → {2, 4, 5} → last two → {4, 5}
    const out = applyFilters(
      five,
      { field_filters: [{ field_key: 'auto', op: '>=', value: 5 }], last_n_matches: 2 },
      fields,
    );
    expect(matches(out)).toEqual([4, 5]);
    // filter first → {2}; the wrong order (last two, then filter) would give {}
    const out2 = applyFilters(
      five,
      { field_filters: [{ field_key: 'auto', op: '>', value: 8 }], last_n_matches: 2 },
      fields,
    );
    expect(matches(out2)).toEqual([2]);
  });

  it('applies exclude_match_numbers BEFORE last_n_matches', () => {
    const out = applyFilters(five, { exclude_match_numbers: [5], last_n_matches: 2 }, fields);
    expect(matches(out)).toEqual([3, 4]);
  });

  it('applies the status rule BEFORE last_n_matches, so a no-show does not use up a slot', () => {
    const rows = [m(1, 2), m(2, 9), m(3, 0, { robot_status: 'no_show' })];
    expect(matches(applyFilters(rows, { last_n_matches: 2 }, fields))).toEqual([1, 2]);
  });

  it('applies qualification-only BEFORE last_n_matches', () => {
    const rows = [m(1, 2), m(2, 9), m(3, 5, { match_type: 'playoff', match_id: 'p-1' })];
    expect(matches(applyFilters(rows, { last_n_matches: 2 }, fields))).toEqual([1, 2]);
  });

  it('applies field_filters BEFORE exclude_match_numbers and both before last N', () => {
    const out = applyFilters(
      five,
      {
        field_filters: [{ field_key: 'auto', op: '>', value: 1 }],
        exclude_match_numbers: [4],
        last_n_matches: 2,
      },
      fields,
    );
    expect(matches(out)).toEqual([2, 5]);
  });

  it('orders "last N" by event sort_order, then match number, whatever the input order', () => {
    const rows = [
      m(2, 'A2', { event_id: 'ev-a', event_sort_order: 2 }),
      m(9, 'B9', { event_id: 'ev-b', event_sort_order: 1 }),
      m(1, 'A1', { event_id: 'ev-a', event_sort_order: 2 }),
      m(10, 'B10', { event_id: 'ev-b', event_sort_order: 1 }),
    ];
    expect(values(applyFilters(rows, {}, fields))).toEqual(['B9', 'B10', 'A1', 'A2']);
    expect(values(applyFilters(rows, { last_n_matches: 3 }, fields))).toEqual(['B10', 'A1', 'A2']);
    expect(values(applyFilters([...rows].reverse(), { last_n_matches: 3 }, fields))).toEqual([
      'B10',
      'A1',
      'A2',
    ]);
  });

  it('orders match numbers numerically, not as strings', () => {
    const rows = [m(10, 10), m(9, 9), m(2, 2)];
    expect(matches(applyFilters(rows, { last_n_matches: 2 }, fields))).toEqual([9, 10]);
  });

  it('feeds slope the sequence order, so a rising team has a positive slope', () => {
    const rows = [m(3, 30), m(1, 10), m(2, 20)];
    expect(aggregate(values(applyFilters(rows, {}, fields)), 'slope')).toBeCloseTo(10, 9);
  });

  it('keeps each team’s own last N in a multi-team population', () => {
    const rows = [
      m(1, 1),
      m(2, 2),
      m(3, 3),
      m(1, 10, { team_id: 't-2' }),
      m(4, 40, { team_id: 't-2' }),
    ];
    const out = applyFilters(rows, { last_n_matches: 1 }, fields);
    expect(out.map((e) => [e.team_id, e.match_number])).toEqual([
      ['t-1', 3],
      ['t-2', 4],
    ]);
  });

  it('keeps everything when N exceeds the population, and nothing for N ≤ 0 or NaN', () => {
    expect(matches(applyFilters(five, { last_n_matches: 50 }, fields))).toEqual([1, 2, 3, 4, 5]);
    expect(applyFilters(five, { last_n_matches: 0 }, fields)).toEqual([]);
    expect(applyFilters(five, { last_n_matches: -2 }, fields)).toEqual([]);
    expect(applyFilters(five, { last_n_matches: NaN }, fields)).toEqual([]);
    expect(matches(applyFilters(five, { last_n_matches: 2.9 }, fields))).toEqual([4, 5]);
  });

  it('excludes the listed match numbers', () => {
    expect(matches(applyFilters(five, { exclude_match_numbers: [1, 3] }, fields))).toEqual([
      2, 4, 5,
    ]);
  });

  it('treats empty filter lists as no filter', () => {
    const out = applyFilters(
      five,
      { exclude_match_numbers: [], robot_status: [], field_filters: [] },
      fields,
    );
    expect(matches(out)).toEqual([1, 2, 3, 4, 5]);
  });

  it.each<[ComparisonOp, unknown, number[]]>([
    ['=', 7, [4]],
    ['!=', 7, [1, 2, 3, 5]],
    ['>', 7, [2, 5]],
    ['<', 7, [1, 3]],
    ['>=', 7, [2, 4, 5]],
    ['<=', 7, [1, 3, 4]],
  ])('field filter %s %s', (op, value, expected) => {
    const out = applyFilters(five, { field_filters: [{ field_key: 'auto', op, value }] }, fields);
    expect(matches(out)).toEqual(expected);
  });

  it('never holds an ordered field filter on a non-number, and = is strict', () => {
    const rows = [m(1, '9'), m(2, 9), m(3, true)];
    const gt = applyFilters(
      rows,
      { field_filters: [{ field_key: 'auto', op: '>', value: 1 }] },
      fields,
    );
    expect(matches(gt)).toEqual([2]);
    const eq = applyFilters(
      rows,
      { field_filters: [{ field_key: 'auto', op: '=', value: 9 }] },
      fields,
    );
    expect(matches(eq)).toEqual([2]);
  });

  it('fails a field filter on a missing or null value, whatever the operator', () => {
    const rows = [m(1, 5), entry({ match_number: 2, data: {} }), m(3, null)];
    const ne = applyFilters(
      rows,
      { field_filters: [{ field_key: 'auto', op: '!=', value: 1 }] },
      fields,
    );
    expect(matches(ne)).toEqual([1]);
  });

  it('ANDs several field filters', () => {
    const out = applyFilters(
      five,
      {
        field_filters: [
          { field_key: 'auto', op: '>', value: 1 },
          { field_key: 'auto', op: '<', value: 9 },
        ],
      },
      fields,
    );
    expect(matches(out)).toEqual([1, 4, 5]);
  });

  it('filters on the RECOMPUTED value of a computed field, never the stored one (5.7)', () => {
    const doubled = fieldDef('doubled', 'computed', {
      result_type: 'float',
      expression: {
        kind: 'op',
        op: '*',
        left: { kind: 'field', key: 'auto' },
        right: { kind: 'literal', value: 2 },
      },
    });
    const rows = [
      entry({ match_number: 1, data: { auto: 1, doubled: 999 } }), // stale stored value
      entry({ match_number: 2, data: { auto: 6, doubled: 0 } }),
    ];
    const out = applyFilters(
      rows,
      { field_filters: [{ field_key: 'doubled', op: '>', value: 10 }] },
      [...fields, doubled],
    );
    expect(matches(out)).toEqual([2]);
    expect(out[0]!.data.doubled).toBe(12);
    expect(rows[1]!.data.doubled).toBe(0); // the input is not changed
  });

  it('narrows by robot_status, but can never bring back a no-show or a disabled robot', () => {
    const rows = [
      m(1, 4),
      m(2, 6, { robot_status: 'broke_down' }),
      m(3, 0, { robot_status: 'no_show' }),
      m(4, 0, { robot_status: 'disabled' }),
    ];
    expect(matches(applyFilters(rows, { robot_status: ['played'] }, fields))).toEqual([1]);
    expect(matches(applyFilters(rows, { robot_status: ['broke_down'] }, fields))).toEqual([2]);
    expect(applyFilters(rows, { robot_status: ['no_show', 'disabled'] }, fields)).toEqual([]);
    expect(matches(applyFilters(rows, {}, fields))).toEqual([1, 2]);
  });

  it('lets a super entry (no status, no match) through the robot_status and match filters', () => {
    const sup = entry({
      id: 's',
      form_kind: 'super',
      match_id: null,
      match_number: null,
      match_type: null,
      alliance: null,
      robot_status: null,
      data: { auto: 3 },
    });
    const out = applyFilters(
      [sup],
      { robot_status: ['played'], exclude_match_numbers: [1], last_n_matches: 1 },
      fields,
    );
    expect(out.map((e) => e.id)).toEqual(['s']);
  });
});

// ---------------------------------------------------------------------------------------------

describe('the required negatives, end to end (SPEC-FINAL 11.2, 11.3, 11.6)', () => {
  // t-1 played two qualification matches scoring 10 and 20. Everything else must not count.
  const played = [m(1, 10), m(2, 20)];
  const noise = [
    m(3, 0, { robot_status: 'no_show' }),
    m(4, 0, { robot_status: 'disabled' }),
    m(5, 0, { match_type: 'practice', match_id: 'pr-5' }),
    m(6, 100, { match_type: 'playoff', match_id: 'po-6' }),
    // an older duplicate of match 2, from a second device
    m(2, 99, { id: 'dup-old', client_updated_at: '2026-11-14T08:00:00.000Z' }),
    // a soft-deleted copy of match 1
    m(1, 50, { id: 'deleted', deleted_at: '2026-11-14T10:00:00.000Z' }),
  ];
  const population = [...noise.slice(0, 2), played[0]!, ...noise.slice(2), played[1]!];

  it.each(AGGREGATIONS)(
    '%s over the filtered population equals it over the two played matches alone',
    (aggregation) => {
      const filtered = values(applyFilters(population, {}, fields));
      expect(filtered).toEqual([10, 20]);
      expect(aggregate(filtered, aggregation, opts)).toEqual(
        aggregate([10, 20], aggregation, opts),
      );
    },
  );

  it('a no-show or disabled robot shrinks the denominator rather than adding a zero', () => {
    const filtered = values(applyFilters(population, {}, fields));
    expect(aggregate(filtered, 'avg')).toBe(15);
    expect(aggregate(filtered, 'count')).toBe(2);
    expect(aggregate(filtered, 'min')).toBe(10);
    expect(aggregate(filtered, 'rate')).toBe(1);
  });

  it('the same holds for the scouted score: a dead robot has no score, not 0', () => {
    const rules: ScoringRule[] = [{ field_key: 'auto', points: 1, option_points: null }];
    const scores = applyFilters(population, {}, fields).map((e) => scoreEntry(e, fields, rules));
    expect(aggregate(scores, 'avg')).toBe(15);
    expect(aggregate(scores, 'count')).toBe(2);
  });

  it('only qualification matches feed an aggregate', () => {
    const rows = [
      m(1, 10),
      m(5, 0, { match_type: 'practice' }),
      m(6, 100, { match_type: 'playoff' }),
    ];
    expect(aggregate(values(applyFilters(rows, {}, fields)), 'avg')).toBe(10);
  });

  it('a duplicated (team, match, kind) counts once, the latest client_updated_at', () => {
    const rows = [
      m(1, 10),
      m(1, 30, { id: 'newer', client_updated_at: '2026-11-14T09:30:00.000Z' }),
    ];
    const filtered = applyFilters(rows, {}, fields);
    expect(filtered.map((e) => e.id)).toEqual(['newer']);
    expect(aggregate(values(filtered), 'count')).toBe(1);
    expect(aggregate(values(filtered), 'sum')).toBe(30);
  });

  it.each(AGGREGATIONS)('%s is null for a team whose every entry is excluded', (aggregation) => {
    const excludedOnly = [
      m(1, 0, { robot_status: 'no_show' }),
      m(2, 0, { robot_status: 'disabled' }),
      m(3, 7, { match_type: 'practice' }),
    ];
    const filtered = values(applyFilters(excludedOnly, {}, fields));
    expect(filtered).toEqual([]);
    expect(aggregate(filtered, aggregation, opts)).toBeNull();
  });

  it.each(AGGREGATIONS)('%s is null when the filters leave nothing', (aggregation) => {
    const filtered = values(
      applyFilters(
        played,
        { field_filters: [{ field_key: 'auto', op: '>', value: 1000 }] },
        fields,
      ),
    );
    expect(aggregate(filtered, aggregation, opts)).toBeNull();
  });
});
