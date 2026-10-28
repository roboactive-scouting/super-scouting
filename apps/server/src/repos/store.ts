import {
  MATCH_TYPES,
  TEAM_NUMBER_MAX,
  type FormFieldDefinition,
  type MatchSlot,
  type SyncEntity,
} from '@frc/shared';
import type {
  AnalysisCounts,
  EntryKeyset,
  EntryScope,
  EntryTally,
  MatchEntryRef,
  MatchKeyset,
  PullScope,
  FormDeletion,
  NewConflict,
  Store,
  StoredConflict,
  StoredEvent,
  StoredForm,
  StoredFormExport,
  StoredFormVersion,
  StoredFullUser,
  StoredMatch,
  StoredMatchSlot,
  StoredPublicUser,
  StoredRow,
  StoredScoringRule,
  StoredSeason,
  StoredTeam,
  StoredUser,
  TeamEventEntries,
} from '../core/context.js';
import {
  entrySearch,
  matchMatches,
  scouterMatches,
  teamMatches,
  type EntrySearch,
} from '../core/entrySearch.js';
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
const FORM_COLUMNS =
  'id, season_id, kind, name, active_version_id, timer_config, created_at, updated_at';
const FORM_VERSION_COLUMNS =
  'id, form_id, version_no, published_at, is_locked, updated_by, created_at, updated_at';
const SCORING_RULE_COLUMNS =
  'id, form_id, field_key, points, option_points, created_at, updated_at';
const FORM_EXPORT_COLUMNS = 'id, form_id, label, definition, created_by, created_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The columns of sync_conflicts (SPEC-FINAL 3.6), `resolution` included (task 1.41). */
const CONFLICT_COLUMNS =
  'id, event_id, entity, row_id, kind, superseded_payload, superseded_author_id, ' +
  'superseded_client_updated_at, base_version, duplicate_row_id, created_at, updated_at, ' +
  'resolved_at, resolved_by, resolution';
/** An ISO instant as PostgREST returns one: what a conflict keyset may carry, and nothing else. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

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
/** A bound on one read of the saved exports; they are deleted after 24 hours. */
const FORM_EXPORTS_READ_LIMIT = 200;
/**
 * One page of a read that walks many entry rows (task 1.50): Supabase answers at most 1000
 * rows a request (its max-rows setting), so a longer read pages with `range`, ordered by id.
 */
const ENTRY_READ_PAGE = 1000;
/**
 * A bound on one statistics read (task 1.57, `entriesForScope`): an FRC event is well under
 * 1000 entries; past this the read stops rather than walk an unbounded table (as 1.50's
 * EVENT_ENTRIES_MAX).
 */
