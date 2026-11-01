import {
  AppError,
  averagePoints,
  getEntryInput,
  LIST_TEAM_EVENTS_DEFAULT_LIMIT,
  LIST_TEAM_EVENTS_MAX_LIMIT,
  listTeamEventsInput,
  matchLabel,
  mayEditEntryNow,
  QUERY_ENTRIES_DEFAULT_LIMIT,
  QUERY_ENTRIES_MAX_LIMIT,
  queryEntriesInput,
  rankByAveragePoints,
  scoreBreakdown,
  scoutedPoints,
  SEARCH_TEAMS_DEFAULT_LIMIT,
  SEARCH_TEAMS_MAX_LIMIT,
  searchTeamsInput,
  type Caller,
  type EngineEntry,
  type EntrySummary,
  type FormFieldDefinition,
  type GetEntryInput,
  type GetEntryOutput,
  type ListTeamEventsInput,
  type ListTeamEventsOutput,
  type QueryEntriesInput,
  type QueryEntriesOutput,
  type RobotStatus,
  type ScoringRule,
  type SearchTeamsInput,
  type SearchTeamsOutput,
  type TeamSearchItem,
} from '@frc/shared';
import { z } from 'zod';
import { parseInput } from '../commands/users.js';
import type {
  EntryKeyset,
  StoredEvent,
  StoredFormVersion,
  StoredMatch,
  StoredRow,
  StoredTeam,
  UseCaseContext,
} from '../context.js';
import { decodeCursor, encodeCursor } from '../cursor.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  getEntryInput,
  getEntryOutput,
  listTeamEventsInput,
  listTeamEventsOutput,
  queryEntriesInput,
  queryEntriesOutput,
  searchTeamsInput,
  searchTeamsOutput,
  type GetEntryInput,
  type GetEntryOutput,
  type ListTeamEventsInput,
  type ListTeamEventsOutput,
  type QueryEntriesInput,
  type QueryEntriesOutput,
  type SearchTeamsInput,
  type SearchTeamsOutput,
} from '@frc/shared';

/**
 * The browse and search queries (SPEC-FINAL 13.2–13.4, Appendix C; task 1.50). All four are
 * QUERIES: every role and a `service` caller may call them, so none gates on `can()`.
 *
 * SQL fetches rows over typed columns (the Store); the shared engine computes every score —
 * `scoutedPoints`, `scoreBreakdown`, `averagePoints`, `rankByAveragePoints` — with the form's
 * ACTIVE version's fields and the form's rules (SPEC 5.1), so the device, scoring the same rows
 * offline, gets the same numbers. Nothing reads into the JSONB from SQL.
 */

/** A bound on one season's events read at once; a season has a handful. */
const SEASON_EVENTS_READ_LIMIT = 200;
/** One page of an event-wide entry read (the Supabase max-rows is 1000). */
const EVENT_ENTRIES_PAGE = 1000;
/**
 * A bound on one event-wide entry read (ranks, counts, a team's average): an FRC event is well
 * under 1000 entries; past this the read stops rather than walk an unbounded table.
 */
const EVENT_ENTRIES_MAX = 20_000;

/** The queryEntries keyset, exactly as the database returned the instant (as listConflicts). */
const entryCursor = z
  .object({
    c: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/),
    i: z.string().min(1).max(64),
  })
  .strict();
/** searchTeams and listTeamEvents order by computed values, so they page by offset. */
const offsetCursor = z.object({ o: z.number().int().nonnegative() }).strict();

export const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const unique = (values: (string | null | undefined)[]): string[] => [
  ...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0)),
];
const formKindOf = (row: StoredRow): 'match' | 'super' =>
  row.form_kind === 'super' ? 'super' : 'match';
const allianceOf = (row: StoredRow): 'red' | 'blue' | null =>
  row.alliance === 'red' || row.alliance === 'blue' ? row.alliance : null;
