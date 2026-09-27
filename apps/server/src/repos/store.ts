import {
  MATCH_TYPES,
  TEAM_NUMBER_MAX,
  type FormFieldDefinition,
  type MatchSlot,
  type SyncEntity,
} from '@frc/shared';
import type {
  MatchKeyset,
  PullScope,
  Store,
  StoredEvent,
  StoredFullUser,
  StoredMatch,
  StoredMatchSlot,
  StoredPublicUser,
  StoredRow,
  StoredSeason,
  StoredTeam,
  StoredUser,
} from '../core/context.js';
import type { Db } from '../db/client.js';
import { supabasePullEntity } from './pull.js';

// `as const` matters: SupabaseClient<Database>.from() takes a literal table-name
// union, not `string`, so a widened Record<SyncEntity, string> would not typecheck.
const TABLE = {
  scouting_entry: 'scouting_entries',
  match: 'matches',
  pick_list: 'pick_lists',
  pick_list_entry: 'pick_list_entries',
  do_not_pick: 'do_not_pick',
  alliance_slot: 'alliance_slots',
  alliance_decline: 'alliance_declines',
} as const satisfies Record<SyncEntity, string>;

const FULL_USER_COLUMNS =
  'id, username, full_name, password_hash, role, must_change_password, disabled_at, created_at';
const PUBLIC_USER_COLUMNS =
  'id, username, full_name, role, must_change_password, disabled_at, created_at';
const SEASON_COLUMNS = 'id, year, game_name, field_image_path, created_at, updated_at';
const EVENT_COLUMNS = 'id, season_id, name, code, sort_order, created_at, updated_at';
const TEAM_COLUMNS = 'id, number, name, created_at, updated_at';
/** Never the reserved official-result columns: they are not read in v1 (SPEC-FINAL 3.1). */
const MATCH_COLUMNS = 'id, event_id, match_type, number, created_at, updated_at';
const SLOT_COLUMNS = 'match_id, alliance, station, team_id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The most ids one `in` filter carries. The list goes into the request URL, and 100 uuids
 * is about 3.7 KB of it: well inside any proxy's limit.
 */
const IN_CHUNK = 100;
/**
 * A bound on the event_teams rows one event reads: live rows are capped at
 * ROSTER_MAX_TEAMS by setEventRoster, and a re-added team revives its old row, so an
 * event holds at most one row per team that was ever on its roster.
 */
const EVENT_TEAMS_READ_LIMIT = 1000;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += IN_CHUNK) out.push(items.slice(i, i + IN_CHUNK));
  return out;
}

/**
 * A PostgREST `or` filter matching every team number that starts with `digits`: the
 * number itself, then each longer range up to TEAM_NUMBER_MAX's five digits ('20' →
 * 20, 200–209, 2000–2099, 20000–20999). `number` is an integer column, so a prefix
 * cannot be a LIKE. The string is interpolated into a filter, so only a digit string
 * without a leading zero is accepted — anything else throws before a query exists.
 */
export function numberPrefixFilter(digits: string): string {
  const maxDigits = String(TEAM_NUMBER_MAX).length;
  if (!/^[1-9]\d*$/.test(digits) || digits.length > maxDigits) {
    throw new Error('numberPrefixFilter: a prefix must be 1 to 5 digits, not starting with 0');
  }
  const parts = [`number.eq.${digits}`];
  for (let extra = 1; digits.length + extra <= maxDigits; extra += 1) {
    const low = Number(digits) * 10 ** extra;
    parts.push(`and(number.gte.${low},number.lte.${low + 10 ** extra - 1})`);
  }
  return parts.join(',');
}

/**
 * Keeps Postgres's error `code` (a unique violation is '23505') so a use case can map it,
 * and nothing else. NEVER `details`: on a failed write to `users` it can hold the whole
 * row, password_hash included, and rpc.ts logs any error that is not an AppError.
 */
