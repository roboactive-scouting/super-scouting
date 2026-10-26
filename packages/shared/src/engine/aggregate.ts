import type {
  FieldDirection,
  FormFieldDefinition,
  RobotStatus,
  VisibilityCondition,
} from '../forms/types';
import { conditionHolds } from '../forms/visibility';
import { hydrateComputed } from './score';
import { entriesForAggregates } from './select';
import type { EngineEntry } from './types';

/** The aggregation menu of SPEC-FINAL 11.2, in the spec's order. */
export const AGGREGATIONS = [
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
] as const;

export type Aggregation = (typeof AGGREGATIONS)[number];

/** SPEC-FINAL 11.2's `Op`, the same operators a visibility condition uses (5.8). */
export type ComparisonOp = VisibilityCondition['op'];

export type AggregationOptions = {
  /** 0–100, required for `percentile`. */
  percentile?: number;
  /** For `rate`. Absent: `true`, or a number greater than zero (points > 0, 4.1). */
  rate_condition?: { op: ComparisonOp; value: unknown };
  /** The field's option list, for `mode` ties and `distribution` order. */
  option_order?: readonly string[];
};

/** One value `mode` can return and a `distribution` bucket can hold. */
export type ScalarValue = number | string | boolean;
export type DistributionBucket = { value: ScalarValue; count: number };
export type AggregateResult = ScalarValue | DistributionBucket[] | null;

/** What each aggregation returns: null always means "no data" (the "—" of 12.6), never zero. */
export type AggregateResultFor<A extends Aggregation> = A extends 'distribution'
  ? DistributionBucket[] | null
  : A extends 'mode'
    ? ScalarValue | null
    : number | null;

/** Present values: null, undefined, NaN and ±Infinity are not values and never count as 0. */
function presentValues(raw: readonly unknown[]): unknown[] {
  return raw.filter(
    (v) => v !== null && v !== undefined && !(typeof v === 'number' && !Number.isFinite(v)),
  );
}

/** The numbers among present values. Booleans and numeric-looking strings are not coerced. */
function numbers(values: readonly unknown[]): number[] {
  return values.filter((v): v is number => typeof v === 'number');
}

/** A result the engine may show: finite, and never -0. Overflow is no data, not Infinity. */
function finiteOrNull(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  return n === 0 ? 0 : n;
}

function sumOf(xs: readonly number[]): number {
  let total = 0;
  for (const x of xs) total += x;
  return total;
}

function ascending(xs: readonly number[]): number[] {
  return [...xs].sort((a, b) => a - b);
}

/** Linear interpolation between the two neighbouring ranks of an ascending, non-empty list. */
function percentileOf(sorted: readonly number[], p: number): number {
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return lo === hi ? a : a + (b - a) * (rank - lo);
}

/** Population standard deviation (divisor n). Two values at least, else null. */
function stddevOf(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const mean = sumOf(xs) / xs.length;
  let squares = 0;
  for (const x of xs) squares += (x - mean) * (x - mean);
  return Math.sqrt(squares / xs.length);
}

/** Ordinary least-squares slope of the values against the sequence index 1…n. */
function slopeOf(ys: readonly number[]): number | null {
  const n = ys.length;
  if (n < 2) return null;
  const meanX = (n + 1) / 2;
  const meanY = sumOf(ys) / n;
  let covariance = 0;
  let varianceX = 0;
  ys.forEach((y, i) => {
    const dx = i + 1 - meanX;
    covariance += dx * (y - meanY);
    varianceX += dx * dx;
  });
  return covariance / varianceX;
}

function minOf(xs: readonly number[]): number {
  let m = xs[0]!;
  for (const x of xs) if (x < m) m = x;
  return m;
}

function maxOf(xs: readonly number[]): number {
  let m = xs[0]!;
  for (const x of xs) if (x > m) m = x;
  return m;
}

function isScalar(v: unknown): v is ScalarValue {
  return (
    typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))
  );
}

/**
 * The order of `mode` ties and `distribution` buckets: options in the field's list order
 * first, then anything else — numbers ascending, then false before true, then strings by
 * code unit. Total, so the same values always give the same answer.
 */