const ROBOT_STATUS: readonly string[] = ['played', 'no_show', 'disabled', 'broke_down'];
const statusOf = (row: StoredRow): RobotStatus | null =>
  typeof row.robot_status === 'string' && ROBOT_STATUS.includes(row.robot_status)
    ? (row.robot_status as RobotStatus)
    : null;

/** How a form version's entries are scored: its form's ACTIVE version's fields, the form's rules. */
type Scoring = {
  version: StoredFormVersion;
  form_id: string;
  fields: FormFieldDefinition[];
  rules: ScoringRule[];
};

/**
 * Loads the scoring of each form version once per request. The active version is the form's
 * `active_version_id`; a form with none (every published version deleted) falls back to the
 * entry's own version. An unknown version (it cascades away with its entries) scores nothing.
 */
function scoringLoader(ctx: UseCaseContext): (versionId: string) => Promise<Scoring | null> {
  const byVersion = new Map<string, Promise<Scoring | null>>();
  const byForm = new Map<
    string,
    Promise<{ fields: FormFieldDefinition[]; rules: ScoringRule[] }>
  >();
  const formScoring = (formId: string, fallbackVersionId: string) => {
    let pending = byForm.get(formId);
    if (!pending) {
      pending = (async () => {
        const form = await ctx.store.getForm(formId);
        const activeId = form?.active_version_id ?? fallbackVersionId;
        const [fields, rules] = await Promise.all([
          ctx.store.getFormFields(activeId),
          ctx.store.getScoringRules(formId),
        ]);
        return {
          fields,
          rules: rules.map((r) => ({
            field_key: r.field_key,
            points: r.points,
            option_points: r.option_points,
          })),
        };
      })();
      byForm.set(formId, pending);
    }
    return pending;
  };
  return (versionId) => {
    let pending = byVersion.get(versionId);
    if (!pending) {
      pending = (async () => {
        const version = await ctx.store.getFormVersion(versionId);
        if (!version) return null;
        return {
          version,
          form_id: version.form_id,
          ...(await formScoring(version.form_id, version.id)),
        };
      })();
      byVersion.set(versionId, pending);
    }
    return pending;
  };
}

type Lookups = {
  teams: Map<string, StoredTeam>;
  matches: Map<string, StoredMatch>;
  names: Map<string, string>;
};

async function lookupsFor(rows: StoredRow[], ctx: UseCaseContext): Promise<Lookups> {
  const [teams, matches, users] = await Promise.all([
    ctx.store.getTeamsByIds(unique(rows.map((r) => str(r.team_id)))),
    ctx.store.getMatchesByIds(unique(rows.map((r) => str(r.match_id)))),
    ctx.store.listUserNames(unique(rows.map((r) => str(r.scouter_id)))),
  ]);
  return {
    teams: new Map(teams.map((t) => [t.id, t])),
    matches: new Map(matches.map((m) => [m.id, m])),
    names: new Map(users.map((u) => [u.id, u.full_name])),
  };
}

/** One row as the entry search lists it. `scouted_points` comes from the shared engine. */
function toSummary(row: StoredRow, look: Lookups, points: number | null): EntrySummary {
  const teamId = String(row.team_id);
  const team = look.teams.get(teamId);
  // scouting_entries.team_id is `on delete restrict`: a team named by an entry always exists.
  if (!team) throw new Error(`entry ${row.id} names team ${teamId}, which does not exist`);
  const matchId = str(row.match_id);
  const match = matchId ? look.matches.get(matchId) : undefined;
  const scouterId = String(row.scouter_id);
  return {
    id: row.id,
    event_id: String(row.event_id),
    form_kind: formKindOf(row),
    match_id: matchId,
    match_type: match?.match_type ?? null,
    match_number: match?.number ?? null,
    match_label: match ? matchLabel(match) : null,
    team_id: teamId,
    team_number: team.number,
    team_name: team.name,
    alliance: allianceOf(row),
    scouter_id: scouterId,
    scouter_name: look.names.get(scouterId) ?? null,
    robot_status: statusOf(row),
    scouted_points: points,
    client_created_at: String(row.client_created_at),
    client_updated_at: String(row.client_updated_at),
  };
}

