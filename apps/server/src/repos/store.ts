import type { FormFieldDefinition, SyncEntity } from '@frc/shared';
import type { PullScope, Store, StoredRow, StoredUser } from '../core/context.js';
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
      const { data } = await db
        .from('users')
        .select('id, role, disabled_at')
        .eq('id', id)
        .maybeSingle();
      return (data as StoredUser | null) ?? null;
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
      'getUserByUsername',
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
