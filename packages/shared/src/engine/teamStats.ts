import type { MatchType } from '../api/matches';
import {
  PHASE_SORT_KEYS,
  RANK_RECENT_MATCHES,
  type GetTeamStatsOutput,
  type MetricKind,
  type RankPhaseAverage,
  type RankRow,
  type RankSortKey,
  type SortDirection,
  type StatGroup,
  type StatsCell,
  type StatsMatchRow,
  type StatsMetric,
  type StatsNote,
  type StatsReliability,
} from '../api/stats';
import { FIELD_PHASES } from '../api/forms';
import { matchLabel } from '../format';
import { isScorable } from '../forms/scoring';
import {
  selectOptions,
  type FieldDirection,
  type FieldPhase,
  type FormFieldDefinition,
} from '../forms/types';
import { isDeadRobot } from '../forms/validate';
import { aggregate, applyFilters, sequenceOrder } from './aggregate';
import { averagePoints, rankByAveragePoints, scoreBreakdown, scoutedPoints } from './breakdown';
import { reliabilityFor } from './reliability';
import { hydrateComputed, scoreEntry } from './score';
import { canonicalEntries } from './select';
import type { EngineEntry, ScoringRule } from './types';
import { aggregationValue, resolveFieldAcrossVersions } from './versions';

/**
 * Task 1.57: the team page's statistics and the fixed phase 1 ranking table (SPEC-FINAL 13.1,
 * 13.5, 11.3, 11.5), as PURE functions over plain rows. The server (`getTeamStats`,
 * `rankTeams`) fetches rows and calls these; the device calls the very same functions on its
 * own cache offline (9.6). Neither side holds a formula: everything below is built from the
 * engine's own pieces — `applyFilters`, `aggregate`, `aggregationValue`,
 * `resolveFieldAcrossVersions`, `averagePoints`, `rankByAveragePoints`, `reliabilityFor`.
 */

/** A roster team. */
export type StatsTeam = { id: string; number: number; name: string };

/** One form version's fields, by id: what the cross-version guard and note labels read. */
export type StatsVersion = { id: string; fields: readonly FormFieldDefinition[] };

/** The match form's ACTIVE version's fields and the form's rules (SPEC-FINAL 5.1). */
export type StatsScoring = {
  fields: readonly FormFieldDefinition[];
  rules: readonly ScoringRule[];
};

/** What both builders read: the event's roster, its live entries (any team, both kinds). */
export type StatsInput = {
  /** The event's live roster: the ranked population and the 12.6 domain population. */
  teams: readonly StatsTeam[];
  /** The event's live entries, joined with match type, number and event sort order. */
  entries: readonly EngineEntry[];
  scoring: StatsScoring;
};

export type RankTableInput = StatsInput & {
  sort_by?: RankSortKey;
  direction?: SortDirection;
  /**
   * The table as it stood before this qualification match (task 1.58b): only qualification
   * matches numbered below it count. Unset, every match counts.
   */
  before_match_number?: number;
};

/**
 * The entries a table counts before qualification match `before` (task 1.58b): every entry of a
 * qualification match numbered below it, and every non-qualification entry (which no figure
 * counts anyway). A qualification entry with no number cannot be placed, so it is left out.
 */
export function entriesBeforeMatch(
  entries: readonly EngineEntry[],
  before: number | undefined,
): readonly EngineEntry[] {
  if (before === undefined) return entries;
  return entries.filter(
    (e) => e.match_type !== 'qualification' || (e.match_number !== null && e.match_number < before),
  );
}

export type TeamStatsInput = StatsInput & {
  team: StatsTeam;
  event: { id: string; name: string } | null;
  /** Every form version an entry at the event names (its fields), both kinds. */
  versions: readonly StatsVersion[];
  /** The super form's ACTIVE version's fields, for the labels of super notes; [] when none. */
  superFields?: readonly FormFieldDefinition[];
  /** Full names of the entries' scouters (18.5); an unknown id shows no name. */
  scouters: readonly { id: string; full_name: string }[];
};

/** `getTeamStats` before paging: every match row, and no cursor. */
export type TeamStats = Omit<GetTeamStatsOutput, 'next_cursor'>;