/**
 * A stored row as the engine reads it, with the match and event columns joined (NEXT-CHAT).
 * Exported for the statistics queries (task 1.57, stats.ts).
 */
export function toEngineEntry(
  row: StoredRow,
  matches: Map<string, StoredMatch>,
  eventSortOrder: number,
): EngineEntry {
  const matchId = str(row.match_id);
  const match = matchId ? matches.get(matchId) : undefined;
  return {
    id: row.id,
    form_version_id: String(row.form_version_id),
    form_kind: formKindOf(row),
    event_id: String(row.event_id),
    match_id: matchId,
    team_id: String(row.team_id),
    alliance: allianceOf(row),
    scouter_id: String(row.scouter_id),
    robot_status: statusOf(row),
    breakdown_seconds: typeof row.breakdown_seconds === 'number' ? row.breakdown_seconds : null,
    data: record(row.data),
    client_created_at: String(row.client_created_at),
    client_updated_at: String(row.client_updated_at),
    deleted_at: str(row.deleted_at),
    match_type: match?.match_type ?? null,
    match_number: match?.number ?? null,
    event_sort_order: eventSortOrder,
  };
}

/**
 * Every LIVE entry of one event (optionally one kind, one team), walked page by page through
 * the bounded `queryEntries` read, at most EVENT_ENTRIES_MAX rows.
 */
async function allEventEntries(
  ctx: UseCaseContext,
  options: { eventId: string; formKind?: 'match' | 'super'; teamId?: string },
): Promise<StoredRow[]> {
  const out: StoredRow[] = [];
  let after: EntryKeyset | undefined;
  while (out.length < EVENT_ENTRIES_MAX) {
    const page = await ctx.store.queryEntries({ ...options, limit: EVENT_ENTRIES_PAGE, after });
    out.push(...page);
    const last = page[page.length - 1];
    if (page.length < EVENT_ENTRIES_PAGE || !last) break;
    after = { client_created_at: String(last.client_created_at), id: last.id };
  }
  return out;
}

/** The match form's scoring for a season, for the ranks: its active version and its rules. */
async function seasonMatchScoring(
  ctx: UseCaseContext,
  seasonId: string,
): Promise<{ fields: FormFieldDefinition[]; rules: ScoringRule[] } | null> {
  const form = await ctx.store.getFormByKind(seasonId, 'match');
  if (!form?.active_version_id) return null;
  const [fields, rules] = await Promise.all([
    ctx.store.getFormFields(form.active_version_id),
    ctx.store.getScoringRules(form.id),
  ]);
  return { fields, rules };
}

/** A team whose name holds the query or whose number starts with it, literally (as listTeams). */
function teamHit(team: StoredTeam, query: string | undefined): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    team.name.toLowerCase().includes(q) || (/^\d+$/.test(q) && String(team.number).startsWith(q))
  );
}

/**
 * SPEC-FINAL 13.2: the season's teams by number or name, with the active event's rank badges.
 *
 * - **The event** is `event_id` (the caller's effective event; a session override changes it),
 *   else the admin's active event. An `event_id` naming no event is `not-found`. With no event
 *   at all, the active season's teams are listed with no ranks (`event: null`).
 * - **The season's teams** are the teams on the live roster of any event of the event's season
 *   (teams are global; the roster is what ties a team to a season).
 * - **Rank** is `rankByAveragePoints` over the event's live match entries, among its roster
 *   (interim until the ranking dashboard, task 1.58). A team with no counted entry is unranked.
 * - **Order:** at-event teams by rank (unranked last, by number), then the others by number.
 *   `counts` follow the query, not the filter. Paged by offset (the order is computed).
 */