export function dbError(error: { message: string; code?: string }): Error & { code?: string } {
  return Object.assign(new Error(error.message), { code: error.code });
}

export function supabaseStore(db: Db): Store {
  const pullEntity = supabasePullEntity(db);
  return {
    async getUser(id: string): Promise<StoredUser | null> {
      const { data, error } = await db
        .from('users')
        .select('id, role, disabled_at')
        .eq('id', id)
        .maybeSingle();
      // Swallowed, a database blip would read as "no such user": a 401 that tells the
      // client to sign in again, which may make it throw away a perfectly good token.
      if (error) throw new Error(error.message);
      return (data as StoredUser | null) ?? null;
    },
    async getFullUser(id: string): Promise<StoredFullUser | null> {
      const { data, error } = await db
        .from('users')
        .select(
          'id, username, full_name, password_hash, role, must_change_password, disabled_at, created_at',
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as StoredFullUser | null) ?? null;
    },
    async getUserByUsername(usernameLower: string): Promise<StoredFullUser | null> {
      // lower(username) is unique, so an escaped pattern hits at most one row; a `*`
      // becomes `_` (see escapeLikePattern) and may hit a few, so fetch a handful and
      // keep only the exact match. That check is also the defence in depth: a wildcard
      // that slipped through must never log someone in as a different user.
      const { data, error } = await db
        .from('users')
        .select(
          'id, username, full_name, password_hash, role, must_change_password, disabled_at, created_at',
        )
        .ilike('username', escapeLikePattern(usernameLower))
        .limit(10);
      // Surfacing this matters: swallowed, a database outage would read as "wrong password".
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as StoredFullUser[];
      return rows.find((row) => row.username.toLowerCase() === usernameLower) ?? null;
    },
    async insertUser(row: Record<string, unknown>): Promise<StoredFullUser> {
      // `row` is a generic Record: the same Record<string, unknown>-vs-generated-type gap
      // as putRow above.
      const { data, error } = await db
        .from('users')
        .insert(row as never)
        .select(FULL_USER_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredFullUser;
    },
    async updateUser(id: string, patch: Record<string, unknown>): Promise<StoredFullUser> {
      // updated_at is set by the table's set_updated_at trigger.
      const { data, error } = await db
        .from('users')
        .update(patch as never)
        .eq('id', id)
        .select(FULL_USER_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredFullUser;
    },
    async listUsers(options: Parameters<Store['listUsers']>[0]): Promise<StoredPublicUser[]> {
      // An explicit column list with no password_hash: the hash leaves the server on the
      // syncPull path and nowhere else (SPEC-FINAL 18.5, Appendix C).
      let query = db.from('users').select(PUBLIC_USER_COLUMNS);
      if (!options.includeDisabled) query = query.is('disabled_at', null);
      // Keyset on username alone is exact: the unique index on lower(username) makes
      // `username` itself unique, so no two rows share a sort key and the `id` in the
      // ORDER BY never decides anything. Ordering and `gt` use the same column collation,
      // so pages have no gaps or repeats whatever that collation is.
      if (options.after) query = query.gt('username', options.after.username);
      const { data, error } = await query
        .order('username', { ascending: true })
        .order('id', { ascending: true })
        .limit(options.limit);
      if (error) throw dbError(error);
      return (data ?? []) as StoredPublicUser[];
    },
    async countEnabledAdmins(): Promise<number> {
      const { count, error } = await db
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .is('disabled_at', null);
      if (error) throw dbError(error);
      return count ?? 0;
    },
    // The four methods below feed syncPush's idempotency and authorization decisions (and
    // eventExists, syncPull's 404). Each THROWS on a database error: swallowed, a blip
    // read as "no row", which turned an edit of someone else's entry into a create that
    // upserted over it with the pushing author and version 1 (Phase 1B review).
    async wasApplied(opId: string): Promise<boolean> {
      const { data, error } = await db
        .from('applied_operations')
        .select('op_id')
        .eq('op_id', opId)
        .maybeSingle();
      if (error) throw dbError(error);
      return data !== null;
    },
    async markApplied(opId: string): Promise<void> {
      const { error } = await db.from('applied_operations').insert({ op_id: opId });
      if (error) throw dbError(error);
    },
    async getRow(entity: SyncEntity, id: string): Promise<StoredRow | null> {
      const { data, error } = await db.from(TABLE[entity]).select('*').eq('id', id).maybeSingle();
      if (error) throw dbError(error);
      return (data as StoredRow | null) ?? null;
    },
    async putRow(entity: SyncEntity, id: string, row: Record<string, unknown>): Promise<void> {
      // `row` is a generic Record; the generated insert type for each table in TABLE
      // is a distinct literal shape, so it cannot be checked structurally here — the
      // same Record<string, unknown>-vs-Json gap noted in DEVIATIONS.md for task 0.14.
      const { error } = await db.from(TABLE[entity]).upsert({ ...row, id } as never);
      if (error) throw new Error(error.message);
    },
    async getFormFields(formVersionId: string): Promise<FormFieldDefinition[]> {
      const { data, error } = await db
        .from('form_fields')
        .select('*')
        .eq('form_version_id', formVersionId);
      // Swallowed, an entry would be validated against no fields at all.
      if (error) throw dbError(error);
      return (data ?? []) as unknown as FormFieldDefinition[];
    },
    async eventExists(eventId: string): Promise<boolean> {
      const { data, error } = await db.from('events').select('id').eq('id', eventId).maybeSingle();
      if (error) throw dbError(error);
      return data !== null;
    },
    async resolveScope(eventId: string): Promise<PullScope> {
      const { data, error } = await db
        .from('events')
        .select('id, season_id')
        .eq('id', eventId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error(`resolveScope: event ${eventId} not found`);
      return { eventId: data.id, seasonId: data.season_id };
    },
    pullEntity,
    // Task 1.17b, ahead of the rest of 1.18. The singleton row is created by the skeleton
    // migration on every project; a missing one reads as nothing set up. THROWS on a
    // database error: swallowed, a blip would tell every device no competition exists.
    async getActiveContext() {
      const { data, error } = await db
        .from('app_settings')
        .select('active_season_id, active_event_id')
        .eq('id', true)
        .maybeSingle();
      if (error) throw dbError(error);
      return {
        active_season_id: data?.active_season_id ?? null,
        active_event_id: data?.active_event_id ?? null,
      };
    },
    // Task 1.18. Both ids in ONE write, so the singleton never holds a mismatched pair.
    // An upsert on the singleton's key, not an update: the skeleton migration creates the
    // row, but an update of a missing row would fail as PGRST116 with nothing to fix it.
    async setActiveContext(next) {
      const { data, error } = await db
        .from('app_settings')
        .upsert(
          {
            id: true,
            active_season_id: next.active_season_id,
            active_event_id: next.active_event_id,
          },
          { onConflict: 'id' },
        )
        .select('active_season_id, active_event_id')
        .single();
      if (error) throw dbError(error);
      return {
        active_season_id: data.active_season_id ?? null,
        active_event_id: data.active_event_id ?? null,
      };
    },
    async getSeason(id: string): Promise<StoredSeason | null> {
      const { data, error } = await db
        .from('seasons')
        .select(SEASON_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw dbError(error);
      return (data as StoredSeason | null) ?? null;
    },
    async getSeasonByYear(year: number): Promise<StoredSeason | null> {
      const { data, error } = await db
        .from('seasons')
        .select(SEASON_COLUMNS)
        .eq('year', year)
        .maybeSingle();
      if (error) throw dbError(error);
      return (data as StoredSeason | null) ?? null;
    },
    async insertSeason(row: Record<string, unknown>): Promise<StoredSeason> {
      const { data, error } = await db
        .from('seasons')
        .insert(row as never)
        .select(SEASON_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredSeason;
    },
    async updateSeason(id: string, patch: Record<string, unknown>): Promise<StoredSeason> {
      // updated_at is set by the table's set_updated_at trigger.
      const { data, error } = await db
        .from('seasons')
        .update(patch as never)
        .eq('id', id)
        .select(SEASON_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredSeason;
    },
    async listSeasons(limit: number, after?: { year: number }): Promise<StoredSeason[]> {
      let query = db.from('seasons').select(SEASON_COLUMNS);
      // `year` is unique, so it alone is an exact keyset. Newest first.
      if (after) query = query.lt('year', after.year);
      const { data, error } = await query.order('year', { ascending: false }).limit(limit);
      if (error) throw dbError(error);
      return (data ?? []) as StoredSeason[];
    },
    async getEvent(id: string): Promise<StoredEvent | null> {
      const { data, error } = await db
        .from('events')
        .select(EVENT_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw dbError(error);
      return (data as StoredEvent | null) ?? null;
    },
    async insertEvent(row: Record<string, unknown>): Promise<StoredEvent> {
      const { data, error } = await db
        .from('events')
        .insert(row as never)
        .select(EVENT_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredEvent;
    },
    async updateEvent(id: string, patch: Record<string, unknown>): Promise<StoredEvent> {
      const { data, error } = await db
        .from('events')
        .update(patch as never)
        .eq('id', id)
        .select(EVENT_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredEvent;
    },
    async listEvents(
      seasonId: string,
      limit: number,
      after?: { sort_order: number; id: string },
    ): Promise<StoredEvent[]> {
      let query = db.from('events').select(EVENT_COLUMNS).eq('season_id', seasonId);
      if (after) {
        // The keyset is interpolated into a PostgREST filter string, so both values are
        // checked here as well as in the use case's cursor schema.
        if (!Number.isInteger(after.sort_order) || !UUID.test(after.id)) {
          throw new Error('listEvents: a keyset must be an integer sort_order and a uuid');
        }
        query = query.or(
          `sort_order.gt.${after.sort_order},and(sort_order.eq.${after.sort_order},id.gt.${after.id})`,
        );
      }
      const { data, error } = await query
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit);
      if (error) throw dbError(error);
      return (data ?? []) as StoredEvent[];
    },
    // Soft-deleted entries count: they still hold positions measured against the image,
    // and a restore would bring them back re-framed. Two reads rather than an embedded
    // join: a season holds a handful of events.
    async countEntriesBySeason(seasonId: string): Promise<number> {
      const { data: events, error } = await db
        .from('events')
        .select('id')
        .eq('season_id', seasonId);
      if (error) throw dbError(error);
      const eventIds = (events ?? []).map((e) => e.id);
      if (eventIds.length === 0) return 0;
      const { count, error: countError } = await db
        .from('scouting_entries')
        .select('id', { count: 'exact', head: true })
        .in('event_id', eventIds);
      if (countError) throw dbError(countError);
      return count ?? 0;
    },
    // Task 1.19: teams, the roster, matches and their slots. Every method THROWS on a
    // database error, keeping Postgres's code (dbError), as the season and event methods
    // do: a swallowed blip would read as "no such team" or "empty roster".
    async getTeam(id: string): Promise<StoredTeam | null> {
      const { data, error } = await db
        .from('teams')
        .select(TEAM_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw dbError(error);
      return (data as StoredTeam | null) ?? null;
    },
    async getTeamByNumber(number: number): Promise<StoredTeam | null> {
      const { data, error } = await db
        .from('teams')
        .select(TEAM_COLUMNS)
        .eq('number', number)
        .maybeSingle();
      if (error) throw dbError(error);
      return (data as StoredTeam | null) ?? null;
    },
    async insertTeam(row: Record<string, unknown>): Promise<StoredTeam> {
      const { data, error } = await db
        .from('teams')
        .insert(row as never)
        .select(TEAM_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredTeam;
    },
    async updateTeam(id: string, patch: Record<string, unknown>): Promise<StoredTeam> {
      // updated_at is set by the table's set_updated_at trigger.
      const { data, error } = await db
        .from('teams')
        .update(patch as never)
        .eq('id', id)
        .select(TEAM_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredTeam;
    },
    // By number, keyset on number (unique). A query is up to two keyset reads — an
    // escaped name ilike, and a number-prefix range filter when the query is digits —
    // merged by number. Each read returns the first `limit` rows of its own set past the
    // keyset, so the first `limit` of their union are exactly the page. `seasonId` is
    // unused in v1 (task 1.19). A literal `*` in the query matches any one character
    // (see escapeLikePattern): harmless in a search box, and it never widens past it.
    async listTeams(options: Parameters<Store['listTeams']>[0]): Promise<StoredTeam[]> {
      const { query, limit, after } = options;
      if (after && !Number.isInteger(after.number)) {
        throw new Error('listTeams: a keyset must be an integer team number');
      }
      const base = () => {
        const q = db.from('teams').select(TEAM_COLUMNS);
        return after ? q.gt('number', after.number) : q;
      };
      const read = async (
        filter: (q: ReturnType<typeof base>) => ReturnType<typeof base>,
      ): Promise<StoredTeam[]> => {
        const { data, error } = await filter(base())
          .order('number', { ascending: true })
          .limit(limit);
        if (error) throw dbError(error);
        return (data ?? []) as StoredTeam[];
      };
      if (!query) return read((q) => q);

      const reads = [read((q) => q.ilike('name', `%${escapeLikePattern(query)}%`))];
      if (/^[1-9]\d{0,4}$/.test(query)) reads.push(read((q) => q.or(numberPrefixFilter(query))));
      const byId = new Map<string, StoredTeam>();
      for (const rows of await Promise.all(reads)) for (const row of rows) byId.set(row.id, row);
      return [...byId.values()].sort((a, b) => a.number - b.number).slice(0, limit);
    },
    // Two reads rather than an embedded join, like countEntriesBySeason: the live rows'
    // team ids, then those teams by number.
    async getRoster(eventId: string): Promise<StoredTeam[]> {
      const { data, error } = await db
        .from('event_teams')
        .select('team_id')
        .eq('event_id', eventId)
        .is('deleted_at', null)
        .limit(EVENT_TEAMS_READ_LIMIT);
      if (error) throw dbError(error);
      const ids = (data ?? []).map((r) => r.team_id);
      if (ids.length === 0) return [];
      const teams: StoredTeam[] = [];
      for (const chunk of chunks(ids)) {
        const res = await db
          .from('teams')
          .select(TEAM_COLUMNS)
          .in('id', chunk)
          .order('number', { ascending: true });
        if (res.error) throw dbError(res.error);
        teams.push(...((res.data ?? []) as StoredTeam[]));
      }
      return teams.sort((a, b) => a.number - b.number);
    },
    // Reads every row of the event, tombstones included, and writes only the difference:
    // inserts first (the write a foreign key can refuse, so a refusal changes nothing),
    // then revivals of each re-added team's NEWEST tombstone, then the removals'
    // tombstones. Not one transaction: a failure midway leaves part of the change, which
    // re-running the same call completes.
    async setRoster(eventId: string, teamIds: string[], at: string): Promise<void> {
      const { data, error } = await db
        .from('event_teams')
        .select('id, team_id, deleted_at, updated_at')
        .eq('event_id', eventId)
        .limit(EVENT_TEAMS_READ_LIMIT);
      if (error) throw dbError(error);
      const rows = data ?? [];
      const live = new Set(rows.filter((r) => r.deleted_at === null).map((r) => r.team_id));
      const wanted = new Set(teamIds);
      const revive: string[] = [];
      const insert: Record<string, unknown>[] = [];
      for (const teamId of wanted) {
        if (live.has(teamId)) continue;
        const tombstone = rows
          .filter((r) => r.team_id === teamId)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
        if (tombstone) revive.push(tombstone.id);
        else insert.push({ id: crypto.randomUUID(), event_id: eventId, team_id: teamId });
      }
      const remove = rows
        .filter((r) => r.deleted_at === null && !wanted.has(r.team_id))
        .map((r) => r.id);

      if (insert.length > 0) {
        const res = await db.from('event_teams').insert(insert as never);
        if (res.error) throw dbError(res.error);
      }
      for (const [ids, deletedAt] of [
        [revive, null],
        [remove, at],
      ] as const) {
        for (const chunk of chunks([...ids])) {
          const res = await db
            .from('event_teams')
            .update({ deleted_at: deletedAt })
            .in('id', chunk);
          if (res.error) throw dbError(res.error);
        }
      }
    },
    async findMatch(
      eventId: string,
      matchType: string,
      number: number,
    ): Promise<StoredMatch | null> {
      const { data, error } = await db
        .from('matches')
        .select(MATCH_COLUMNS)
        .eq('event_id', eventId)
        .eq('match_type', matchType)
        .eq('number', number)
        .maybeSingle();
      if (error) throw dbError(error);
      return (data as StoredMatch | null) ?? null;
    },
    async getMatch(id: string): Promise<StoredMatch | null> {
      const { data, error } = await db
        .from('matches')
        .select(MATCH_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw dbError(error);
      return (data as StoredMatch | null) ?? null;
    },
    async insertMatch(row: Record<string, unknown>): Promise<StoredMatch> {
      const { data, error } = await db
        .from('matches')
        .insert(row as never)
        .select(MATCH_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredMatch;
    },
    async updateMatch(id: string, patch: Record<string, unknown>): Promise<StoredMatch> {
      // updated_at is set by the table's set_updated_at trigger.
      const { data, error } = await db
        .from('matches')
        .update(patch as never)
        .eq('id', id)
        .select(MATCH_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredMatch;
    },
    // Practice, qualification, playoff, then number. PostgREST cannot order by a CASE,
    // and the alphabetical order of the types is wrong, so this reads one type at a time
    // from the keyset's type onward — at most three reads a page, and one when the page
    // fills from the first type.
    async listMatches(eventId: string, limit: number, after?: MatchKeyset): Promise<StoredMatch[]> {
      const start = after ? MATCH_TYPES.indexOf(after.match_type) : 0;
      if (after && (start < 0 || !Number.isInteger(after.number))) {
        throw new Error('listMatches: a keyset must be a match type and an integer number');
      }
      const out: StoredMatch[] = [];
      for (const matchType of MATCH_TYPES.slice(start)) {
        const remaining = limit - out.length;
        if (remaining <= 0) break;
        let query = db
          .from('matches')
          .select(MATCH_COLUMNS)
          .eq('event_id', eventId)
          .eq('match_type', matchType);
        if (after && matchType === after.match_type) query = query.gt('number', after.number);
        const { data, error } = await query.order('number', { ascending: true }).limit(remaining);
        if (error) throw dbError(error);
        out.push(...((data ?? []) as StoredMatch[]));
      }
      return out;
    },
    async listMatchSlots(matchIds: string[]): Promise<StoredMatchSlot[]> {
      const slots: StoredMatchSlot[] = [];
      for (const chunk of chunks(matchIds)) {
        const { data, error } = await db
          .from('match_teams')
          .select(SLOT_COLUMNS)
          .in('match_id', chunk);
        if (error) throw dbError(error);
        slots.push(...((data ?? []) as StoredMatchSlot[]));
      }
      return slots;
    },
    // Writes only the difference, so an unchanged slot keeps its row and its updated_at:
    // cleared slots deleted, a changed team updated IN PLACE (the delta pull sees an
    // update; it never sees a delete), new slots inserted. Not one transaction.
    async setMatchTeams(matchId: string, slots: MatchSlot[]): Promise<void> {
      const { data, error } = await db
        .from('match_teams')
        .select('id, alliance, station, team_id')
        .eq('match_id', matchId);
      if (error) throw dbError(error);
      const key = (s: { alliance: string; station: number }) => `${s.alliance}:${s.station}`;
      const current = new Map((data ?? []).map((row) => [key(row), row]));
      const wanted = new Map(slots.map((slot) => [key(slot), slot]));

      const cleared = [...current].filter(([k]) => !wanted.has(k)).map(([, row]) => row.id);
      if (cleared.length > 0) {
        const res = await db.from('match_teams').delete().in('id', cleared);
        if (res.error) throw dbError(res.error);
      }
      const insert: Record<string, unknown>[] = [];
      for (const [k, slot] of wanted) {
        const row = current.get(k);
        if (row && row.team_id === slot.team_id) continue;
        if (row) {
          const res = await db
            .from('match_teams')
            .update({ team_id: slot.team_id })
            .eq('id', row.id);
          if (res.error) throw dbError(res.error);
        } else {
          insert.push({ id: crypto.randomUUID(), match_id: matchId, ...slot });
        }
      }
      if (insert.length > 0) {
        const res = await db.from('match_teams').insert(insert as never);
        if (res.error) throw dbError(res.error);
      }
    },
    // Soft-deleted entries count: the `on delete restrict` foreign key counts them too.
    async countEntriesByMatch(matchId: string): Promise<number> {
      const { count, error } = await db
        .from('scouting_entries')
        .select('id', { count: 'exact', head: true })
        .eq('match_id', matchId);
      if (error) throw dbError(error);
      return count ?? 0;
    },
    // A hard delete. The match's match_teams cascade; an entry refuses it with 23503.
    async deleteMatch(id: string): Promise<void> {
      const { error } = await db.from('matches').delete().eq('id', id);
      if (error) throw dbError(error);
    },
    // The remaining methods start as loud stubs, exactly as the fake does. Each later
    // task replaces the two or three it needs. `supabaseStore` is typed `: Store`, so
    // without these the file does not compile at all.
    ...stubsFor([
      'findByLogicalKey',
      'parentsExist',
      'insertConflict',
      'listConflicts',
      'getConflict',
      'resolveConflictRow',
      'getForm',
      'getFormByKind',
      'insertForm',
      'updateForm',
      'getFormVersion',
      'listFormVersions',
      'insertFormVersion',
      'updateFormVersion',
      'countEntriesByFormVersion',
      'replaceFormFields',
      'getScoringRules',
      'replaceScoringRules',
      'getEntry',
      'queryEntries',
      'entriesForScope',
      'listTeamEvents',
      'deleteSeason',
      'deleteEvent',
      'deleteFormCascade',
      'deleteFormVersion',
      'countDeleteImpact',
    ]),
    // The spread above only carries an index signature (its keys come from a plain
    // string[]), so TS can't see that it supplies the remaining named Store methods;
    // the assertion tells it what `stubsFor` guarantees at runtime instead.
  } as Store;
}

/**
 * Makes a string match only itself in a PostgREST `like`/`ilike` filter. Postgres treats
 * `%` and `_` as wildcards and `\` as the escape, so each is backslash-escaped. PostgREST
 * additionally rewrites every `*` to `%` before Postgres sees it, which leaves no way to
 * express a literal `*` (`\*` arrives as `\%`, a literal percent sign). `*` therefore
 * becomes `_`, which matches it along with any other single character; callers must
 * keep only the exact match from the rows that come back.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '_');
}

/** Shared by both Store implementations. A missing method fails by name, never as undefined. */
export function stubsFor(names: string[]): Record<string, () => Promise<never>> {
  return Object.fromEntries(
    names.map((name) => [
      name,
      async (): Promise<never> => {
        throw new Error(`Store.${name} is not implemented yet — it lands with its own task`);
      },
    ]),
  );
}