export const ENTRIES_FOR_SCOPE_MAX = 20_000;

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

  /**
   * Task 1.50: the entry search as a PostgREST `or` filter over typed columns —
   * `team_id.in.(…),match_id.in.(…),scouter_id.in.(…)` — or null when the query names nothing.
   * The candidates are the ids the event's LIVE entries carry (three typed columns, paged), so
   * every list is bounded by the event, not by the registry; their teams, matches and users are
   * then read and matched by `core/entrySearch.ts`. Every id interpolated is a uuid.
   */
  async function entrySearchFilter(eventId: string, q: EntrySearch): Promise<string | null> {
    const teamIds = new Set<string>();
    const matchIds = new Set<string>();
    const scouterIds = new Set<string>();
    for (let from = 0; ; from += ENTRY_READ_PAGE) {
      const { data, error } = await db
        .from('scouting_entries')
        .select('team_id, match_id, scouter_id')
        .eq('event_id', eventId)
        .is('deleted_at', null)
        .order('id')
        .range(from, from + ENTRY_READ_PAGE - 1);
      if (error) throw dbError(error);
      for (const row of data ?? []) {
        teamIds.add(row.team_id);
        if (row.match_id) matchIds.add(row.match_id);
        scouterIds.add(row.scouter_id);
      }
      if ((data ?? []).length < ENTRY_READ_PAGE) break;
    }
    const hitTeams: string[] = [];
    for (const chunk of chunks([...teamIds].filter((id) => UUID.test(id)))) {
      const { data, error } = await db.from('teams').select('id, number, name').in('id', chunk);
      if (error) throw dbError(error);
      for (const t of data ?? []) if (teamMatches(t, q)) hitTeams.push(t.id);
    }
    const hitMatches: string[] = [];
    for (const chunk of chunks([...matchIds].filter((id) => UUID.test(id)))) {
      const { data, error } = await db
        .from('matches')
        .select('id, match_type, number')
        .in('id', chunk);
      if (error) throw dbError(error);
      for (const m of data ?? []) if (matchMatches(m, q)) hitMatches.push(m.id);
    }
    const hitScouters: string[] = [];
    for (const chunk of chunks([...scouterIds].filter((id) => UUID.test(id)))) {
      const { data, error } = await db.from('users').select('id, full_name').in('id', chunk);
      if (error) throw dbError(error);
      for (const u of data ?? []) if (scouterMatches(u.full_name, q)) hitScouters.push(u.id);
    }
    const parts = [
      hitTeams.length > 0 ? `team_id.in.(${hitTeams.join(',')})` : null,
      hitMatches.length > 0 ? `match_id.in.(${hitMatches.join(',')})` : null,
      hitScouters.length > 0 ? `scouter_id.in.(${hitScouters.join(',')})` : null,
    ].filter((p): p is string => p !== null);
    return parts.length > 0 ? parts.join(',') : null;
  }

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
      // dbError keeps the code: a foreign-key failure ('23503') is syncPush's parent-deleted.
      if (error) throw dbError(error);
    },
    // Up to four reads, together; the order of the answer is the order of the checks. An
    // event delete cascades to its matches, so a gone event is reported as the event.
    async missingParent(parents) {
      const versionId = parents.form_version_id;
      // A non-uuid id names no row, and Postgres would refuse the filter (22P02).
      if (!UUID.test(parents.event_id)) return 'event';
      if (parents.match_id !== null && !UUID.test(parents.match_id)) return 'match';
      if (!UUID.test(parents.team_id)) return 'team';
      if (versionId !== undefined && !UUID.test(versionId)) return 'form_version';
      const skipped = Promise.resolve({ data: { id: null }, error: null });
      const [event, match, team, version] = await Promise.all([
        db.from('events').select('id').eq('id', parents.event_id).maybeSingle(),
        parents.match_id === null
          ? skipped
          : db.from('matches').select('id').eq('id', parents.match_id).maybeSingle(),
        db.from('teams').select('id').eq('id', parents.team_id).maybeSingle(),
        // Task 1.40: a deleted form version is parent-deleted, never `invalid` for want of
        // fields to validate against (SPEC-FINAL 9.5).
        versionId === undefined
          ? skipped
          : db.from('form_versions').select('id').eq('id', versionId).maybeSingle(),
      ]);
      for (const result of [event, match, team, version]) {
        if (result.error) throw dbError(result.error);
      }
      if (event.data === null) return 'event';
      if (match.data === null) return 'match';
      if (team.data === null) return 'team';
      if (version.data === null) return 'form_version';
      return null;
    },
    // Task 1.40 (SPEC-FINAL 9.5): the duplicate lookup, on the logical-key index
    // (scouting_entries_logical_key_idx, `where deleted_at is null`). Null-safe on match_id.
    async findByLogicalKey(key, excludeId) {
      // A non-uuid id names no row, and Postgres would refuse the filter (22P02).
      const ids = [key.event_id, key.team_id, excludeId, ...(key.match_id ? [key.match_id] : [])];
      if (!ids.every((id) => UUID.test(id))) return null;
      let query = db
        .from('scouting_entries')
        .select('*')
        .eq('event_id', key.event_id)
        .eq('form_kind', key.form_kind)
        .eq('team_id', key.team_id)
        .is('deleted_at', null)
        .neq('id', excludeId);
      query =
        key.match_id === null ? query.is('match_id', null) : query.eq('match_id', key.match_id);
      const { data, error } = await query
        .order('client_updated_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(1);
      if (error) throw dbError(error);
      return ((data ?? [])[0] as StoredRow | undefined) ?? null;
    },
    async insertConflict(row: NewConflict): Promise<void> {
      // `row` is the column set of sync_conflicts minus its defaults; the generated insert
      // type wants Json for superseded_payload, which Record<string, unknown> is not.
      // A retried operation carries the same id (conflictIdFor): keep the first row.
      const { error } = await db
        .from('sync_conflicts')
        .upsert(row as never, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw dbError(error);
    },
    // Task 1.41 (SPEC-FINAL 9.5): the review queue's reads and the resolve command's guard.
    async listOpenConflicts(eventId, entity, limit, after) {
      // The keyset is interpolated into a PostgREST filter string, so both values are
      // checked here as well as in the use case's cursor schema. The instant is the
      // database's own string, quoted, so microseconds survive and nothing repeats.
      if (after && (!TIMESTAMP.test(after.created_at) || !UUID.test(after.id))) {
        throw new Error('listOpenConflicts: a keyset must be a timestamp and a uuid');
      }
      if (!UUID.test(eventId)) return [];
      let query = db
        .from('sync_conflicts')
        .select(CONFLICT_COLUMNS)
        .eq('event_id', eventId)
        .eq('entity', entity)
        .is('resolved_at', null);
      if (after) {
        query = query.or(
          `created_at.gt."${after.created_at}",and(created_at.eq."${after.created_at}",id.gt.${after.id})`,
        );
      }
      const { data, error } = await query
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit);
      if (error) throw dbError(error);
      return (data ?? []) as unknown as StoredConflict[];
    },
    async listSettledConflicts(eventId, entity, since, limit) {
      if (!UUID.test(eventId)) return [];
      const { data, error } = await db
        .from('sync_conflicts')
        .select(CONFLICT_COLUMNS)
        .eq('event_id', eventId)
        .eq('entity', entity)
        .gte('resolved_at', since)
        .order('resolved_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(limit);
      if (error) throw dbError(error);
      return (data ?? []) as unknown as StoredConflict[];
    },
    async getConflict(id) {
      // A non-uuid id names no row, and Postgres would refuse the filter (22P02).
      if (!UUID.test(id)) return null;
      const { data, error } = await db
        .from('sync_conflicts')
        .select(CONFLICT_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw dbError(error);
      return (data as unknown as StoredConflict | null) ?? null;
    },
    // ONE conditional update: two leads resolving the same conflict at once cannot both
    // take it. The row comes back only when the update matched.
    async resolveConflictRow(id, resolved) {
      if (!UUID.test(id)) return false;
      const { data, error } = await db
        .from('sync_conflicts')
        .update(resolved as never)
        .eq('id', id)
        .is('resolved_at', null)
        .select('id');
      if (error) throw dbError(error);
      return (data ?? []).length > 0;
    },
    async reopenConflictRow(id, resolvedAt) {
      const { error } = await db
        .from('sync_conflicts')
        .update({ resolved_at: null, resolved_by: null, resolution: null } as never)
        .eq('id', id)
        .eq('resolved_at', resolvedAt);
      if (error) throw dbError(error);
    },
    async getEntriesByIds(ids) {
      const wanted = ids.filter((id) => UUID.test(id));
      const out: StoredRow[] = [];
      for (const chunk of chunks(wanted)) {
        const { data, error } = await db.from('scouting_entries').select('*').in('id', chunk);
        if (error) throw dbError(error);
        out.push(...((data ?? []) as StoredRow[]));
      }
      return out;
    },
    async getTeamsByIds(ids) {
      const wanted = ids.filter((id) => UUID.test(id));
      const out: StoredTeam[] = [];
      for (const chunk of chunks(wanted)) {
        const { data, error } = await db.from('teams').select(TEAM_COLUMNS).in('id', chunk);
        if (error) throw dbError(error);
        out.push(...((data ?? []) as StoredTeam[]));
      }
      return out;
    },
    async getMatchesByIds(ids) {
      const wanted = ids.filter((id) => UUID.test(id));
      const out: StoredMatch[] = [];
      for (const chunk of chunks(wanted)) {
        const { data, error } = await db.from('matches').select(MATCH_COLUMNS).in('id', chunk);
        if (error) throw dbError(error);
        out.push(...((data ?? []) as StoredMatch[]));
      }
      return out;
    },
    async getFormFields(formVersionId: string): Promise<FormFieldDefinition[]> {
      // Ordered (task 1.27): the builder and an export read the fields in display order.
      const { data, error } = await db
        .from('form_fields')
        .select('*')
        .eq('form_version_id', formVersionId)
        .order('display_order', { ascending: true })
        .order('key', { ascending: true });
      // Swallowed, an entry would be validated against no fields at all.
      if (error) throw dbError(error);
      return (data ?? []) as unknown as FormFieldDefinition[];
    },
    // Task 1.27: forms, versions, fields, scoring rules and saved exports. Every method
    // THROWS on a database error, keeping Postgres's code (dbError).
    async getForm(id: string): Promise<StoredForm | null> {
      const { data, error } = await db
        .from('forms')
        .select(FORM_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw dbError(error);
      return (data as StoredForm | null) ?? null;
    },
    async getFormByKind(seasonId: string, kind: 'match' | 'super'): Promise<StoredForm | null> {
      const { data, error } = await db
        .from('forms')
        .select(FORM_COLUMNS)
        .eq('season_id', seasonId)
        .eq('kind', kind)
        .maybeSingle();
      if (error) throw dbError(error);
      return (data as StoredForm | null) ?? null;
    },
    async insertForm(row: Record<string, unknown>): Promise<StoredForm> {
      const { data, error } = await db
        .from('forms')
        .insert(row as never)
        .select(FORM_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredForm;
    },
    async updateForm(id: string, patch: Record<string, unknown>): Promise<StoredForm> {
      // updated_at is set by the table's set_updated_at trigger.
      const { data, error } = await db
        .from('forms')
        .update(patch as never)
        .eq('id', id)
        .select(FORM_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredForm;
    },
    async getFormVersion(id: string): Promise<StoredFormVersion | null> {
      const { data, error } = await db
        .from('form_versions')
        .select(FORM_VERSION_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw dbError(error);
      return (data as StoredFormVersion | null) ?? null;
    },
    async listFormVersions(formId: string): Promise<StoredFormVersion[]> {
      const { data, error } = await db
        .from('form_versions')
        .select(FORM_VERSION_COLUMNS)
        .eq('form_id', formId)
        .order('version_no', { ascending: true });
      if (error) throw dbError(error);
      return (data ?? []) as StoredFormVersion[];
    },
    async insertFormVersion(row: Record<string, unknown>): Promise<StoredFormVersion> {
      const { data, error } = await db
        .from('form_versions')
        .insert(row as never)
        .select(FORM_VERSION_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredFormVersion;
    },
    async updateFormVersion(
      id: string,
      patch: Record<string, unknown>,
    ): Promise<StoredFormVersion> {
      // updated_at is set by the table's set_updated_at trigger.
      const { data, error } = await db
        .from('form_versions')
        .update(patch as never)
        .eq('id', id)
        .select(FORM_VERSION_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredFormVersion;
    },
    // Soft-deleted entries count: they are bound to the version all the same.
    async countEntriesByFormVersion(formVersionId: string): Promise<number> {
      const { count, error } = await db
        .from('scouting_entries')
        .select('id', { count: 'exact', head: true })
        .eq('form_version_id', formVersionId);
      if (error) throw dbError(error);
      return count ?? 0;
    },
    // Ids survive a save: deletes first, then ONE upsert on (form_version_id, key), so a
    // key already saved is updated in place (keeping its id) and a new one is inserted.
    // Not one transaction; re-sending the same save completes a half-done one.
    async writeFormFields(
      formVersionId: string,
      rows: Record<string, unknown>[],
      deleteKeys: string[],
    ): Promise<void> {
      for (const chunk of chunks(deleteKeys)) {
        const res = await db
          .from('form_fields')
          .delete()
          .eq('form_version_id', formVersionId)
          .in('key', chunk);
        if (res.error) throw dbError(res.error);
      }
      if (rows.length === 0) return;
      const res = await db
        .from('form_fields')
        .upsert(rows.map((row) => ({ ...row, form_version_id: formVersionId })) as never, {
          onConflict: 'form_version_id,key',
        });
      if (res.error) throw dbError(res.error);
    },
    async getScoringRules(formId: string): Promise<StoredScoringRule[]> {
      const { data, error } = await db
        .from('scoring_rules')
        .select(SCORING_RULE_COLUMNS)
        .eq('form_id', formId)
        .order('field_key', { ascending: true });
      if (error) throw dbError(error);
      return ((data ?? []) as StoredScoringRule[]).map((r) => ({ ...r, points: Number(r.points) }));
    },
    // Upserted on (form_id, field_key), so a rule keeps its id; the form's rules for any
    // other key are deleted first. Not one transaction.
    async replaceScoringRules(formId: string, rules: Record<string, unknown>[]): Promise<void> {
      const keep = rules.map((r) => String(r.field_key));
      let remove = db.from('scoring_rules').delete().eq('form_id', formId);
      if (keep.length > 0) {
        // Field keys are [a-z0-9_] (validateFieldDefinition), safe inside a PostgREST list.
        remove = remove.not('field_key', 'in', `(${keep.map((k) => `"${k}"`).join(',')})`);
      }
      const removed = await remove;
      if (removed.error) throw dbError(removed.error);
      if (rules.length === 0) return;
      const res = await db
        .from('scoring_rules')
        .upsert(rules.map((r) => ({ ...r, form_id: formId })) as never, {
          onConflict: 'form_id,field_key',
        });
      if (res.error) throw dbError(res.error);
    },
    async insertFormExport(row: Record<string, unknown>): Promise<StoredFormExport> {
      const { data, error } = await db
        .from('form_exports')
        .insert(row as never)
        .select(FORM_EXPORT_COLUMNS)
        .single();
      if (error) throw dbError(error);
      return data as StoredFormExport;
    },
    async purgeFormExports(olderThan: Date): Promise<number> {
      const { count, error } = await db
        .from('form_exports')
        .delete({ count: 'exact' })
        .lt('created_at', olderThan.toISOString());
      if (error) throw dbError(error);
      return count ?? 0;
    },
    // Task 1.28: the Exports picker. Bounded: exports live 24 hours, so 200 is far beyond use.
    async listFormExports(): Promise<StoredFormExport[]> {
      const { data, error } = await db
        .from('form_exports')
        .select(FORM_EXPORT_COLUMNS)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(FORM_EXPORTS_READ_LIMIT);
      if (error) throw dbError(error);
      return (data ?? []) as StoredFormExport[];
    },
    async getFormExport(id: string): Promise<StoredFormExport | null> {
      const { data, error } = await db
        .from('form_exports')
        .select(FORM_EXPORT_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw dbError(error);
      return (data as StoredFormExport | null) ?? null;
    },
    // Task 1.28: one head count per version, in parallel — no rows read, no 1000-row cap, and
    // a form has a handful of versions. Live entries only: the forms list's "entries".
    async countLiveEntriesByFormVersions(versionIds: string[]): Promise<Map<string, number>> {
      const counted = await Promise.all(
        versionIds.map(async (id) => {
          const { count, error } = await db
            .from('scouting_entries')
            .select('id', { count: 'exact', head: true })
            .eq('form_version_id', id)
            .is('deleted_at', null);
          if (error) throw dbError(error);
          return [id, count ?? 0] as const;
        }),
      );
      return new Map(counted);
    },
    // Task 1.28: names for "last edited · who", one read per IN_CHUNK ids.
    async listUserNames(ids: string[]): Promise<{ id: string; full_name: string }[]> {
      const out: { id: string; full_name: string }[] = [];
      for (const chunk of chunks(ids)) {
        const { data, error } = await db.from('users').select('id, full_name').in('id', chunk);
        if (error) throw dbError(error);
        out.push(...((data ?? []) as { id: string; full_name: string }[]));
      }
      return out;
    },
    // ONE statement (decision G): form_versions, form_fields, scoring_rules and, through
    // form_versions, scouting_entries are all ON DELETE CASCADE; form_exports.form_id is
    // ON DELETE SET NULL. Nothing references scouting_entries, so nothing can refuse it.
    async deleteFormCascade(id: string): Promise<void> {
      const { error } = await db.from('forms').delete().eq('id', id);
      if (error) throw dbError(error);
    },
    // Its fields and entries cascade; the use case refuses a version with entries first.
    async deleteFormVersion(id: string): Promise<void> {
      const { error } = await db.from('form_versions').delete().eq('id', id);
      if (error) throw dbError(error);
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
    // UF.1. Paged by deleted_at: PostgREST caps a read at max_rows = 1000
    // (packages/db/supabase/config.toml), and a truncated list would leave matches behind.
    async listMatchDeletions(eventId: string, since: string) {
      const PAGE = 1000;
      const out: { match_id: string; deleted_at: string }[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from('match_deletions')
          .select('match_id, deleted_at')
          .eq('event_id', eventId)
          .gt('deleted_at', since)
          .order('deleted_at', { ascending: true })
          .order('match_id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw dbError(error);
        out.push(...(data ?? []));
        if ((data ?? []).length < PAGE) break;
      }
      return out;
    },
    // Task 1.40, paged like listMatchDeletions. A tombstone whose season_id is null (a row
    // that went by cascade) never matches the season filter.
    async listFormDeletions(seasonId: string, since: string): Promise<FormDeletion[]> {
      const PAGE = 1000;
      const out: FormDeletion[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from('form_deletions')
          .select('entity, row_id, deleted_at')
          .eq('season_id', seasonId)
          .gt('deleted_at', since)
          .order('deleted_at', { ascending: true })
          .order('entity', { ascending: true })
          .order('row_id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw dbError(error);
        out.push(...((data ?? []) as FormDeletion[]));
        if ((data ?? []).length < PAGE) break;
      }
      return out;
    },
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
    // RB.13: live entries per scouter across the season, for the Users page. Two reads, no
    // join, like countEntriesBySeason. PostgREST caps a read at max_rows = 1000
    // (packages/db/supabase/config.toml), so the entries are paged, ordered by id.
    async countEntriesByScouterForSeason(seasonId: string) {
      const { data: events, error } = await db
        .from('events')
        .select('id')
        .eq('season_id', seasonId);
      if (error) throw dbError(error);
      const eventIds = (events ?? []).map((e) => e.id);
      if (eventIds.length === 0) return [];
      const PAGE = 1000;
      const counts = new Map<string, number>();
      // The event ids go out in chunks, like every other `in` filter here.
      for (const chunk of chunks(eventIds)) {
        for (let from = 0; ; from += PAGE) {
          const { data, error: readError } = await db
            .from('scouting_entries')
            .select('scouter_id')
            .in('event_id', chunk)
            .is('deleted_at', null)
            .order('id')
            .range(from, from + PAGE - 1);
          if (readError) throw dbError(readError);
          for (const r of data ?? []) counts.set(r.scouter_id, (counts.get(r.scouter_id) ?? 0) + 1);
          if ((data ?? []).length < PAGE) break;
        }
      }
      return [...counts].map(([scouter_id, count]) => ({ scouter_id, count }));
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
          .in('match_id', chunk)
          .is('deleted_at', null);
        if (error) throw dbError(error);
        slots.push(...((data ?? []) as StoredMatchSlot[]));
      }
      return slots;
    },
    // Writes only the difference, so an unchanged slot keeps its row and its updated_at.
    // Task 1.40 (spec 7.5 item 1): a cleared slot is TOMBSTONED, not deleted, so the delta
    // pull carries the removal; a changed team is updated in place; a refilled tombstone is
    // revived in place (the unique (match, alliance, station) allows one row per slot, live
    // or not); a slot never filled is inserted. Every row of the match is read, tombstones
    // included. Not one transaction.
    async setMatchTeams(matchId: string, slots: MatchSlot[], at: string): Promise<void> {
      const { data, error } = await db
        .from('match_teams')
        .select('id, alliance, station, team_id, deleted_at')
        .eq('match_id', matchId);
      if (error) throw dbError(error);
      const key = (s: { alliance: string; station: number }) => `${s.alliance}:${s.station}`;
      const current = new Map((data ?? []).map((row) => [key(row), row]));
      const wanted = new Map(slots.map((slot) => [key(slot), slot]));

      const cleared = [...current]
        .filter(([k, row]) => row.deleted_at === null && !wanted.has(k))
        .map(([, row]) => row.id);
      if (cleared.length > 0) {
        const res = await db.from('match_teams').update({ deleted_at: at }).in('id', cleared);
        if (res.error) throw dbError(res.error);
      }
      const insert: Record<string, unknown>[] = [];
      for (const [k, slot] of wanted) {
        const row = current.get(k);
        if (row && row.deleted_at === null && row.team_id === slot.team_id) continue;
        if (row) {
          const res = await db
            .from('match_teams')
            .update(
              row.deleted_at === null
                ? { team_id: slot.team_id }
                : { team_id: slot.team_id, deleted_at: null },
            )
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
    // A hard delete. The match's match_teams cascade (tombstones too: the match_deletions
    // tombstone covers them); an entry refuses it with 23503.
    async deleteMatch(id: string): Promise<void> {
      const { error } = await db.from('matches').delete().eq('id', id);
      if (error) throw dbError(error);
    },
    // RB.20: the hard cascade deletes (SPEC-FINAL 3.9). One SQL function each (migration
    // 20261007120000_delete_cascade.sql): the entries go first, then the parent, all or nothing.
    async deleteSeason(id: string): Promise<void> {
      const { error } = await db.rpc('delete_season_cascade', { p_season_id: id });
      if (error) throw dbError(error);
    },
    async deleteEvent(id: string): Promise<void> {
      const { error } = await db.rpc('delete_event_cascade', { p_event_id: id });
      if (error) throw dbError(error);
    },
    // Head counts only, no rows read. Live entries: a soft-deleted one is already gone to
    // the admin. The event ids go out in chunks, like every `in` filter here.
    async countDeleteImpact(kind: 'season' | 'event', id: string) {
      let eventIds = [id];
      let forms = 0;
      if (kind === 'season') {
        const { data, error } = await db.from('events').select('id').eq('season_id', id);
        if (error) throw dbError(error);
        eventIds = (data ?? []).map((e) => e.id);
        const counted = await db
          .from('forms')
          .select('id', { count: 'exact', head: true })
          .eq('season_id', id);
        if (counted.error) throw dbError(counted.error);
        forms = counted.count ?? 0;
      }
      let matches = 0;
      let entries = 0;
      for (const chunk of chunks(eventIds)) {
        const m = await db
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .in('event_id', chunk);
        if (m.error) throw dbError(m.error);
        const e = await db
          .from('scouting_entries')
          .select('id', { count: 'exact', head: true })
          .in('event_id', chunk)
          .is('deleted_at', null);
        if (e.error) throw dbError(e.error);
        matches += m.count ?? 0;
        entries += e.count ?? 0;
      }
      return { events: eventIds.length, matches, entries, forms };
    },
    // Task 1.60: the match with its entries, one SQL function (migration
    // 20261028090000_delete_match_cascade.sql): entries (soft-deleted too), then the match.
    async deleteMatchCascade(id: string): Promise<number> {
      const { data, error } = await db.rpc('delete_match_cascade', { p_match_id: id });
      if (error) throw dbError(error);
      return typeof data === 'number' ? data : 0;
    },
    // Task 1.60: head counts only, no rows read. Every row counts (soft-deleted ones still
    // hold the keys and go with the delete); two more counts split them. Batched like every
    // `in` filter here.
    async tallyEntries(scope: EntryScope): Promise<EntryTally> {
      const [column, ids] =
        'eventIds' in scope
          ? (['event_id', scope.eventIds] as const)
          : (['form_version_id', scope.formVersionIds] as const);
      const tally: EntryTally = { entries: 0, deleted_entries: 0, super_entries: 0 };
      for (const chunk of chunks(ids)) {
        const all = await db
          .from('scouting_entries')
          .select('id', { count: 'exact', head: true })
          .in(column, chunk);
        if (all.error) throw dbError(all.error);
        const deleted = await db
          .from('scouting_entries')
          .select('id', { count: 'exact', head: true })
          .in(column, chunk)
          .not('deleted_at', 'is', null);
        if (deleted.error) throw dbError(deleted.error);
        const superRows = await db
          .from('scouting_entries')
          .select('id', { count: 'exact', head: true })
          .in(column, chunk)
          .eq('form_kind', 'super');
        if (superRows.error) throw dbError(superRows.error);
        tally.entries += all.count ?? 0;
        tally.deleted_entries += deleted.count ?? 0;
        tally.super_entries += superRows.count ?? 0;
      }
      return tally;
    },
    async countMatchesOfEvents(eventIds: string[]): Promise<number> {
      let total = 0;
      for (const chunk of chunks(eventIds)) {
        const { count, error } = await db
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .in('event_id', chunk);
        if (error) throw dbError(error);
        total += count ?? 0;
      }
      return total;
    },
    async countAnalysisRows(
      scope: { seasonId: string } | { formId: string },
    ): Promise<AnalysisCounts> {
      if ('formId' in scope) {
        const { count, error } = await db
          .from('metrics')
          .select('id', { count: 'exact', head: true })
          .eq('form_id', scope.formId);
        if (error) throw dbError(error);
        return { metrics: count ?? 0, dashboards: 0, weight_presets: 0 };
      }
      const out: AnalysisCounts = { metrics: 0, dashboards: 0, weight_presets: 0 };
      for (const table of ['metrics', 'dashboards', 'weight_presets'] as const) {
        const { count, error } = await db
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq('season_id', scope.seasonId);
        if (error) throw dbError(error);
        out[table] = count ?? 0;
      }
      return out;
    },
    // A match holds a handful of entries (six stations, plus the odd duplicate), far under
    // PostgREST's 1000-row cap.
    async listMatchEntries(matchId: string): Promise<MatchEntryRef[]> {
      const { data, error } = await db
        .from('scouting_entries')
        .select('team_id, form_kind, client_updated_at, deleted_at')
        .eq('match_id', matchId);
      if (error) throw dbError(error);
      return (data ?? []) as MatchEntryRef[];
    },
    // Task 1.50: the browse and search reads. SQL fetches rows over typed columns; the shared
    // engine scores them in the use case. Nothing here reads into the JSONB.
    async getEntry(id: string): Promise<StoredRow | null> {
      // A non-uuid id names no row, and Postgres would refuse the filter (22P02).
      if (!UUID.test(id)) return null;
      const { data, error } = await db
        .from('scouting_entries')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw dbError(error);
      return (data as StoredRow | null) ?? null;
    },
    async queryEntries(options: Parameters<Store['queryEntries']>[0]): Promise<StoredRow[]> {
      const { eventId, formKind, teamId, limit, after } = options;
      // The keyset is interpolated into a filter string, so both values are checked here as
      // well as in the use case's cursor schema (as listOpenConflicts).
      if (after && (!TIMESTAMP.test(after.client_created_at) || !UUID.test(after.id))) {
        throw new Error('queryEntries: a keyset must be a timestamp and a uuid');
      }
      if (!UUID.test(eventId) || (teamId !== undefined && !UUID.test(teamId))) return [];
      const search = entrySearch(options.query);
      const searchFilter = search ? await entrySearchFilter(eventId, search) : null;
      if (search && searchFilter === null) return [];
      const keyset = after ? entryKeysetFilter(after) : null;

      let query = db
        .from('scouting_entries')
        .select('*')
        .eq('event_id', eventId)
        .is('deleted_at', null);
      if (formKind) query = query.eq('form_kind', formKind);
      if (teamId !== undefined) query = query.eq('team_id', teamId);
      // ONE `or` parameter: both conditions must hold, so the two nest under an `and`.
      if (searchFilter && keyset) query = query.or(`and(or(${searchFilter}),or(${keyset}))`);
      else if (searchFilter ?? keyset) query = query.or((searchFilter ?? keyset) as string);
      const { data, error } = await query
        .order('client_created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);
      if (error) throw dbError(error);
      return (data ?? []) as StoredRow[];
    },
    async listTeamEvents(teamIds: string[], eventIds: string[]): Promise<TeamEventEntries[]> {
      const teams = [...new Set(teamIds)].filter((id) => UUID.test(id));
      const events = [...new Set(eventIds)].filter((id) => UUID.test(id));
      const groups = new Map<string, TeamEventEntries>();
      for (const teamChunk of chunks(teams)) {
        for (const eventChunk of chunks(events)) {
          for (let from = 0; ; from += ENTRY_READ_PAGE) {
            const { data, error } = await db
              .from('scouting_entries')
              .select('team_id, event_id, client_created_at')
              .in('team_id', teamChunk)
              .in('event_id', eventChunk)
              .is('deleted_at', null)
              .order('id')
              .range(from, from + ENTRY_READ_PAGE - 1);
            if (error) throw dbError(error);
            for (const row of data ?? []) addTeamEventEntry(groups, row);
            if ((data ?? []).length < ENTRY_READ_PAGE) break;
          }
        }
      }
      return [...groups.values()];
    },
    // Task 1.57: the statistics read. Every LIVE entry of the events (optionally one team's),
    // paged by id, at most ENTRIES_FOR_SCOPE_MAX rows; the engine computes everything else.
    async entriesForScope(scope: { eventIds: string[]; teamId?: string }): Promise<StoredRow[]> {
      const events = [...new Set(scope.eventIds)].filter((id) => UUID.test(id));
      if (events.length === 0) return [];
      if (scope.teamId !== undefined && !UUID.test(scope.teamId)) return [];
      const out: StoredRow[] = [];
      for (const chunk of chunks(events)) {
        for (let from = 0; out.length < ENTRIES_FOR_SCOPE_MAX; from += ENTRY_READ_PAGE) {
          let query = db
            .from('scouting_entries')
            .select('*')
            .in('event_id', chunk)
            .is('deleted_at', null);
          if (scope.teamId !== undefined) query = query.eq('team_id', scope.teamId);
          const { data, error } = await query.order('id').range(from, from + ENTRY_READ_PAGE - 1);
          if (error) throw dbError(error);
          out.push(...((data ?? []) as StoredRow[]));
          if ((data ?? []).length < ENTRY_READ_PAGE) break;
        }
      }
      return out.slice(0, ENTRIES_FOR_SCOPE_MAX);
    },
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

/**
 * The queryEntries keyset as a PostgREST `or` filter (newest first): rows strictly before the
 * last row of the previous page. The instant is quoted, as listOpenConflicts' is, so a `+00:00`
 * offset and microseconds survive.
 */
export function entryKeysetFilter(after: EntryKeyset): string {
  const c = after.client_created_at;
  return `client_created_at.lt."${c}",and(client_created_at.eq."${c}",id.lt.${after.id})`;
}

/**
 * Folds one live entry into its (team, event) group (task 1.50, both stores): one more entry,
 * and the newest `client_created_at`, compared as an instant and kept as the database wrote it.
 */
export function addTeamEventEntry(
  groups: Map<string, TeamEventEntries>,
  row: { team_id: string; event_id: string; client_created_at: string },
): void {
  const key = `${row.team_id}|${row.event_id}`;
  const group = groups.get(key);
  if (!group) {
    groups.set(key, {
      team_id: row.team_id,
      event_id: row.event_id,
      entry_count: 1,
      last_entry_at: row.client_created_at,
    });
    return;
  }
  group.entry_count += 1;
  if (Date.parse(row.client_created_at) > Date.parse(group.last_entry_at)) {
    group.last_entry_at = row.client_created_at;
  }
}