export async function searchTeams(
  caller: Caller,
  input: SearchTeamsInput,
  ctx: UseCaseContext,
): Promise<SearchTeamsOutput> {
  void caller; // every role, and a service caller, may search
  const parsed = parseInput(searchTeamsInput, input);
  const limit = Math.min(parsed.limit ?? SEARCH_TEAMS_DEFAULT_LIMIT, SEARCH_TEAMS_MAX_LIMIT);
  const offset = parsed.cursor ? decodeCursor(offsetCursor, parsed.cursor).o : 0;
  const filter = parsed.filter ?? 'all';

  let event: StoredEvent | null = null;
  let seasonId: string | null;
  if (parsed.event_id) {
    event = await ctx.store.getEvent(parsed.event_id);
    if (!event) {
      throw new AppError('not-found', 'that event does not exist; it may have been deleted', {
        event_id: parsed.event_id,
      });
    }
    seasonId = event.season_id;
  } else {
    const active = await ctx.store.getActiveContext();
    event = active.active_event_id ? await ctx.store.getEvent(active.active_event_id) : null;
    seasonId = event?.season_id ?? active.active_season_id;
  }
  const empty = { all: 0, at_event: 0, other: 0 };
  const eventRef = event ? { id: event.id, name: event.name } : null;
  if (!seasonId) return { items: [], counts: empty, event: eventRef, next_cursor: null };

  const events = await ctx.store.listEvents(seasonId, SEASON_EVENTS_READ_LIMIT);
  // The event itself is always read, even past the bound on the season's events.
  const rosterEvents =
    event && !events.some((e) => e.id === event.id) ? [...events, event] : events;
  const rosters = await Promise.all(rosterEvents.map((e) => ctx.store.getRoster(e.id)));
  const seasonTeams = new Map<string, StoredTeam>();
  for (const roster of rosters) for (const team of roster) seasonTeams.set(team.id, team);
  const atEvent = new Set(
    event ? (rosters[rosterEvents.findIndex((e) => e.id === event.id)] ?? []).map((t) => t.id) : [],
  );

  // Ranks and counts at the event, from its live entries, scored by the shared engine.
  const rank = new Map<string, number | null>();
  const entriesHere = new Map<string, number>();
  if (event) {
    const rows = await allEventEntries(ctx, { eventId: event.id });
    for (const row of rows) {
      const teamId = String(row.team_id);
      entriesHere.set(teamId, (entriesHere.get(teamId) ?? 0) + 1);
    }
    const scoring = await seasonMatchScoring(ctx, event.season_id);
    if (scoring) {
      const matchRows = rows.filter((r) => r.form_kind === 'match');
      const matches = new Map(
        (await ctx.store.getMatchesByIds(unique(matchRows.map((r) => str(r.match_id))))).map(
          (m) => [m.id, m],
        ),
      );
      const ranks = rankByAveragePoints(
        matchRows.map((r) => toEngineEntry(r, matches, event.sort_order)),
        [...seasonTeams.values()].filter((t) => atEvent.has(t.id)),
        scoring.fields,
        scoring.rules,
      );
      for (const r of ranks) rank.set(r.team_id, r.rank);
    }
  }

  const hits = [...seasonTeams.values()].filter((t) => teamHit(t, parsed.query));
  const rankOf = (t: StoredTeam) => rank.get(t.id) ?? null;
  const here = hits
    .filter((t) => atEvent.has(t.id))
    .sort((a, b) => {
      const ra = rankOf(a);
      const rb = rankOf(b);
      if (ra !== null && rb !== null) return ra - rb;
      if (ra !== null) return -1;
      if (rb !== null) return 1;
      return a.number - b.number;
    });
  const elsewhere = hits.filter((t) => !atEvent.has(t.id)).sort((a, b) => a.number - b.number);
  const counts = { all: hits.length, at_event: here.length, other: elsewhere.length };
  const listed =
    filter === 'at_event' ? here : filter === 'other' ? elsewhere : [...here, ...elsewhere];
  const page = listed.slice(offset, offset + limit);

  // The phone sub-line: the season's OTHER events where we hold live entries for each team.
  const otherEvents = events.filter((e) => e.id !== event?.id);
  const held = await ctx.store.listTeamEvents(
    page.map((t) => t.id),
    otherEvents.map((e) => e.id),
  );
  const heldAt = new Set(held.map((h) => `${h.team_id}|${h.event_id}`));

  const items: TeamSearchItem[] = page.map((team) => ({
    id: team.id,
    number: team.number,
    name: team.name,
    in_active_event: atEvent.has(team.id),
    rank: atEvent.has(team.id) ? rankOf(team) : null,
    entries_here: entriesHere.get(team.id) ?? 0,
    other_events: otherEvents
      .filter((e) => heldAt.has(`${team.id}|${e.id}`))
      .map((e) => ({ id: e.id, name: e.name })),
  }));
  return {
    items,
    counts,
    event: eventRef,
    next_cursor: offset + limit < listed.length ? encodeCursor({ o: offset + limit }) : null,
  };
}

