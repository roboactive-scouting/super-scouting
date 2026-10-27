import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from '../forms/types';
import { aggregate, applyFilters, type Aggregation } from './aggregate';
import { deriveCycles, type CycleTap } from './cycles';
import type { EngineEntry } from './types';

const taps = [
  { type: 'score', t: 10 },
  { type: 'pickup', t: 12 },
  { type: 'score', t: 25 },
  { type: 'score', t: 40 },
];

describe('cycle derivation (SPEC-FINAL 5.5)', () => {
  it('derives per event type, ignoring other types entirely', () => {
    const result = deriveCycles(taps, 'score', true, 150);
    expect(result.count).toBe(3);
  });

  it('timed: the first cycle runs from match start and the last closes at match end', () => {
    const result = deriveCycles(taps, 'score', true, 150);
    expect(result.durations).toEqual([10, 15, 15, 110]);
    expect(result.timeToFirst).toBe(10);
  });

  it('un-timed: no first cycle from match start and no final open cycle', () => {
    const unTimed = [
      { type: 'score', t: 0 },
      { type: 'score', t: 15 },
      { type: 'score', t: 30 },
    ];
    const result = deriveCycles(unTimed, 'score', false, null);
    expect(result.durations).toEqual([15, 15]);
    expect(result.timeToFirst).toBeNull();
    expect(result.count).toBe(3);
  });

  it('un-timed produces exactly one fewer cycle than timed, with no zero-length artefact', () => {
    const same = [
      { type: 'score', t: 0 },
      { type: 'score', t: 20 },
    ];
    expect(deriveCycles(same, 'score', false, null).durations).toEqual([20]);
    expect(deriveCycles(same, 'score', true, 100).durations).toEqual([0, 20, 80]);
  });

  it('handles a single tap in each case', () => {
    const one = [{ type: 'score', t: 30 }];
    expect(deriveCycles(one, 'score', true, 150).durations).toEqual([30, 120]);
    expect(deriveCycles([{ type: 'score', t: 0 }], 'score', false, null).durations).toEqual([]);
  });

  it('returns an empty series for an event type with no taps', () => {
    const result = deriveCycles(taps, 'defence', true, 150);
    expect(result).toEqual({ count: 0, durations: [], timeToFirst: null });
  });

  it('has no final open cycle when the timed match end is unknown', () => {
    expect(deriveCycles(taps, 'score', true, null).durations).toEqual([10, 15, 15]);
  });
});

describe('cycle derivation — edges', () => {
  it('returns the empty series on empty input, timed or not', () => {
    const empty = { count: 0, durations: [], timeToFirst: null };
    expect(deriveCycles([], 'score', true, 150)).toEqual(empty);
    expect(deriveCycles([], 'score', false, null)).toEqual(empty);
  });

  it.each<Aggregation>(['avg', 'median', 'sum', 'min', 'max', 'count', 'stddev', 'slope'])(
    'the empty series aggregates to null, never zero (%s)',
    (aggregation) => {
      const series = deriveCycles([], 'score', true, 150);
      expect(aggregate(series.durations, aggregation)).toBeNull();
      expect(aggregate([series.timeToFirst], aggregation)).toBeNull();
    },
  );

  it('sorts taps by time first, whatever order they are stored in', () => {
    const shuffled = [
      { type: 'score', t: 40 },
      { type: 'score', t: 10 },
      { type: 'score', t: 25 },
    ];
    expect(deriveCycles(shuffled, 'score', true, 150)).toEqual({
      count: 3,
      durations: [10, 15, 15, 110],
      timeToFirst: 10,
    });
  });

  it('does not mutate its input', () => {
    const stored = [
      { type: 'score', t: 40 },
      { type: 'score', t: 10 },
    ];
    const copy = structuredClone(stored);
    deriveCycles(stored, 'score', true, 150);
    expect(stored).toEqual(copy);
  });

  it('keeps two taps at the same instant as a real zero-length cycle', () => {
    const twin = [
      { type: 'score', t: 10 },
      { type: 'score', t: 10 },
    ];
    expect(deriveCycles(twin, 'score', false, null).durations).toEqual([0]);
  });

  it('ignores a tap whose time is not a finite number of seconds, 0 or more', () => {
    const bad: CycleTap[] = [
      { type: 'score', t: Number.NaN },
      { type: 'score', t: 10 },
      { type: 'score', t: Number.POSITIVE_INFINITY },
      { type: 'score', t: -5 },
      { type: 'score', t: 30 },
    ];
    expect(deriveCycles(bad, 'score', true, 150)).toEqual({
      count: 2,
      durations: [10, 20, 120],
      timeToFirst: 10,
    });
  });

  it('closes no final cycle when the last tap is after match end (never a negative cycle)', () => {
    const late = [
      { type: 'score', t: 100 },
      { type: 'score', t: 160 },
    ];
    expect(deriveCycles(late, 'score', true, 150).durations).toEqual([100, 60]);
    expect(deriveCycles(late, 'score', true, 160).durations).toEqual([100, 60, 0]);
  });

  it('treats a non-finite match end as unknown', () => {
    expect(deriveCycles(taps, 'score', true, Number.NaN).durations).toEqual([10, 15, 15]);
  });

  it('ignores the match end entirely when un-timed', () => {
    expect(deriveCycles(taps, 'score', false, 150).durations).toEqual([15, 15]);
  });

  it('every cycle duration is 0 or more', () => {
    const many = [5, 3, 9, 9, 1, 200, 7].map((t) => ({ type: 'score', t }));
    for (const timed of [true, false]) {
      const { durations } = deriveCycles(many, 'score', timed, 150);
      expect(durations.every((d) => d >= 0)).toBe(true);
    }
  });
});

