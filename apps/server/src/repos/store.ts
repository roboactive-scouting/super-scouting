import type { FormFieldDefinition, SyncEntity } from '@frc/shared';
import type {
  PullScope,
  Store,
  StoredEvent,
  StoredFullUser,
  StoredPublicUser,
  StoredRow,
  StoredSeason,
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      'getTeam',
      'getTeamByNumber',
      'insertTeam',
      'updateTeam',
      'listTeams',
      'getRoster',
      'setRoster',
      'findMatch',
      'insertMatch',
      'listMatches',
      'setMatchTeams',
      'countEntriesByMatch',
      'deleteMatch',
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
