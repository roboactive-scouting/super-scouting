import { z } from 'zod';
import { FIELD_PHASES } from './forms';
import { matchType } from './matches';
import { ROBOT_STATUSES } from './search';

/**
 * The wire schemas of the statistics queries (SPEC-FINAL 13.1, 13.5, Appendix C; task 1.57):
 * `getTeamStats` (the team page) and `rankTeams` (the FIXED phase 1 ranking table, D18). Both
 * are QUERIES: every role and a `service` caller may call them. Every number on them is computed
 * by the shared engine (`buildTeamStats`, `buildRankTable` in engine/teamStats.ts), which the
 * device runs offline on its own rows, so neither the server nor the client holds a formula.
 * Browser-safe: zod only.
 */

/** Not a uuid check: the in-memory store's fixture ids are not uuids (as search.ts). */
const rowId = z.string().min(1);
const eventRef = z.object({ id: z.string(), name: z.string() });
const direction = z.enum(['higher_is_better', 'lower_is_better', 'neutral']);

export const GET_TEAM_STATS_DEFAULT_LIMIT = 100;
/** A larger `limit` is clamped to this, not rejected: `next_cursor` says there is more. */
export const GET_TEAM_STATS_MAX_LIMIT = 200;
/** The newest notes `getTeamStats` returns; an event has far fewer. */
export const TEAM_NOTES_MAX = 200;

/**
 * The scope of a team's statistics (SPEC-FINAL 11.4). Phase 1 computes "per team per
 * competition" only: `{ mode: 'event', event_id }`. The season scope (the full-season slope
 * view) arrives with the dashboards that need it; another mode is `invalid`.
 */
export const statsScope = z.object({ mode: z.literal('event'), event_id: rowId }).strict();
export type StatsScope = z.infer<typeof statsScope>;