describe('cycles over a population: a dead robot never becomes a zero', () => {
  const entry = (over: Partial<EngineEntry>): EngineEntry => ({
    id: 'e',
    form_version_id: 'fv-1',
    form_kind: 'match',
    event_id: 'ev-1',
    match_id: 'm-1',
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
  const scoreTaps = (...ts: number[]) => ({ log: ts.map((t) => ({ type: 'score', t })) });
  const logField: FormFieldDefinition = {
    id: 'log',
    key: 'log',
    label: 'Log',
    help_text: null,
    type: 'event_log',
    section: null,
    display_order: 1,
    required: false,
    default_value: null,
    config: { event_types: [{ value: 'score', label: 'Score' }] },
    visibility_condition: null,
    deprecated: false,
    description: 'x',
    unit: 'seconds',
    phase: 'teleop',
    direction: 'lower_is_better',
    category: null,
    expected_range: null,
    include_in_ai_context: null,
    is_ordinal: null,
  };

  const population = [
    entry({ id: 'p1', match_id: 'm-1', match_number: 1, data: scoreTaps(10, 30) }),
    entry({ id: 'p2', match_id: 'm-2', match_number: 2, data: scoreTaps(20, 40, 60) }),
    entry({ id: 'ns', match_id: 'm-3', match_number: 3, robot_status: 'no_show' }),
    entry({ id: 'dis', match_id: 'm-4', match_number: 4, robot_status: 'disabled' }),
    // An older duplicate of match 1 and a practice match, neither of which may count.
    entry({
      id: 'old',
      match_id: 'm-1',
      match_number: 1,
      data: scoreTaps(1, 2, 3, 4, 5),
      client_updated_at: '2026-11-14T08:00:00.000Z',
    }),
    entry({ id: 'pr', match_id: 'm-9', match_number: 9, match_type: 'practice' }),
  ];

  const series = (timed: boolean) =>
    applyFilters(population, {}, [logField]).map((e) =>
      deriveCycles(e.data.log as CycleTap[], 'score', timed, timed ? 150 : null),
    );

  it('reads only the played matches: counts, durations and time to first', () => {
    const timed = series(true);
    expect(timed.map((s) => s.count)).toEqual([2, 3]);
    expect(
      aggregate(
        timed.map((s) => s.count),
        'avg',
      ),
    ).toBe(2.5);
    expect(
      aggregate(
        timed.map((s) => s.count),
        'min',
      ),
    ).toBe(2);
    expect(
      aggregate(
        timed.map((s) => s.timeToFirst),
        'avg',
      ),
    ).toBe(15);
    expect(
      aggregate(
        timed.flatMap((s) => s.durations),
        'min',
      ),
    ).toBe(10);
  });

  it('un-timed too: no zero series stands in for the no-show or the disabled robot', () => {
    const unTimed = series(false);
    expect(unTimed.map((s) => s.durations)).toEqual([[20], [20, 20]]);
    expect(
      aggregate(
        unTimed.map((s) => s.timeToFirst),
        'avg',
      ),
    ).toBeNull();
  });
});
