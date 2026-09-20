import type { PullScope } from '../core/context.js';
import type { Db } from '../db/client.js';

type ScopeKind = 'event' | 'season' | 'season-teams' | 'global' | 'settings';

/** SPEC-FINAL 9.2: the local store is scoped to the active competition only. */
export const PULL_SCOPES: Record<string, { table: string; kind: ScopeKind; column?: string }> = {
  app_settings: { table: 'app_settings', kind: 'settings' },
  seasons: { table: 'seasons', kind: 'season', column: 'id' },
  events: { table: 'events', kind: 'event', column: 'id' },
  // SPEC-FINAL 9.2: every team in the SEASON — the global rows for every team that
  // appears on any of the season's rosters or entries, not the whole registry.
  teams: { table: 'teams', kind: 'season-teams' },
  event_teams: { table: 'event_teams', kind: 'event', column: 'event_id' },
  matches: { table: 'matches', kind: 'event', column: 'event_id' },
  match_teams: { table: 'match_teams', kind: 'event', column: 'match_id' },
  forms: { table: 'forms', kind: 'season', column: 'season_id' },
  form_versions: { table: 'form_versions', kind: 'season', column: 'form_id' },
  form_fields: { table: 'form_fields', kind: 'season', column: 'form_version_id' },
  scoring_rules: { table: 'scoring_rules', kind: 'season', column: 'form_id' },
  users: { table: 'users', kind: 'global' },
  scouting_entries: { table: 'scouting_entries', kind: 'event', column: 'event_id' },
  sync_conflicts: { table: 'sync_conflicts', kind: 'event', column: 'event_id' },
  pick_lists: { table: 'pick_lists', kind: 'event', column: 'event_id' },
  pick_list_entries: { table: 'pick_list_entries', kind: 'event', column: 'pick_list_id' },
  do_not_pick: { table: 'do_not_pick', kind: 'event', column: 'event_id' },
  alliances: { table: 'alliances', kind: 'event', column: 'event_id' },
  alliance_slots: { table: 'alliance_slots', kind: 'event', column: 'alliance_id' },
  alliance_declines: { table: 'alliance_declines', kind: 'event', column: 'alliance_id' },
  metrics: { table: 'metrics', kind: 'season', column: 'season_id' },
  dashboards: { table: 'dashboards', kind: 'season', column: 'season_id' },
  dashboard_charts: { table: 'dashboard_charts', kind: 'season', column: 'dashboard_id' },
  weight_presets: { table: 'weight_presets', kind: 'season', column: 'season_id' },
};

/**
 * Child tables are scoped through their parent's id list. The lists are small
 * (one event's matches, one season's forms, eight alliances), so an `in` filter is
 * the boring correct choice and stays inside the free-tier budget.
 */
async function parentIds(db: Db, key: string, scope: PullScope): Promise<string[] | null> {
  switch (key) {
    case 'match_teams': {
      const { data } = await db.from('matches').select('id').eq('event_id', scope.eventId);
      return (data ?? []).map((r) => r.id);
    }
    case 'form_versions':
    case 'scoring_rules': {
      const { data } = await db.from('forms').select('id').eq('season_id', scope.seasonId);
      return (data ?? []).map((r) => r.id);
    }
    case 'form_fields': {
      const { data: forms } = await db.from('forms').select('id').eq('season_id', scope.seasonId);
      const { data } = await db
        .from('form_versions')
        .select('id')
        .in(
          'form_id',
          (forms ?? []).map((r) => r.id),
        );
      return (data ?? []).map((r) => r.id);
    }
    case 'pick_list_entries': {
      const { data } = await db.from('pick_lists').select('id').eq('event_id', scope.eventId);
      return (data ?? []).map((r) => r.id);
    }
    case 'alliance_slots':
    case 'alliance_declines': {
      const { data } = await db.from('alliances').select('id').eq('event_id', scope.eventId);
      return (data ?? []).map((r) => r.id);
    }
    case 'dashboard_charts': {
      const { data } = await db.from('dashboards').select('id').eq('season_id', scope.seasonId);
      return (data ?? []).map((r) => r.id);
    }
    case 'teams': {
      // Every team on any of the season's rosters, plus every team with an entry there.
      const { data: events } = await db.from('events').select('id').eq('season_id', scope.seasonId);
      const eventIds = (events ?? []).map((r) => r.id);
      const [roster, entries] = await Promise.all([
        db.from('event_teams').select('team_id').in('event_id', eventIds),
        db.from('scouting_entries').select('team_id').in('event_id', eventIds),
      ]);
      return [
        ...new Set([
          ...(roster.data ?? []).map((r) => r.team_id),
          ...(entries.data ?? []).map((r) => r.team_id),
        ]),
      ];
    }
    default:
      return null;
  }
}

export function supabasePullEntity(db: Db) {
  return async (
    key: string,
    scope: PullScope,
    since: string | undefined,
    offset: number,
    limit: number,
  ): Promise<Record<string, unknown>[]> => {
    const spec = PULL_SCOPES[key];
    if (!spec) return [];

    // `spec.table` is a runtime string spanning all 24 generated table types, so it
    // cannot be a literal keyof Database['public']['Tables'] the way every other
    // call site's hardcoded table name is — the same generic-vs-generated-type gap
    // documented for tasks 0.14 and 1.3. The cast is scoped to this one dynamic
    // call; every literal `.from(...)` in `parentIds` above stays fully checked.
    let query = db
      .from(spec.table as never)
      .select('*')
      .order('updated_at', { ascending: true })
      .range(offset, offset + limit - 1);
    if (since !== undefined) query = query.gt('updated_at', since);

    const ids = await parentIds(db, key, scope);
    if (ids !== null) {
      query = query.in(spec.kind === 'season-teams' ? 'id' : (spec.column ?? 'id'), ids);
    } else if (spec.kind === 'event') {
      query = query.eq(spec.column ?? 'event_id', scope.eventId);
    } else if (spec.kind === 'season') {
      query = query.eq(spec.column ?? 'season_id', scope.seasonId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`${key}: ${error.message}`);
    return (data ?? []) as Record<string, unknown>[];
  };
}
