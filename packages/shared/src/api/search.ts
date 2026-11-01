import { z } from 'zod';
import { FIELD_TYPES } from '../forms/config';
import { NAME_MAX_LENGTH } from './context';
import { FIELD_PHASES, formKind } from './forms';
import { matchType } from './matches';

/**
 * The wire schemas of the browse and search queries (SPEC-FINAL 13.2–13.4, Appendix C; task
 * 1.50): `searchTeams`, `listTeamEvents`, `queryEntries`, `getEntry`. All four are QUERIES —
 * every role and a `service` caller may call them — and each is bounded and paginated: a
 * `limit` above the maximum is CLAMPED, and `next_cursor` (opaque) says there is more.
 * Scores are computed by the shared engine (`scoutedPoints`, `scoreBreakdown`,
 * `rankByAveragePoints`), never stored. Browser-safe: zod only.
 */

/**
 * Not a uuid check: the in-memory store's fixture ids are not uuids (as conflicts.ts). The
 * Supabase store reads an id that is not a uuid as no row.
 */
const rowId = z.string().min(1);

/** A search box: trimmed, at most a name's length, and a blank one is no query at all. */
const searchText = z
  .string()
  .trim()
  .max(NAME_MAX_LENGTH)
  .optional()
  .transform((value) => (value ? value : undefined));

const limit = z.number().int().min(1).optional();
const cursor = z.string().min(1).optional();

export const SEARCH_TEAMS_DEFAULT_LIMIT = 50;
/** A larger `limit` is clamped to this, not rejected: `next_cursor` says there is more. */
export const SEARCH_TEAMS_MAX_LIMIT = 200;
export const LIST_TEAM_EVENTS_DEFAULT_LIMIT = 50;
export const LIST_TEAM_EVENTS_MAX_LIMIT = 100;
export const QUERY_ENTRIES_DEFAULT_LIMIT = 50;
export const QUERY_ENTRIES_MAX_LIMIT = 200;

/** The team search's chips (page 23): every team, the active event's, the others. */
export const TEAM_SEARCH_FILTERS = ['all', 'at_event', 'other'] as const;
export type TeamSearchFilter = (typeof TEAM_SEARCH_FILTERS)[number];

/**
 * `event_id` is the caller's EFFECTIVE event (a session override changes it); absent, the
 * admin's active event. `query` matches a team-number prefix or a case-insensitive name
 * substring, literally. `filter` defaults to `all`; the page's own default chip is the client's.
 */
export const searchTeamsInput = z
  .object({
    query: searchText,
    event_id: rowId.optional(),
    filter: z.enum(TEAM_SEARCH_FILTERS).optional(),
    limit,
    cursor,
  })
  .strict();
export type SearchTeamsInput = z.input<typeof searchTeamsInput>;

const eventRef = z.object({ id: z.string(), name: z.string() });

/** One team of the season (SPEC-FINAL 13.2). */
export const teamSearchItem = z.object({
  id: z.string(),
  number: z.number().int(),
  name: z.string(),
  /** On the active event's live roster. */
  in_active_event: z.boolean(),
  /** Its place by average points at the active event; null when not there or not ranked yet. */
  rank: z.number().int().positive().nullable(),
  /** Live entries (both kinds) for the team at the active event. */
  entries_here: z.number().int().nonnegative(),
  /** The season's other events where we hold live entries for it, in event order. */
  other_events: z.array(eventRef),
});
export type TeamSearchItem = z.infer<typeof teamSearchItem>;

/**
 * At-event teams by rank (unranked last, by number), then the other teams by number. `counts`
 * reflect the query but not the filter, so every chip shows its number. `event` is the event
 * the ranks are from; null when there is none (nothing set up).
 */
export const searchTeamsOutput = z.object({
  items: z.array(teamSearchItem),
  counts: z.object({
    all: z.number().int().nonnegative(),
    at_event: z.number().int().nonnegative(),
    other: z.number().int().nonnegative(),
  }),
  event: eventRef.nullable(),
  next_cursor: z.string().nullable(),
});
export type SearchTeamsOutput = z.infer<typeof searchTeamsOutput>;