/**
 * The events of the active season where we hold live entries for a team (SPEC-FINAL 13.2's
 * cross-event jump), in event order, each with how many entries and the newest one's
 * `client_created_at`. An event with none is not listed; an unknown team has none. Paged by
 * offset over the season's events (a handful).
 */
export async function listTeamEvents(
  caller: Caller,
  input: ListTeamEventsInput,
  ctx: UseCaseContext,
): Promise<ListTeamEventsOutput> {
  void caller; // every role, and a service caller, may read it
  const parsed = parseInput(listTeamEventsInput, input);
  const limit = Math.min(
    parsed.limit ?? LIST_TEAM_EVENTS_DEFAULT_LIMIT,
    LIST_TEAM_EVENTS_MAX_LIMIT,
  );
  const offset = parsed.cursor ? decodeCursor(offsetCursor, parsed.cursor).o : 0;

  const { active_season_id: seasonId } = await ctx.store.getActiveContext();
  if (!seasonId) return { items: [], next_cursor: null };
  const events = await ctx.store.listEvents(seasonId, SEASON_EVENTS_READ_LIMIT);
  const held = new Map(
    (
      await ctx.store.listTeamEvents(
        [parsed.team_id],
        events.map((e) => e.id),
      )
    ).map((h) => [h.event_id, h]),
  );
  const listed = events.flatMap((e) => {
    const h = held.get(e.id);
    return h && h.entry_count > 0
      ? [{ id: e.id, name: e.name, entry_count: h.entry_count, last_entry_at: h.last_entry_at }]
      : [];
  });
  return {
    items: listed.slice(offset, offset + limit),
    next_cursor: offset + limit < listed.length ? encodeCursor({ o: offset + limit }) : null,
  };
}

/**
 * SPEC-FINAL 13.3: one event's live entries (never another's), both kinds unless `form_kind`
 * narrows it, newest first, keyset-paginated; `limit` defaults to 50 and is CLAMPED to 200.
 * `query` matches a team name or number, a match number or a scouter's full name. Raw entries:
 * no duplicate or status rule is applied (that is the statistics' population, not the list's).
 * Each row carries its scouted points from the shared engine (`scoutedPoints`: null for a
 * no-show, a disabled robot and a super entry) and its scouter's full name (18.5).
 */
