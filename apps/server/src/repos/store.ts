import type { FormFieldDefinition, SyncEntity } from '@frc/shared';
import type { PullScope, Store, StoredFullUser, StoredRow, StoredUser } from '../core/context.js';
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
    async wasApplied(opId: string): Promise<boolean> {
      const { data } = await db
        .from('applied_operations')
        .select('op_id')
        .eq('op_id', opId)
        .maybeSingle();
      return data !== null;
    },
    async markApplied(opId: string): Promise<void> {
      await db.from('applied_operations').insert({ op_id: opId });
    },
    async getRow(entity: SyncEntity, id: string): Promise<StoredRow | null> {
      const { data } = await db.from(TABLE[entity]).select('*').eq('id', id).maybeSingle();
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
      const { data } = await db
        .from('form_fields')
        .select('*')
        .eq('form_version_id', formVersionId);
      return (data ?? []) as unknown as FormFieldDefinition[];
    },
    async eventExists(eventId: string): Promise<boolean> {
      const { data } = await db.from('events').select('id').eq('id', eventId).maybeSingle();
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
    // The other 59 methods start as loud stubs, exactly as the fake does. Each later
    // task replaces the two or three it needs. `supabaseStore` is typed `: Store`, so
    // without these the file does not compile at all.
    ...stubsFor([
      'findByLogicalKey',
      'parentsExist',
      'insertConflict',
      'listConflicts',
      'getConflict',
      'resolveConflictRow',
      'insertUser',
      'updateUser',
      'listUsers',
      'countEnabledAdmins',
      'getActiveContext',
      'setActiveContext',
      'getSeason',
      'getSeasonByYear',
      'insertSeason',
      'updateSeason',
      'listSeasons',
      'getEvent',
      'insertEvent',
      'updateEvent',
      'listEvents',
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
      'countEntriesBySeason',
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
    // string[]), so TS can't see that it supplies the other 59 named Store methods;
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
