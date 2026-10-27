import {
  AppError,
  buildRankTable,
  buildTeamStats,
  GET_TEAM_STATS_DEFAULT_LIMIT,
  GET_TEAM_STATS_MAX_LIMIT,
  getTeamStatsInput,
  rankTeamsInput,
  TEAM_NOTES_MAX,
  type Caller,
  type EngineEntry,
  type FormFieldDefinition,
  type GetTeamStatsInput,
  type GetTeamStatsOutput,
  type RankTeamsInput,
  type RankTeamsOutput,
  type StatsScoring,
  type StatsTeam,
} from '@frc/shared';
import { z } from 'zod';
import { parseInput } from '../commands/users.js';
import type { StoredEvent, StoredRow, UseCaseContext } from '../context.js';
import { decodeCursor, encodeCursor } from '../cursor.js';
import { str, toEngineEntry, unique } from './search.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  getTeamStatsInput,
  getTeamStatsOutput,
  rankTeamsInput,
  rankTeamsOutput,
  type GetTeamStatsInput,
  type GetTeamStatsOutput,
  type RankTeamsInput,
  type RankTeamsOutput,
} from '@frc/shared';

/**
 * The statistics queries (SPEC-FINAL 13.1, 13.5, Appendix C; task 1.57). Both are QUERIES:
 * every role and a `service` caller may call them, so neither gates on `can()`.
 *
 * SQL fetches rows over typed columns (the Store: the event, its roster, its live entries,
 * their matches, the forms' active versions and rules, the versions the entries name, the
 * scouters' names); the shared engine computes everything — `buildTeamStats` and
 * `buildRankTable`, the same pure functions the device runs offline (9.6). There is no formula
 * here: this file only fetches, calls, and pages.
 */

/** getTeamStats pages its match list by offset (the order is computed). */
const offsetCursor = z.object({ o: z.number().int().nonnegative() }).strict();

const noSuchEvent = (eventId: string) =>
  new AppError('not-found', 'that event does not exist; it may have been deleted', {
    event_id: eventId,
  });

/**
 * A form's ACTIVE version's fields and the form's rules (SPEC-FINAL 5.1), for one kind in a
 * season. No form, or one with no active version (every published version deleted, and its
 * entries with them), scores nothing: no fields, no rules.
 */
async function activeScoring(
  ctx: UseCaseContext,
  seasonId: string,
  kind: 'match' | 'super',
): Promise<StatsScoring> {
  const form = await ctx.store.getFormByKind(seasonId, kind);
  if (!form?.active_version_id) return { fields: [], rules: [] };
  const [fields, rules] = await Promise.all([
    ctx.store.getFormFields(form.active_version_id),
    ctx.store.getScoringRules(form.id),
  ]);
  return {
    fields,
    rules: rules.map((r) => ({
      field_key: r.field_key,
      points: r.points,
      option_points: r.option_points,
    })),
  };
}

type EventRows = {
  event: StoredEvent;
  roster: StatsTeam[];
  rows: StoredRow[];
  entries: EngineEntry[];
  scoring: StatsScoring;
};

/** One event's roster and live entries, joined for the engine, and the match form's scoring. */
async function loadEvent(ctx: UseCaseContext, eventId: string): Promise<EventRows> {
  const event = await ctx.store.getEvent(eventId);
  if (!event) throw noSuchEvent(eventId);
  const [roster, rows, scoring] = await Promise.all([
    ctx.store.getRoster(event.id),
    ctx.store.entriesForScope({ eventIds: [event.id] }),
    activeScoring(ctx, event.season_id, 'match'),
  ]);
  const matches = new Map(
    (await ctx.store.getMatchesByIds(unique(rows.map((r) => str(r.match_id))))).map((m) => [
      m.id,
      m,
    ]),
  );
  return {
    event,
    roster: roster.map((t) => ({ id: t.id, number: t.number, name: t.name })),
    rows,
    entries: rows.map((r) => toEngineEntry(r, matches, event.sort_order)),
    scoring,
  };
}

/**
 * SPEC-FINAL 13.5 (D18): the FIXED phase 1 ranking table of one event — every roster team with
 * its canonical basic rank, average scouted points, matches counted and the four reliability
 * figures, sorted by any of those columns (never by standard deviation; `invalid` otherwise),
 * nulls last. No weighting, no contributions: those are phase 2. Not paginated (a 50-team
 * event). An unknown event is `not-found`.
 */
export async function rankTeams(
  caller: Caller,
  input: RankTeamsInput,
  ctx: UseCaseContext,
): Promise<RankTeamsOutput> {
  void caller; // every role, and a service caller, may read the ranking
  const parsed = parseInput(rankTeamsInput, input);
  const { event, roster, entries, scoring } = await loadEvent(ctx, parsed.event_id);
  return {
    event: { id: event.id, name: event.name },
    rows: buildRankTable({
      teams: roster,
      entries,
      scoring,
      sort_by: parsed.sort_by,
      direction: parsed.direction,
    }),
  };
}

/**
 * SPEC-FINAL 13.1: everything the team page shows for one team at one event (`scope.mode:
 * 'event'`; phase 1 has no other scope) — rank, headline, tiles, every metric with its
 * sparkline and colour domain, the match table, the notes and the reliability counts — from
 * `buildTeamStats`. `limit` (default 100, CLAMPED to 200) and `cursor` page `matches` only;
 * `match_count` is the whole list's size. Notes are the newest TEAM_NOTES_MAX (200). An unknown
 * team or event is `not-found`; a team with no entries there gets its empty page, not an error.
 */
export async function getTeamStats(
  caller: Caller,
  input: GetTeamStatsInput,
  ctx: UseCaseContext,
): Promise<GetTeamStatsOutput> {
  void caller; // every role, and a service caller, may read a team's statistics
  const parsed = parseInput(getTeamStatsInput, input);
  const limit = Math.min(parsed.limit ?? GET_TEAM_STATS_DEFAULT_LIMIT, GET_TEAM_STATS_MAX_LIMIT);
  const offset = parsed.cursor ? decodeCursor(offsetCursor, parsed.cursor).o : 0;

  const team = await ctx.store.getTeam(parsed.team_id);
  if (!team) {
    throw new AppError('not-found', 'that team does not exist', { team_id: parsed.team_id });
  }
  const { event, roster, rows, entries, scoring } = await loadEvent(ctx, parsed.scope.event_id);
  const own = rows.filter((r) => r.team_id === team.id);
  const versionIds = unique(rows.map((r) => str(r.form_version_id)));
  const [versions, superScoring, scouters] = await Promise.all([
    Promise.all(
      versionIds.map(async (id) => ({
        id,
        fields: (await ctx.store.getFormFields(id)) as readonly FormFieldDefinition[],
      })),
    ),
    activeScoring(ctx, event.season_id, 'super'),
    ctx.store.listUserNames(unique(own.map((r) => str(r.scouter_id)))),
  ]);

  const stats = buildTeamStats({
    team: { id: team.id, number: team.number, name: team.name },
    event: { id: event.id, name: event.name },
    teams: roster,
    entries,
    scoring,
    versions,
    superFields: superScoring.fields,
    scouters,
  });
  return {
    ...stats,
    matches: stats.matches.slice(offset, offset + limit),
    notes: stats.notes.slice(0, TEAM_NOTES_MAX),
    next_cursor: offset + limit < stats.matches.length ? encodeCursor({ o: offset + limit }) : null,
  };
}