export async function queryEntries(
  caller: Caller,
  input: QueryEntriesInput,
  ctx: UseCaseContext,
): Promise<QueryEntriesOutput> {
  void caller; // every role, and a service caller, may search entries
  const parsed = parseInput(queryEntriesInput, input);
  const limit = Math.min(parsed.limit ?? QUERY_ENTRIES_DEFAULT_LIMIT, QUERY_ENTRIES_MAX_LIMIT);
  const cursor = parsed.cursor ? decodeCursor(entryCursor, parsed.cursor) : undefined;

  // One extra row says whether another page exists, so the last page never comes back empty.
  const rows = await ctx.store.queryEntries({
    eventId: parsed.event_id,
    formKind: parsed.form_kind,
    query: parsed.query,
    limit: limit + 1,
    after: cursor ? { client_created_at: cursor.c, id: cursor.i } : undefined,
  });
  const page = rows.slice(0, limit);
  const [look, scorings] = await Promise.all([
    lookupsFor(page, ctx),
    (async () => {
      const load = scoringLoader(ctx);
      const ids = unique(page.map((r) => str(r.form_version_id)));
      return new Map(await Promise.all(ids.map(async (id) => [id, await load(id)] as const)));
    })(),
  ]);

  const items = page.map((row) => {
    const scoring = scorings.get(String(row.form_version_id));
    const points = scoring
      ? scoutedPoints(
          { form_kind: formKindOf(row), robot_status: statusOf(row), data: record(row.data) },
          scoring.fields,
          scoring.rules,
        )
      : null;
    return toSummary(row, look, points);
  });
  const last = page[page.length - 1];
  return {
    items,
    next_cursor:
      rows.length > limit && last
        ? encodeCursor({ c: String(last.client_created_at), i: last.id })
        : null,
  };
}

function noSuchEntry(entryId: string): AppError {
  return new AppError('not-found', 'that entry does not exist; it may have been deleted', {
    entry_id: entryId,
  });
}

/**
 * SPEC-FINAL 13.4 and 18.5: one live entry fully rendered — the search row's columns, the form
 * version it was scouted on (its number), its answers by phase with points and subtotals
 * (`scoreBreakdown`, scored with the form's ACTIVE version), the team's average points at the
 * entry's event (`averagePoints`; match entries only), and `can_edit`: whether THIS caller may
 * edit it now, by the one shared rule (`mayEditEntryNow`) measured to the server's clock. A
 * missing or soft-deleted entry is `not-found`.
 */
export async function getEntry(
  caller: Caller,
  input: GetEntryInput,
  ctx: UseCaseContext,
): Promise<GetEntryOutput> {
  const parsed = parseInput(getEntryInput, input);
  const row = await ctx.store.getEntry(parsed.entry_id);
  if (!row || row.deleted_at != null) throw noSuchEntry(parsed.entry_id);

  const kind = formKindOf(row);
  const status = statusOf(row);
  const versionId = String(row.form_version_id);
  const [look, scoring, event] = await Promise.all([
    lookupsFor([row], ctx),
    scoringLoader(ctx)(versionId),
    ctx.store.getEvent(String(row.event_id)),
  ]);
  if (!scoring) throw noSuchEntry(parsed.entry_id); // its version is gone: so is the entry

  const breakdown = scoreBreakdown(
    { form_kind: kind, robot_status: status, data: record(row.data) },
    scoring.fields,
    scoring.rules,
  );

  let teamAverage: number | null = null;
  if (kind === 'match') {
    const teamRows = await allEventEntries(ctx, {
      eventId: String(row.event_id),
      formKind: 'match',
      teamId: String(row.team_id),
    });
    const matches = new Map(
      (await ctx.store.getMatchesByIds(unique(teamRows.map((r) => str(r.match_id))))).map((m) => [
        m.id,
        m,
      ]),
    );
    teamAverage = averagePoints(
      teamRows.map((r) => toEngineEntry(r, matches, event?.sort_order ?? 0)),
      scoring.fields,
      scoring.rules,
    ).avg;
  }

  return {
    ...toSummary(row, look, breakdown.total),
    form_id: scoring.form_id,
    form_version_id: versionId,
    form_version: scoring.version.version_no,
    phases: breakdown.phases,
    team_average: teamAverage,
    can_edit: mayEditEntryNow(
      caller,
      {
        scouter_id: String(row.scouter_id),
        form_kind: kind,
        client_created_at: String(row.client_created_at),
      },
      ctx.now(),
    ),
  };
}
