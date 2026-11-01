import { useEffect, useState } from 'react';
import {
  buildTeamStats,
  GET_TEAM_STATS_MAX_LIMIT,
  type FormFieldDefinition,
  type EngineEntry,
  type GetTeamStatsOutput,
  type StatsScoring,
  type StatsTeam,
  type TeamStats,
} from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { RpcError, type Rpc } from '@/data/rpc';
import { formScoring, toEngineEntry } from '@/lib/derive/scoring';
import { useCapability } from '@/lib/useCapability';

/*
 * The team page's data (SPEC-FINAL 13.1, task 1.53). Statistics are viewable offline (9.6), and
 * the venue is offline, so the page is computed ON THE DEVICE from its cache by the very function
 * the server's `getTeamStats` calls — @frc/shared's `buildTeamStats` (task 1.57) — fed exactly as
 * `apps/server/src/core/queries/stats.ts` feeds it: the event's live roster, EVERY live entry of
 * the event (all teams, both kinds) joined with match type, number and event sort order, every
 * form version those entries name, the match form's ACTIVE scoring, the super form's active
 * fields and the scouters' names. Anything less would change the rank, the colour domains or the
 * cross-version guard. No formula lives here.
 *
 * Under a session override (6.3) the device does not hold the event: the page asks the server's
 * `getTeamStats`, held offline through `cross_event_view` (9.6).
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const live = (r: Row) => r.deleted_at == null;

/** What the device found for a team: its statistics, or that it does not hold the team. */
export type DeviceTeamStats = { state: 'held'; stats: TeamStats } | { state: 'unknown' };

/** A version's live fields in display order, as the server's `getFormFields` returns them. */
function versionFields(fields: Row[], versionId: string): FormFieldDefinition[] {
  return fields
    .filter((f) => f.form_version_id === versionId && live(f))
    .sort((a, b) => Number(a.display_order) - Number(b.display_order))
    .map((f) => f as unknown as FormFieldDefinition);
}

const NO_SCORING: StatsScoring = { fields: [], rules: [] };

/** The cached tables the team page is computed from, as `cachedRows` returns them. */
export type DeviceStatsRows = {
  events: Row[];
  teams: Row[];
  event_teams: Row[];
  scouting_entries: Row[];
  matches: Row[];
  forms: Row[];
  form_versions: Row[];
  form_fields: Row[];
  scoring_rules: Row[];
  users: Row[];
};

const DEVICE_STATS_TABLES = [
  'events',
  'teams',
  'event_teams',
  'scouting_entries',
  'matches',
  'forms',
  'form_versions',
  'form_fields',
  'scoring_rules',
  'users',
] as const satisfies readonly (keyof DeviceStatsRows)[];

/**
 * What every statistic computed on the device starts from (task 1.53's pattern; task 1.58's
 * ranking reads it too, so the two pages can never be fed differently): exactly what
 * `apps/server/src/core/queries/stats.ts` loads for an event — the event's live roster, EVERY live
 * entry of the event (all teams, both kinds) joined by `toEngineEntry` (match type, number, event
 * sort order), and the season's match form's ACTIVE scoring — plus the cached rows the team page
 * reads beyond that. Null when the device does not hold the event.
 */
export type DeviceEventStats = {
  event: { id: string; name: string };
  /** The event's live roster: the ranked population and the 12.6 domain population. */
  roster: StatsTeam[];
  /** Every live entry of the event, every team, both kinds (the server's `entriesForScope`). */
  entries: EngineEntry[];
  /** The match form's ACTIVE version's fields and the form's rules (5.1). */
  scoring: StatsScoring;
  /** The super form's ACTIVE version's fields (note labels). */
  superFields: readonly FormFieldDefinition[];
  /** Every form version the entries name, with its live fields in display order. */
  versions: { id: string; fields: FormFieldDefinition[] }[];
  /** Every cached team (a team page may open a team that is not on the roster). */
  teams: Row[];
  users: Row[];
};

const toTeam = (t: Row): StatsTeam => ({
  id: String(t.id),
  number: Number(t.number),
  name: String(t.name ?? ''),
});

/** Every table `deviceEventStats` reads, from this device's cache. */
export async function loadDeviceStatsRows(): Promise<DeviceStatsRows> {
  const tables = await Promise.all(DEVICE_STATS_TABLES.map((t) => cachedRows<Row>(t)));
  return Object.fromEntries(DEVICE_STATS_TABLES.map((t, i) => [t, tables[i]!])) as DeviceStatsRows;
}

/** `deviceEventStats` over this device's cache. */
export async function loadDeviceEventStats(eventId: string): Promise<DeviceEventStats | null> {
  return deviceEventStats(await loadDeviceStatsRows(), eventId);
}

/**
 * `loadDeviceEventStats` over rows already read: the cached rows as they are, a pulled row and
 * a row still in the outbox alike (Phase 1 I side task 5: `teamStats.parity.test.ts` holds the
 * team page fed from it to the server's `getTeamStats` on the same rows).
 */