/** `limit` and `cursor` page the `matches` list only; every other part comes whole. */
export const getTeamStatsInput = z
  .object({
    team_id: rowId,
    scope: statsScope,
    limit: z.number().int().min(1).optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();
export type GetTeamStatsInput = z.input<typeof getTeamStatsInput>;

/** The stat-row groups, in page order: Overall, then the form's phases (`FIELD_PHASES`). */
export const STAT_GROUPS = ['overall', ...FIELD_PHASES] as const;
export type StatGroup = (typeof STAT_GROUPS)[number];

/**
 * How a metric renders: `number` (a value, a bar, a trend line), `rate` (a 0–1 fraction shown
 * as a percentage), `ordinal` (an average option rank, shown as the nearest option's label in
 * `display`), `nominal` (the most frequent option, words only: no bar, no trend, no domain).
 */
export const METRIC_KINDS = ['number', 'rate', 'ordinal', 'nominal'] as const;
export type MetricKind = (typeof METRIC_KINDS)[number];

/** The aggregations the phase 1 team page uses (a subset of the engine's `AGGREGATIONS`). */
export const STAT_AGGREGATIONS = ['avg', 'median', 'stddev', 'rate', 'mode'] as const;

/** One point of a metric's sparkline. A no-show or disabled match is `value: null`, a gap. */
export const statsSeriesPoint = z.object({
  entry_id: z.string(),
  match_label: z.string(),
  value: z.number().nullable(),
});

/**
 * One stat row of the team page (13.1). `value` null means no data ("—"), never 0; with
 * `unavailable_reason` set it means the metric cannot be calculated (11.7). `domain` is the
 * 12.6 colour domain at the event over the roster's teams (null: no bar). A `neutral` metric
 * keeps its domain for the faint bar, but is never shaded and never a sort key.
 */
export const statsMetric = z.object({
  key: z.string(),
  field_key: z.string().nullable(),
  label: z.string(),
  group: z.enum(STAT_GROUPS),
  kind: z.enum(METRIC_KINDS),
  aggregation: z.enum(STAT_AGGREGATIONS),
  direction,
  value: z.number().nullable(),
  display: z.string().nullable(),
  domain: z.object({ min: z.number(), max: z.number() }).nullable(),
  /** The team's per-match values, oldest → newest (qualification matches only). */
  series: z.array(statsSeriesPoint),
  unavailable_reason: z.enum(['type-changed', 'absent']).nullable(),
});
export type StatsMetric = z.infer<typeof statsMetric>;

/** One value cell of the match table: a number (counts, ranks, 1/0) and/or the words shown. */
export const statsCell = z.object({ value: z.number().nullable(), display: z.string().nullable() });
export type StatsCell = z.infer<typeof statsCell>;

/**
 * One match entry of the team at the event (13.1's match-by-match table), practice and playoff
 * included (they show in the list and never feed a figure). A no-show or disabled robot has
 * `scouted_points: null` and every cell null ("—"), never 0.
 */
export const statsMatchRow = z.object({
  entry_id: z.string(),
  match_id: z.string().nullable(),
  match_label: z.string().nullable(),
  match_type: matchType.nullable(),
  match_number: z.number().int().nullable(),
  robot_status: z.enum(ROBOT_STATUSES).nullable(),
  scouted_points: z.number().nullable(),
  scouter_id: z.string(),
  scouter_name: z.string().nullable(),
  /** Keyed by `columns[].key`. */
  columns: z.record(statsCell),
});
export type StatsMatchRow = z.infer<typeof statsMatchRow>;

/** One Long-text answer of the team's entries at the event (both kinds), newest first. */
export const statsNote = z.object({
  entry_id: z.string(),
  form_kind: z.enum(['match', 'super']),
  match_label: z.string().nullable(),
  match_number: z.number().int().nullable(),
  field_key: z.string(),
  field_label: z.string(),
  value: z.string(),
  scouter_name: z.string().nullable(),
  client_updated_at: z.string(),
});
export type StatsNote = z.infer<typeof statsNote>;

/** SPEC-FINAL 11.3's reliability figures, with the qualification matches named under them. */
export const statsReliability = z.object({
  breakdowns: z.number().int().nonnegative(),
  no_shows: z.number().int().nonnegative(),
  disabled: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  missed: z.number().int().nonnegative(),
  availability_rate: z.number().nullable(),
  breakdown_matches: z.array(z.string()),
  no_show_matches: z.array(z.string()),
  disabled_matches: z.array(z.string()),
});
export type StatsReliability = z.infer<typeof statsReliability>;

export const getTeamStatsOutput = z.object({
  team: z.object({ id: z.string(), number: z.number().int(), name: z.string() }),
  event: eventRef.nullable(),
  /** The team's live entries at the event, both kinds (the header's "10 entries"). */
  entry_count: z.number().int().nonnegative(),
  /** The canonical basic rank among the event's roster — the same ordering as `rankTeams`. */
  rank: z.object({
    rank: z.number().int().positive().nullable(),
    of: z.number().int().nonnegative(),
  }),
  headline: z.object({ label: z.string(), value: z.number().nullable() }),
  tiles: z.object({
    median: z.number().nullable(),
    availability: z.object({
      rate: z.number().nullable(),
      available: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
    best_match: z
      .object({ entry_id: z.string(), match_label: z.string(), points: z.number() })
      .nullable(),
    /** The `slope` of points per match; null with fewer than two counted matches. */
    trend: z.number().nullable(),
  }),
  metrics: z.array(statsMetric),
  /** The match table's metric columns: the scored fields, in form order. */
  columns: z.array(z.object({ key: z.string(), label: z.string() })),
  matches: z.array(statsMatchRow),
  /** Every match row before paging; `matches` holds one page of them. */
  match_count: z.number().int().nonnegative(),
  notes: z.array(statsNote),
  reliability: statsReliability,
  next_cursor: z.string().nullable(),
});
export type GetTeamStatsOutput = z.infer<typeof getTeamStatsOutput>;

/**
 * The fixed phase 1 ranking table's sortable columns (SPEC-FINAL 13.5, D18). Standard
 * deviation is never one (11.3), and there is no weighting of any kind in phase 1.
 */
export const RANK_SORT_KEYS = [
  'average_points',
  'availability_rate',
  'breakdowns',
  'no_shows',
  'disabled',
  'matches_counted',
  'number',
] as const;
export type RankSortKey = (typeof RANK_SORT_KEYS)[number];
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** `sort_by` defaults to `average_points` (the canonical basic rank, 11.5). */
export const rankTeamsInput = z
  .object({
    event_id: rowId,
    sort_by: z.enum(RANK_SORT_KEYS).optional(),
    direction: z.enum(SORT_DIRECTIONS).optional(),
  })
  .strict();
export type RankTeamsInput = z.input<typeof rankTeamsInput>;

/** One roster team's row. `rank` is the canonical basic rank, whatever the sort. */
export const rankRow = z.object({
  team_id: z.string(),
  number: z.number().int(),
  name: z.string(),
  rank: z.number().int().positive().nullable(),
  average_points: z.number().nullable(),
  matches_counted: z.number().int().nonnegative(),
  breakdowns: z.number().int().nonnegative(),
  no_shows: z.number().int().nonnegative(),
  disabled: z.number().int().nonnegative(),
  availability_rate: z.number().nullable(),
});
export type RankRow = z.infer<typeof rankRow>;

/** Every roster team, no pagination (13.5: a 50-team event), in the requested order. */
export const rankTeamsOutput = z.object({ event: eventRef, rows: z.array(rankRow) });
export type RankTeamsOutput = z.infer<typeof rankTeamsOutput>;