/** The sort each column takes when none is given: best first (fewest breakdowns, …). */
export const RANK_SORT_DEFAULT_DIRECTION: Record<RankSortKey, SortDirection> = {
  average_points: 'desc',
  auto_points: 'desc',
  teleop_points: 'desc',
  endgame_points: 'desc',
  post_match_points: 'desc',
  availability_rate: 'desc',
  matches_counted: 'desc',
  breakdowns: 'asc',
  no_shows: 'asc',
  disabled: 'asc',
  number: 'asc',
};

/** The headline's label: the canonical basic rank's value (11.5). */
export const HEADLINE_LABEL = 'Average points';

const POINTS_KEYS = {
  average: 'average_points',
  median: 'median_points',
  stddev: 'stddev_points',
} as const;

/** The key of a field's metric, and of its match-table column. */
export const fieldMetricKey = (fieldKey: string): string => `field:${fieldKey}`;

/** One team's populations, built once and read by every metric. */
type TeamPopulation = {
  /** `applyFilters(match entries, {}, fields)`: canonical, live, qualification, not dead. */
  counted: EngineEntry[];
  /** `scoreEntry` of each counted entry, in the same (sequence) order; none is dead. */
  points: (number | null)[];
  /** Canonical qualification match entries, dead ones too, hydrated, in sequence order. */
  series: EngineEntry[];
};

function byTeam(entries: readonly EngineEntry[]): Map<string, EngineEntry[]> {
  const out = new Map<string, EngineEntry[]>();
  for (const entry of entries) {
    const list = out.get(entry.team_id);
    if (list) list.push(entry);
    else out.set(entry.team_id, [entry]);
  }
  return out;
}

function populationOf(entries: readonly EngineEntry[], scoring: StatsScoring): TeamPopulation {
  const matchEntries = entries.filter((e) => e.form_kind === 'match');
  const counted = applyFilters(matchEntries, {}, scoring.fields);
  const series = canonicalEntries(matchEntries)
    .filter((e) => e.match_type === 'qualification')
    .map((e) => ({ ...e, data: hydrateComputed(e.data, scoring.fields) }))
    .sort(sequenceOrder);
  return {
    counted,
    points: counted.map((e) => scoreEntry(e, scoring.fields, scoring.rules)),
    series,
  };
}

const isDead = (e: Pick<EngineEntry, 'robot_status'>): boolean =>
  e.robot_status !== null && isDeadRobot(e.robot_status);

const labelOf = (e: Pick<EngineEntry, 'match_type' | 'match_number'>): string | null =>
  e.match_type !== null && e.match_number !== null
    ? matchLabel({ match_type: e.match_type, number: e.match_number })
    : null;

/** The 12.6 observed domain: min–max of the values, nulls excluded; null when none. */
function observedDomain(values: readonly (number | null)[]): { min: number; max: number } | null {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (xs.length === 0) return null;
  return { min: Math.min(...xs), max: Math.max(...xs) };
}

/**
 * How a metric field renders and aggregates (O2 of the task brief). A rating (1..max) and a
 * timer (seconds) average like a number (task 1.53 follow-up, user 2026-10-27).
 */
function fieldMetricShape(
  field: FormFieldDefinition,
): { kind: MetricKind; aggregation: StatsMetric['aggregation'] } | null {
  switch (field.type) {
    case 'counter':
    case 'number':
    case 'rating':
    case 'timer':
      return { kind: 'number', aggregation: 'avg' };
    case 'toggle':
      return { kind: 'rate', aggregation: 'rate' };
    case 'single_select':
    case 'multi_select':
      return field.is_ordinal === true
        ? { kind: 'ordinal', aggregation: 'avg' }
        : { kind: 'nominal', aggregation: 'mode' };
    default:
      return null;
  }
}

/** The types that get a metric row: the scorable ones, then a rating and a timer. */
const isMetricType = (type: FormFieldDefinition['type']): boolean =>
  isScorable(type) || type === 'rating' || type === 'timer';

/** The fields one metric each: live, scorable, rating or timer, each key once, in form order. */
function metricFields(fields: readonly FormFieldDefinition[]): FormFieldDefinition[] {
  const seen = new Set<string>();
  const out: FormFieldDefinition[] = [];
  for (const field of fields) {
    if (field.deprecated || !isMetricType(field.type) || seen.has(field.key)) continue;
    seen.add(field.key);
    out.push(field);
  }
  return out;
}

/** A rating's top value: `config.max`, else 5 (as `validateEntryData`). */
const ratingMax = (field: FormFieldDefinition): number =>
  typeof field.config.max === 'number' ? field.config.max : 5;