export function deviceEventStats(cache: DeviceStatsRows, eventId: string): DeviceEventStats | null {
  const { events, teams, scouting_entries: entries, matches, forms, users } = cache;
  const { event_teams: roster, form_versions: versions, form_fields: fields } = cache;
  const rules = cache.scoring_rules;
  const event = events.find((e) => e.id === eventId);
  if (!event) return null;

  const teamById = new Map(teams.map((t) => [String(t.id), t]));
  const rosterTeams = roster
    .filter((r) => r.event_id === eventId && live(r))
    .flatMap((r) => {
      const t = teamById.get(String(r.team_id));
      return t && live(t) ? [toTeam(t)] : [];
    });

  // EVERY live entry of the event, every team, both kinds (the server's `entriesForScope`).
  const rows = entries.filter((e) => e.event_id === eventId && live(e));
  const matchById = new Map(matches.map((m) => [String(m.id), m]));
  const sortOrder = typeof event.sort_order === 'number' ? event.sort_order : 0;

  const seasonId = str(event.season_id);
  const scoringOf = (kind: 'match' | 'super'): StatsScoring => {
    const form = forms.find((f) => f.season_id === seasonId && f.kind === kind && live(f));
    if (!form || !str(form.active_version_id)) return NO_SCORING;
    return formScoring(String(form.id), { forms, versions, fields, rules }) ?? NO_SCORING;
  };
  const versionIds = [...new Set(rows.map((r) => String(r.form_version_id)))];
  return {
    event: { id: String(event.id), name: String(event.name ?? '') },
    roster: rosterTeams,
    entries: rows.map((r) => toEngineEntry(r, matchById, sortOrder)),
    scoring: scoringOf('match'),
    superFields: scoringOf('super').fields,
    versions: versionIds.map((id) => ({ id, fields: versionFields(fields, id) })),
    teams,
    users,
  };
}

/**
 * `teamId`'s statistics at `eventId`, from this device's cache. `unknown` when the device holds no
 * such team (a mistyped link, a team of another season), or not the event.
 */
export async function loadDeviceTeamStats(
  teamId: string,
  eventId: string,
): Promise<DeviceTeamStats> {
  return deviceTeamStats(await loadDeviceStatsRows(), teamId, eventId);
}

/**
 * `loadDeviceTeamStats` over rows already read (Phase 1 I side task 5: `teamStats.parity.test.ts`
 * holds it to the server's `getTeamStats` on the same rows). Fed by `deviceEventStats`, as the
 * ranking is (task 1.58).
 */
export function deviceTeamStats(
  cache: DeviceStatsRows,
  teamId: string,
  eventId: string,
): DeviceTeamStats {
  const base = deviceEventStats(cache, eventId);
  const team = base?.teams.find((t) => t.id === teamId);
  if (!base || !team) return { state: 'unknown' };
  const stats = buildTeamStats({
    team: toTeam(team),
    event: base.event,
    teams: base.roster,
    entries: base.entries,
    scoring: base.scoring,
    versions: base.versions,
    superFields: base.superFields,
    scouters: base.users.map((u) => ({ id: String(u.id), full_name: String(u.full_name ?? '') })),
  });
  return { state: 'held', stats };
}

/** At most this many pages of `getTeamStats` (200 match rows a page): far above one event. */
export const MAX_STATS_PAGES = 5;

/**
 * Every match row of `teamId` at `eventId` from the server's `getTeamStats` (it pages `matches`
 * only; the rest of the answer is the same on every page).
 */
export async function serverTeamStats(
  rpc: Rpc,
  teamId: string,
  eventId: string,
): Promise<TeamStats> {
  let first: GetTeamStatsOutput | null = null;
  const matches: GetTeamStatsOutput['matches'] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_STATS_PAGES; page += 1) {
    const out = (await rpc.call('getTeamStats', {
      team_id: teamId,
      scope: { mode: 'event', event_id: eventId },
      limit: GET_TEAM_STATS_MAX_LIMIT,
      ...(cursor ? { cursor } : {}),
    })) as GetTeamStatsOutput;
    first ??= out;
    matches.push(...out.matches);
    if (!out.next_cursor) break;
    cursor = out.next_cursor;
  }
  const { next_cursor: _cursor, ...rest } = first!;
  return { ...rest, matches };
}

export type ServerTeamStats =
  | { status: 'offline' }
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'failed'; retry: () => void }
  | { status: 'ok'; stats: TeamStats };

type Remote =
  | { key: string; status: 'loading' }
  | { key: string; status: 'ok'; stats: TeamStats }
  | { key: string; status: 'not-found' }
  | { key: string; status: 'failed' };

/**
 * The team page under a session override (6.3: "the client asks the server"), mirroring the
 * Entries list's `useServerEntries`: one read per team and event, held offline through
 * `cross_event_view` (9.6). `enabled` false asks nothing (no override: the device answers).
 */
export function useServerTeamStats(
  rpc: Rpc,
  teamId: string,
  eventId: string,
  enabled: boolean,
): ServerTeamStats {
  const canView = useCapability('cross_event_view');
  const [retry, setRetry] = useState(0);
  const key = `${teamId}|${eventId}|${retry}`;
  const [remote, setRemote] = useState<Remote | null>(null);
  useEffect(() => {
    if (!enabled || !canView) return;
    let on = true;
    setRemote({ key, status: 'loading' });
    serverTeamStats(rpc, teamId, eventId).then(
      (stats) => on && setRemote({ key, status: 'ok', stats }),
      (error: unknown) =>
        on &&
        setRemote({
          key,
          status: error instanceof RpcError && error.code === 'not-found' ? 'not-found' : 'failed',
        }),
    );
    return () => {
      on = false;
    };
    // rpc is an injected dependency held stable by the caller; a reconnect asks again.
  }, [key, canView, enabled]);
  if (!canView) return { status: 'offline' };
  const current = remote?.key === key ? remote : null;
  if (current?.status === 'ok') return { status: 'ok', stats: current.stats };
  if (current?.status === 'not-found') return { status: 'not-found' };
  if (current?.status === 'failed')
    return { status: 'failed', retry: () => setRetry((n) => n + 1) };
  return { status: 'loading' };
}