function valueOrder(optionOrder: readonly string[] | undefined) {
  const index = new Map<string, number>();
  (optionOrder ?? []).forEach((option, i) => {
    if (!index.has(option)) index.set(option, i);
  });
  const typeRank = (v: ScalarValue) => (typeof v === 'number' ? 0 : typeof v === 'boolean' ? 1 : 2);
  return (a: ScalarValue, b: ScalarValue): number => {
    const ia = typeof a === 'string' ? index.get(a) : undefined;
    const ib = typeof b === 'string' ? index.get(b) : undefined;
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    if (typeRank(a) !== typeRank(b)) return typeRank(a) - typeRank(b);
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
    return a < b ? -1 : a > b ? 1 : 0;
  };
}

/**
 * Counts per distinct scalar value. A multi select's array counts each option it holds once;
 * a value that is not a scalar (a coordinate, an event log) is not a category and is skipped.
 */
function bucketsOf(values: readonly unknown[], optionOrder: readonly string[] | undefined) {
  const counts = new Map<ScalarValue, number>();
  for (const value of values) {
    const items = Array.isArray(value) ? [...new Set<unknown>(value)] : [value];
    for (const item of items) {
      if (isScalar(item)) counts.set(item, (counts.get(item) ?? 0) + 1);
    }
  }
  const order = valueOrder(optionOrder);
  return [...counts.entries()]
    .map(([value, count]): DistributionBucket => ({ value, count }))
    .sort((a, b) => order(a.value, b.value));
}

/** `rate`'s test for one value. With no condition: `true`, or a number above zero (4.1). */
function rateHit(value: unknown, condition: AggregationOptions['rate_condition']): boolean {
  if (condition) return conditionHolds(value, condition.op, condition.value);
  return value === true || (typeof value === 'number' && value > 0);
}

function compute(
  raw: readonly unknown[],
  aggregation: Aggregation,
  options: AggregationOptions | undefined,
  direction: FieldDirection,
): AggregateResult {
  const values = presentValues(raw);
  if (values.length === 0) return null; // never zero (11.2)

  switch (aggregation) {
    case 'count':
      return values.length;
    case 'rate':
      return values.filter((v) => rateHit(v, options?.rate_condition)).length / values.length;
    case 'mode': {
      const buckets = bucketsOf(values, options?.option_order);
      if (buckets.length === 0) return null;
      // Buckets are already in tie-break order, so the first of the highest count wins.
      let winner = buckets[0]!;
      for (const bucket of buckets) if (bucket.count > winner.count) winner = bucket;
      return winner.value;
    }
    case 'distribution': {
      const buckets = bucketsOf(values, options?.option_order);
      return buckets.length === 0 ? null : buckets;
    }
    default:
      break;
  }

  const xs = numbers(values);
  if (xs.length === 0) return null; // values, but none of them numbers: still no data

  switch (aggregation) {
    case 'avg':
      return finiteOrNull(sumOf(xs) / xs.length);
    case 'median':
      return finiteOrNull(percentileOf(ascending(xs), 50));
    case 'sum':
      return finiteOrNull(sumOf(xs));
    case 'min':
      return minOf(xs);
    case 'max':
      return maxOf(xs);
    case 'stddev': {
      const sd = stddevOf(xs);
      return sd === null ? null : finiteOrNull(sd);
    }
    case 'percentile': {
      const p = options?.percentile;
      if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 100) return null;
      return finiteOrNull(percentileOf(ascending(xs), p));
    }
    case 'slope': {
      const slope = slopeOf(xs);
      return slope === null ? null : finiteOrNull(slope);
    }
    case 'best':
    case 'worst': {
      if (direction !== 'higher_is_better' && direction !== 'lower_is_better') return null;
      const wantMax = (aggregation === 'best') === (direction === 'higher_is_better');
      return wantMax ? maxOf(xs) : minOf(xs);
    }
    default:
      // An aggregation outside the catalogue has no definition, so it has no number.
      return null;
  }
}

/**
 * One aggregation of SPEC-FINAL 11.2 over one value series. `values` must already be the
 * output of `applyFilters` mapped to the metric's values, in that order: `slope` reads the
 * order as the match sequence 1…n.
 *
 * - null, undefined, NaN and ±Infinity are not values: they are dropped, never counted as 0.
 * - Every aggregation returns null on an empty value set, never zero. Numeric aggregations
 *   also return null when no value is a number, and when a result overflows.
 * - `stddev` (population) and `slope` need two values; `percentile` needs 0 ≤ p ≤ 100.
 * - `best` / `worst` are null for `neutral` (11.2: unavailable).
 * - `mode` / `distribution` count each option of a multi select's array once.
 */