/**
 * A metric field's direction when the form declares none: higher is better, except a timer,
 * where a faster time is (user, 2026-10-27). A declared `direction` always wins, so a timer
 * where longer is better (a defence hold) sets it in the builder.
 */
const defaultDirection = (field: FormFieldDefinition): FieldDirection =>
  field.direction ?? (field.type === 'timer' ? 'lower_is_better' : 'higher_is_better');

/** A timer metric's value in words: whole bare ("12 s"), else one place ("12.4 s"). */
function secondsText(value: number | null): string | null {
  if (value === null) return null;
  const one = Math.round(value * 10) / 10;
  return `${Number.isInteger(one) ? String(one) : one.toFixed(1)} s`;
}

const optionLabel = (field: FormFieldDefinition, value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  return selectOptions(field).find((o) => o.value === value)?.label ?? value;
};

/** One entry's value of a metric for a sparkline: a number, else null (a gap). */
function seriesValue(kind: MetricKind, field: FormFieldDefinition, raw: unknown): number | null {
  if (kind === 'rate') return typeof raw === 'boolean' ? (raw ? 1 : 0) : null;
  const v = aggregationValue(field, raw);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** One field metric's value for one team: the NEXT-CHAT pipeline, from `counted`. */
function fieldValue(
  field: FormFieldDefinition,
  shape: { kind: MetricKind; aggregation: StatsMetric['aggregation'] },
  direction: FieldDirection,
  counted: readonly EngineEntry[],
): { value: number | null; display: string | null } {
  if (shape.kind === 'nominal') {
    // Raw values, so the mode is an option, not a rank (NEXT-CHAT, "mode/distribution").
    const mode = aggregate(
      counted.map((e) => e.data[field.key]),
      'mode',
      { option_order: selectOptions(field).map((o) => o.value) },
      direction,
    );
    return { value: null, display: mode === null ? null : optionLabel(field, String(mode)) };
  }
  const values = counted.map((e) => aggregationValue(field, e.data[field.key]));
  const value = aggregate(values, shape.aggregation as 'avg' | 'rate', undefined, direction);
  if (field.type === 'timer') return { value, display: secondsText(value) };
  if (shape.kind !== 'ordinal' || value === null) return { value, display: null };
  const options = selectOptions(field);
  const nearest = options[Math.min(Math.max(Math.round(value), 0), options.length - 1)];
  return { value, display: nearest ? nearest.label : null };
}

/** A match-table cell: the value as the device shows it. Dead robots never reach here. */
function cellOf(field: FormFieldDefinition, raw: unknown): StatsCell {
  switch (field.type) {
    case 'counter':
    case 'number':
      return {
        value: typeof raw === 'number' && Number.isFinite(raw) ? raw : null,
        display: null,
      };
    case 'toggle':
      return typeof raw === 'boolean'
        ? { value: raw ? 1 : 0, display: raw ? 'Yes' : 'No' }
        : { value: null, display: null };
    case 'single_select': {
      const rank = aggregationValue(field, raw);
      return { value: typeof rank === 'number' ? rank : null, display: optionLabel(field, raw) };
    }
    case 'multi_select': {
      if (!Array.isArray(raw) || raw.length === 0) return { value: null, display: null };
      const rank = aggregationValue(field, raw);
      return {
        value: typeof rank === 'number' ? rank : null,
        display: raw.map((v) => optionLabel(field, v) ?? String(v)).join(', '),
      };
    }
    default:
      return { value: null, display: null };
  }
}

const EMPTY_CELL: StatsCell = { value: null, display: null };

/** Chronological at an event: practice, qualification, playoff; then by number. */
const MATCH_TYPE_ORDER: readonly MatchType[] = ['practice', 'qualification', 'playoff'];
function matchOrder(a: EngineEntry, b: EngineEntry): number {
  const ta = a.match_type === null ? 99 : MATCH_TYPE_ORDER.indexOf(a.match_type);
  const tb = b.match_type === null ? 99 : MATCH_TYPE_ORDER.indexOf(b.match_type);
  if (ta !== tb) return ta - tb;
  const na = a.match_number ?? Number.POSITIVE_INFINITY;
  const nb = b.match_number ?? Number.POSITIVE_INFINITY;
  if (na !== nb) return na < nb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const instant = (stamp: string): number => {
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
};

/** One figure of a multi-figure sort (task 1.58): each later one settles ties in the one before. */
export type RankSortStep = { key: RankSortKey; direction: SortDirection };

/**
 * The phases that carry points in the season's match form (task 1.58): every phase, in
 * `FIELD_PHASES` order, holding a scorable field that a scoring rule names (a field with no phase
 * is `post_match`, as `scoreBreakdown` files it; each key once, as `scoreEntry` scores it). A
 * retired field still counts, since `scoreEntry` still scores a value an entry holds for it, so
 * the phases of a row always add up to its Total.
 */
export function scoringPhases(scoring: StatsScoring): FieldPhase[] {
  const ruled = new Set(scoring.rules.map((r) => r.field_key));
  const seen = new Set<string>();
  const phases = new Set<FieldPhase>();
  for (const field of scoring.fields) {
    if (seen.has(field.key)) continue;
    seen.add(field.key);
    if (isScorable(field.type) && ruled.has(field.key)) phases.add(field.phase ?? 'post_match');
  }
  return FIELD_PHASES.filter((phase) => phases.has(phase));
}

/** The phase a sort key averages, or null for a key that is not a phase's. */
export function phaseOfSortKey(key: RankSortKey): FieldPhase | null {
  return FIELD_PHASES.find((phase) => PHASE_SORT_KEYS[phase] === key) ?? null;
}

type PlainSortKey = Exclude<RankSortKey, (typeof PHASE_SORT_KEYS)[FieldPhase]>;

/** A row's value of a sort key: a phase key reads `phase_averages` (null for a phase not there). */
export function rankSortValue(row: RankRow, key: RankSortKey): number | null {
  const phase = phaseOfSortKey(key);
  if (phase !== null) return row.phase_averages.find((p) => p.phase === phase)?.average ?? null;
  return row[key as PlainSortKey];
}

/**
 * Whether a row has any data (task 1.58): a counted match, or at least one scouted qualification
 * match with a status (a team that only ever no-showed HAS data: 0 % available). A row with none
 * shows "—" in every figure and sorts last under every sort.
 */
export function rankRowHasData(row: RankRow): boolean {
  return row.matches_counted > 0 || row.availability_rate !== null;
}

/**
 * The one ranking order (SPEC-FINAL 13.5, v1.46), shared by `buildRankTable` (the server's
 * `rankTeams`) and the ranking page's client sort: a row with no data last whatever the sort;
 * then each step in turn, a null in that step's key after every value whatever its direction;
 * still tied, the canonical rank (unranked last), then the lower team number.
 */
export function compareRankRows(a: RankRow, b: RankRow, sort: readonly RankSortStep[]): number {
  const da = rankRowHasData(a);
  const db = rankRowHasData(b);
  if (da !== db) return da ? -1 : 1;
  for (const { key, direction } of sort) {
    const va = rankSortValue(a, key);
    const vb = rankSortValue(b, key);
    if (va === null || vb === null) {
      if (va === vb) continue;
      return va === null ? 1 : -1;
    }
    if (va !== vb) return direction === 'asc' ? va - vb : vb - va;
  }
  if (a.rank !== b.rank) {
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return a.rank - b.rank;
  }
  return a.number - b.number;
}

/** `rows` in `sort`'s order (a copy; the rows themselves, `rank` included, are untouched). */
export function sortRankRows(rows: readonly RankRow[], sort: readonly RankSortStep[]): RankRow[] {
  return [...rows].sort((a, b) => compareRankRows(a, b, sort));
}

/**
 * The fixed phase 1 ranking table (SPEC-FINAL 13.5, D18; 11.5): one row per roster team with
 * the canonical basic rank (`rankByAveragePoints`, whatever the sort), the average scouted
 * points (`averagePoints`: match entries only, no-show and disabled excluded, never zero), how
 * many matches it counts, and the four reliability figures (`reliabilityFor` on the team's RAW
 * entries). Task 1.58 adds, over the SAME counted entries as the average: `stddev`
 * (Consistency, `aggregate(points, 'stddev')`, the team page's "Std dev of points") and
 * `phase_averages` (`scoringPhases`, each the mean of `scoreBreakdown`'s phase subtotal, 0 for a
 * phase an entry scored nothing in). Task 1.58b adds `recent_totals` (the last five of those
 * points, oldest first) and `last_counted_match` (the latest counted match's number), and
 * `before_match_number`: the table as it stood before that qualification match
 * (`entriesBeforeMatch`), every figure, the rank included, over the earlier matches only. Sorted by `sort_by` (default `average_points`) in
 * `direction` (default: the column's best-first, `RANK_SORT_DEFAULT_DIRECTION`) through
 * `compareRankRows`: no data last, a null last whatever the direction, ties to the canonical rank
 * then the lower team number. No weighting, no normalisation, no contributions: those are phase 2.
 */
export function buildRankTable(input: RankTableInput): RankRow[] {
  const { scoring } = input;
  const entries = entriesBeforeMatch(input.entries, input.before_match_number);
  const teams = [...new Map(input.teams.map((t) => [t.id, t])).values()];
  const grouped = byTeam(entries);
  const ranks = new Map(
    rankByAveragePoints(entries, teams, scoring.fields, scoring.rules).map((r) => [r.team_id, r]),
  );
  const phases = scoringPhases(scoring);
  const rows: RankRow[] = teams.map((team) => {
    const r = ranks.get(team.id);
    const own = grouped.get(team.id) ?? [];
    const reliability = reliabilityFor(own);
    // The population `averagePoints` reads: canonical, live, qualification, not-dead match entries.
    const counted = applyFilters(
      own.filter((e) => e.form_kind === 'match'),
      {},
      scoring.fields,
    );
    const points = counted.map((e) => scoreEntry(e, scoring.fields, scoring.rules));
    // `counted` is in sequence order (`applyFilters`), so the last ones are the latest matches.
    const totals = points.filter((p): p is number => p !== null);
    const subtotals = counted.map(
      (e) =>
        new Map(
          scoreBreakdown(e, scoring.fields, scoring.rules).phases.map((p) => [p.phase, p.subtotal]),
        ),
    );
    const phaseAverages: RankPhaseAverage[] = phases.map((phase) => ({
      phase,
      average: aggregate(
        subtotals.map((byPhase) => byPhase.get(phase) ?? 0),
        'avg',
      ),
    }));
    return {
      team_id: team.id,
      number: team.number,
      name: team.name,
      rank: r?.rank ?? null,
      average_points: r?.avg ?? null,
      stddev: aggregate(points, 'stddev'),
      phase_averages: phaseAverages,
      matches_counted: r?.matches_counted ?? 0,
      breakdowns: reliability.breakdowns,
      no_shows: reliability.no_shows,
      disabled: reliability.disabled,
      availability_rate: reliability.availability_rate,
      recent_totals: totals.slice(-RANK_RECENT_MATCHES),
      last_counted_match: counted.at(-1)?.match_number ?? null,
    };
  });

  const key = input.sort_by ?? 'average_points';
  const direction = input.direction ?? RANK_SORT_DEFAULT_DIRECTION[key];
  return sortRankRows(rows, [{ key, direction }]);
}

/**
 * Everything the team page shows for one team at one event (SPEC-FINAL 13.1; page 24), before
 * the server pages `matches`:
 *
 * - `rank` — `rankByAveragePoints` over the roster: the same ordering as `buildRankTable`, so
 *   the header badge and the ranking table never disagree. `of` is the roster's size.
 * - `headline` — `averagePoints` (11.5). `tiles` — median points, availability (`reliabilityFor`),
 *   the best counted match, and the `slope` of points per match.
 * - `metrics` — Overall (average, median, std dev of points; std dev is `neutral`), then one
 *   per scorable, rating or timer field of the ACTIVE match version, grouped by phase in form
 *   order, each through `resolveFieldAcrossVersions` → `applyFilters` → `aggregationValue` →
 *   `aggregate`. A rating's domain is its declared 1..max; a timer's is its `expected_range`,
 *   else the observed range, and with no declared direction it is `lower_is_better`; an "unsure" timer
 *   (null) is a gap in the series, never 0. A field whose type changed between the versions in
 *   scope is `type-changed`, value null.
 * - `columns` / `matches` — every canonical match entry of the team (practice and playoff too),
 *   in match order, with its points and the scored fields' values (never a rating or a timer:
 *   they score nothing); a dead robot shows nulls.
 * - `notes` — every Long-text answer of its canonical entries (both kinds), newest first.
 * - `reliability` — `reliabilityFor` on the RAW entries, with the matches named.
 */
export function buildTeamStats(input: TeamStatsInput): TeamStats {
  const { scoring, team } = input;
  const fields = scoring.fields;
  const roster = [...new Map(input.teams.map((t) => [t.id, t])).values()];
  const grouped = byTeam(input.entries);
  const ownEntries = grouped.get(team.id) ?? [];

  // The domain population: the roster, plus the team itself when it is not on it.
  const domainTeams = roster.some((t) => t.id === team.id) ? roster : [...roster, team];
  const populations = new Map(
    domainTeams.map((t) => [t.id, populationOf(grouped.get(t.id) ?? [], scoring)]),
  );
  const own = populations.get(team.id)!;
  const ownLabel = (e: EngineEntry): string => labelOf(e) ?? '';

  // Overall: the points of each counted match.
  const pointsSeries = own.series.map((e) => ({
    entry_id: e.id,
    match_label: ownLabel(e),
    value: isDead(e) ? null : scoreEntry(e, fields, scoring.rules),
  }));
  const pointsOf = (teamId: string) => populations.get(teamId)?.points ?? [];
  const average = averagePoints(ownEntries, fields, scoring.rules).avg;
  const pointsMetric = (
    key: string,
    label: string,
    aggregation: 'avg' | 'median' | 'stddev',
    direction: FieldDirection,
  ): StatsMetric => ({
    key,
    field_key: null,
    label,
    group: 'overall',
    kind: 'number',
    aggregation,
    direction,
    value: aggregation === 'avg' ? average : aggregate(own.points, aggregation),
    display: null,
    domain: observedDomain(domainTeams.map((t) => aggregate(pointsOf(t.id), aggregation))),
    series: pointsSeries,
    unavailable_reason: null,
  });
  const metrics: StatsMetric[] = [
    pointsMetric(POINTS_KEYS.average, HEADLINE_LABEL, 'avg', 'higher_is_better'),
    pointsMetric(POINTS_KEYS.median, 'Median points', 'median', 'higher_is_better'),
    pointsMetric(POINTS_KEYS.stddev, 'Std dev of points', 'stddev', 'neutral'),
  ];

  // One metric per metric field, checked against every version the counted entries name.
  const versionFields = new Map(input.versions.map((v) => [v.id, v.fields]));
  const inScopeIds = new Set<string>();
  for (const population of populations.values()) {
    for (const e of population.counted) inScopeIds.add(e.form_version_id);
  }
  const inScope = [...inScopeIds].flatMap((id) => {
    const f = versionFields.get(id);
    return f ? [{ fields: f }] : [];
  });
  const byGroup = new Map<StatGroup, StatsMetric[]>();
  for (const field of metricFields(fields)) {
    const shape = fieldMetricShape(field);
    if (!shape) continue;
    const group: StatGroup = field.phase ?? 'post_match';
    const direction = defaultDirection(field);
    const base = {
      key: fieldMetricKey(field.key),
      field_key: field.key,
      label: field.label,
      group,
      kind: shape.kind,
      aggregation: shape.aggregation,
      direction,
    };
    const resolved = resolveFieldAcrossVersions(field.key, { active: { fields }, inScope });
    let metric: StatsMetric;
    if (!resolved.ok) {
      metric = {
        ...base,
        value: null,
        display: null,
        domain: null,
        series: [],
        unavailable_reason: resolved.reason,
      };
    } else {
      const f = resolved.field;
      const { value, display } = fieldValue(f, shape, direction, own.counted);
      let domain: StatsMetric['domain'] = null;
      if (shape.kind === 'rate') domain = { min: 0, max: 1 };
      else if (shape.kind === 'ordinal') {
        domain = { min: 0, max: Math.max(selectOptions(f).length - 1, 0) };
      } else if (f.type === 'rating') {
        domain = { min: 1, max: ratingMax(f) };
      } else if (shape.kind === 'number') {
        domain = f.expected_range
          ? { min: f.expected_range.min, max: f.expected_range.max }
          : observedDomain(
              domainTeams.map(
                (t) => fieldValue(f, shape, direction, populations.get(t.id)?.counted ?? []).value,
              ),
            );
      }
      metric = {
        ...base,
        value,
        display,
        domain,
        series:
          shape.kind === 'nominal'
            ? []
            : own.series.map((e) => ({
                entry_id: e.id,
                match_label: ownLabel(e),
                value: isDead(e) ? null : seriesValue(shape.kind, f, e.data[f.key]),
              })),
        unavailable_reason: null,
      };
    }
    byGroup.set(group, [...(byGroup.get(group) ?? []), metric]);
  }
  for (const phase of FIELD_PHASES) metrics.push(...(byGroup.get(phase) ?? []));

  // The match table: every canonical match entry of the team, in match order.
  const names = new Map(input.scouters.map((s) => [s.id, s.full_name]));
  const ruled = new Set(scoring.rules.map((r) => r.field_key));
  const scored = metricFields(fields).filter((f) => isScorable(f.type) && ruled.has(f.key));
  const columns = scored.map((f) => ({ key: fieldMetricKey(f.key), label: f.label }));
  const canonical = canonicalEntries(ownEntries);
  const matches: StatsMatchRow[] = canonical
    .filter((e) => e.form_kind === 'match')
    .sort(matchOrder)
    .map((e) => {
      const dead = isDead(e);
      const data = hydrateComputed(e.data, fields);
      return {
        entry_id: e.id,
        match_id: e.match_id,
        match_label: labelOf(e),
        match_type: e.match_type,
        match_number: e.match_number,
        robot_status: e.robot_status,
        scouted_points: scoutedPoints(
          { form_kind: e.form_kind, robot_status: e.robot_status, data: e.data },
          fields,
          scoring.rules,
        ),
        scouter_id: e.scouter_id,
        scouter_name: names.get(e.scouter_id) ?? null,
        columns: Object.fromEntries(
          scored.map((f) => [fieldMetricKey(f.key), dead ? EMPTY_CELL : cellOf(f, data[f.key])]),
        ),
      };
    });

  // Notes: every Long-text answer, labelled by the active version of the entry's form (the
  // entry's own version for a key the active one no longer has), newest first.
  const activeOf = (kind: EngineEntry['form_kind']) =>
    kind === 'match' ? fields : (input.superFields ?? []);
  const notes: StatsNote[] = [];
  for (const e of canonical) {
    const seen = new Set<string>();
    const candidates = [...activeOf(e.form_kind), ...(versionFields.get(e.form_version_id) ?? [])];
    for (const field of candidates) {
      if (seen.has(field.key)) continue;
      seen.add(field.key);
      const value = e.data[field.key];
      if (field.type !== 'long_text' || typeof value !== 'string' || value.trim() === '') continue;
      notes.push({
        entry_id: e.id,
        form_kind: e.form_kind,
        match_label: e.form_kind === 'match' ? labelOf(e) : null,
        match_number: e.form_kind === 'match' ? e.match_number : null,
        field_key: field.key,
        field_label: field.label,
        value,
        scouter_name: names.get(e.scouter_id) ?? null,
        client_updated_at: e.client_updated_at,
      });
    }
  }
  notes.sort(
    (a, b) =>
      instant(b.client_updated_at) - instant(a.client_updated_at) ||
      (a.entry_id < b.entry_id ? 1 : a.entry_id > b.entry_id ? -1 : 0),
  );

  // Reliability, from the RAW entries (never applyFilters), with the matches named.
  const base = reliabilityFor(ownEntries);
  const named = (status: EngineEntry['robot_status']) =>
    own.series.filter((e) => e.robot_status === status).map(ownLabel);
  const reliability: StatsReliability = {
    ...base,
    breakdown_matches: named('broke_down'),
    no_show_matches: named('no_show'),
    disabled_matches: named('disabled'),
  };

  // The best counted match: the most points, the earliest on a tie.
  let best: TeamStats['tiles']['best_match'] = null;
  own.counted.forEach((e, i) => {
    const points = own.points[i];
    if (typeof points !== 'number') return;
    if (best === null || points > best.points) {
      best = { entry_id: e.id, match_label: ownLabel(e), points };
    }
  });

  const rank = rankByAveragePoints(input.entries, roster, fields, scoring.rules).find(
    (r) => r.team_id === team.id,
  );
  return {
    team: { id: team.id, number: team.number, name: team.name },
    event: input.event,
    entry_count: ownEntries.filter((e) => e.deleted_at === null || e.deleted_at === undefined)
      .length,
    rank: { rank: rank?.rank ?? null, of: roster.length },
    headline: { label: HEADLINE_LABEL, value: average },
    tiles: {
      median: aggregate(own.points, 'median'),
      availability: {
        rate: base.availability_rate,
        available: base.available,
        total: base.available + base.missed,
      },
      best_match: best,
      trend: aggregate(own.points, 'slope'),
    },
    metrics,
    columns,
    matches,
    match_count: matches.length,
    notes,
    reliability,
  };
}