export const listTeamEventsInput = z.object({ team_id: rowId, limit, cursor }).strict();
export type ListTeamEventsInput = z.input<typeof listTeamEventsInput>;

/**
 * The events of the active season where we hold live entries for the team, in event order
 * (the cross-event jump of 13.2: "6 entries · Mar 2026"). `last_entry_at` is the newest
 * entry's `client_created_at`.
 */
export const listTeamEventsOutput = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      entry_count: z.number().int().positive(),
      last_entry_at: z.string().nullable(),
    }),
  ),
  next_cursor: z.string().nullable(),
});
export type ListTeamEventsOutput = z.infer<typeof listTeamEventsOutput>;

/**
 * One event only (never another); both kinds unless `form_kind` narrows it. `query` matches a
 * team name (substring), a team number (prefix), a match number (exact; "Q12" names the type
 * too) or a scouter's full name (substring), case-insensitive and literal.
 */
export const queryEntriesInput = z
  .object({
    event_id: rowId,
    form_kind: formKind.optional(),
    query: searchText,
    limit,
    cursor,
  })
  .strict();
export type QueryEntriesInput = z.input<typeof queryEntriesInput>;

export const ROBOT_STATUSES = ['played', 'no_show', 'disabled', 'broke_down'] as const;

/** One entry as the entry search lists it (13.3), with the scouter's name (18.5). */
export const entrySummary = z.object({
  id: z.string(),
  event_id: z.string(),
  form_kind: formKind,
  /** Null for a super entry, and so are the match's type, number and label. */
  match_id: z.string().nullable(),
  match_type: matchType.nullable(),
  match_number: z.number().int().nullable(),
  /** "Q12", as the device writes it (`matchLabel`). */
  match_label: z.string().nullable(),
  team_id: z.string(),
  team_number: z.number().int(),
  team_name: z.string(),
  alliance: z.enum(['red', 'blue']).nullable(),
  scouter_id: z.string(),
  scouter_name: z.string().nullable(),
  robot_status: z.enum(ROBOT_STATUSES).nullable(),
  /** `scoutedPoints`: null for a no-show, a disabled robot and a super entry — never 0 for them. */
  scouted_points: z.number().nullable(),
  client_created_at: z.string(),
  client_updated_at: z.string(),
});
export type EntrySummary = z.infer<typeof entrySummary>;

/** Live entries only, newest first by `client_created_at`, then id. */
export const queryEntriesOutput = z.object({
  items: z.array(entrySummary),
  next_cursor: z.string().nullable(),
});
export type QueryEntriesOutput = z.infer<typeof queryEntriesOutput>;

export const getEntryInput = z.object({ entry_id: rowId }).strict();
export type GetEntryInput = z.input<typeof getEntryInput>;

/** `BreakdownField` of the engine (engine/breakdown.ts) on the wire. */
export const breakdownField = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(FIELD_TYPES),
  /** Absent when the entry holds no value for the field. */
  value: z.unknown().optional(),
  points: z.number().nullable(),
});

/** `BreakdownPhase` of the engine on the wire. */
export const breakdownPhase = z.object({
  phase: z.enum(FIELD_PHASES),
  subtotal: z.number().nullable(),
  fields: z.array(breakdownField),
});

/**
 * One entry fully rendered (13.4): the summary, the form version it was scouted on (its NUMBER,
 * "form v3"), its answers by phase from `scoreBreakdown` (empty for a no-show or disabled
 * robot), the team's average points at the entry's event (match entries; null otherwise or
 * with nothing counted), and whether THIS caller may edit it now (`mayEditEntryNow`).
 */
export const getEntryOutput = entrySummary.extend({
  form_id: z.string(),
  form_version_id: z.string(),
  form_version: z.number().int(),
  phases: z.array(breakdownPhase),
  team_average: z.number().nullable(),
  can_edit: z.boolean(),
});
export type GetEntryOutput = z.infer<typeof getEntryOutput>;