export function aggregate<A extends Aggregation>(
  values: readonly unknown[],
  aggregation: A,
  options?: AggregationOptions,
  direction: FieldDirection = 'higher_is_better',
): AggregateResultFor<A> {
  return compute(values, aggregation, options, direction) as AggregateResultFor<A>;
}

export type FieldFilter = { field_key: string; op: ComparisonOp; value: unknown };

/** `MetricDefinition.filters` (SPEC-FINAL 11.2). An empty list is the same as no filter. */
export type MetricFilters = {
  exclude_match_numbers?: readonly number[];
  last_n_matches?: number;
  robot_status?: readonly RobotStatus[];
  field_filters?: readonly FieldFilter[];
};

/**
 * The "last N" order (11.2): by event `sort_order`, then match number within the event. A
 * super entry (no match) sorts after its event's matches. Event id, team and entry id break
 * the remaining ties, so the order is total and the same on the browser and the server.
 */
function sequenceOrder(a: EngineEntry, b: EngineEntry): number {
  if (a.event_sort_order !== b.event_sort_order) return a.event_sort_order - b.event_sort_order;
  if (a.event_id !== b.event_id) return a.event_id < b.event_id ? -1 : 1;
  const ma = a.match_number ?? Number.POSITIVE_INFINITY;
  const mb = b.match_number ?? Number.POSITIVE_INFINITY;
  if (ma !== mb) return ma < mb ? -1 : 1;
  if (a.team_id !== b.team_id) return a.team_id < b.team_id ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Each team's last `n` entries in sequence order; `sorted` is already in that order. */
function lastNPerTeam(sorted: readonly EngineEntry[], n: number): EngineEntry[] {
  if (Number.isNaN(n)) return [];
  const keep = Math.floor(n);
  if (keep <= 0) return [];
  const seen = new Map<string, number>();
  const kept: EngineEntry[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const entry = sorted[i]!;
    const count = seen.get(entry.team_id) ?? 0;
    if (count >= keep) continue;
    seen.set(entry.team_id, count + 1);
    kept.push(entry);
  }
  return kept.reverse();
}

/**
 * The population a metric aggregates over, in the fixed evaluation order of SPEC-FINAL 11.2:
 * scope (the caller's `entries`) → canonical entry per (team, match, kind) → qualification
 * only → robot-status rule (`entriesForAggregates`) → the metric's `robot_status` narrowing →
 * `field_filters` → `exclude_match_numbers` → `last_n_matches`.
 *
 * - Computed fields are re-derived with `fields` (5.7) before any filter reads them, and the
 *   returned entries carry that hydrated `data`.
 * - `robot_status` only narrows: no_show and disabled are gone before it runs, whatever it
 *   lists (11.3). A super entry has no status and passes it.
 * - A field filter on a key the entry does not hold (or holds as null) fails, whatever the
 *   operator.
 * - `last_n_matches` keeps each team's last N, so a multi-team population is safe.
 * - The result is in sequence order (event `sort_order`, then match number): map it to values
 *   in this order and `slope` reads the right sequence.
 *
 * The population is one form kind's: a match-field metric passes match entries only, since a
 * super entry passes the qualification and status rules (it has neither).
 */
export function applyFilters(
  entries: readonly EngineEntry[],
  filters: MetricFilters,
  fields: readonly FormFieldDefinition[],
): EngineEntry[] {
  let population = entriesForAggregates(entries).map((entry) => ({
    ...entry,
    data: hydrateComputed(entry.data, fields),
  }));

  const statuses = filters.robot_status ?? [];
  if (statuses.length > 0) {
    population = population.filter(
      (e) => e.robot_status === null || statuses.includes(e.robot_status),
    );
  }

  for (const filter of filters.field_filters ?? []) {
    population = population.filter((e) => {
      const value = e.data[filter.field_key];
      return (
        value !== undefined && value !== null && conditionHolds(value, filter.op, filter.value)
      );
    });
  }

  const excluded = filters.exclude_match_numbers ?? [];
  if (excluded.length > 0) {
    population = population.filter(
      (e) => e.match_number === null || !excluded.includes(e.match_number),
    );
  }

  population.sort(sequenceOrder);

  const lastN = filters.last_n_matches;
  return typeof lastN === 'number' ? lastNPerTeam(population, lastN) : population;
}
