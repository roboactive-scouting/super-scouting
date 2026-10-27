import { describe, expect, it } from 'vitest';
import type {
  Caller,
  GetTeamStatsInput,
  GetTeamStatsOutput,
  StatsMetric,
  TeamStats,
} from '@frc/shared';
import { deviceTeamStats, type DeviceStatsRows } from './teamStats';

/**
 * The server's own use case (apps/server/src/core/queries/stats.ts), not a copy of how it feeds
 * the engine: the parity is with it. Loaded through Vite's glob rather than an import, because the
 * client's composite TypeScript project may not list a server file (TS6307); its signature is
 * restated here (DEVIATIONS, Phase 1 I side task 5).
 */
type ServerStats = {
  getTeamStats: (
    caller: Caller,
    input: GetTeamStatsInput,
    ctx: unknown,
  ) => Promise<GetTeamStatsOutput>;
};
const SERVER = import.meta.glob<ServerStats>('../../../../server/src/core/queries/stats.ts');
async function serverStats(): Promise<ServerStats> {
  const load = Object.values(SERVER)[0];
  if (!load) throw new Error('the server use case is not where this test looks for it');
  return load();
}

/*
 * Phase 1 I side task 5 (plan v1.33): the device and the server give the same statistics for
 * the same rows. The server reads them through its Store (`getTeamStats`, as on Vercel); the
 * device reads them from its cache (`deviceTeamStats`, as offline), where one entry is still in
 * the outbox: the row `submitEntry` writes (client stamps, no server columns), on a match the
 * device created itself (`ensureMatchLocally`'s bare row). The form grew between versions: v1
 * had no Driver skill, Cycle time, Cycle estimate or Climb time; v2 has them. The fixture holds
 * a no-show, an "unsure" timer, a field left empty and the super form's own `driver_skill` (a
 * select, a different field of the same key), as the dev event does.
 */

type Row = Record<string, unknown>;
const EVENT = 'ev-1';
const SEASON = 's-1';
const AT = '2026-03-17T08:00:00+00:00';
const lead: Caller = { kind: 'user', userId: 'u-1', role: 'lead' };

const teams = [
  { id: 't-a', number: 8009, name: 'Alpha', created_at: AT, updated_at: AT },
  { id: 't-b', number: 8014, name: 'Bravo', created_at: AT, updated_at: AT },
  { id: 't-c', number: 8020, name: 'Charlie', created_at: AT, updated_at: AT },
];
const event = {
  id: EVENT,
  season_id: SEASON,
  name: 'District #3',
  code: null,
  sort_order: 2,
  created_at: AT,
  updated_at: AT,
};
const qual = (n: number) => ({
  id: `m-${n}`,
  event_id: EVENT,
  match_type: 'qualification' as const,
  number: n,
  created_at: AT,
  updated_at: AT,
});
const MATCHES = [1, 2, 3, 4, 5, 6].map(qual);

let order = 0;
const fieldRow = (version: string, key: string, type: string, over: Row = {}): Row => ({
  id: `${version}-${key}`,
  form_version_id: version,
  key,
  label: key,
  help_text: null,
  type,
  section: null,
  display_order: (order += 1),
  required: false,
  default_value: null,
  config: {},
  visibility_condition: null,
  deprecated: false,
  description: 'x',
  unit: 'count',
  phase: 'teleop',
  direction: null,
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
  created_at: AT,
  updated_at: AT,
  ...over,
});
const climb = {
  options: [
    { value: 'none', label: 'None' },
    { value: 'low', label: 'Low' },
    { value: 'high', label: 'High' },
  ],
};
const base = (v: string) => [
  fieldRow(v, 'auto_notes', 'counter', { phase: 'auto', label: 'Auto notes' }),
  fieldRow(v, 'teleop_notes', 'counter', { label: 'Teleop notes' }),
  fieldRow(v, 'endgame_climb', 'single_select', {
    phase: 'endgame',
    config: climb,
    is_ordinal: true,
  }),
  fieldRow(v, 'notes', 'long_text', { phase: 'post_match', label: 'Notes' }),
];
const FIELDS: Row[] = [
  ...base('v1'),
  ...base('v2'),
  fieldRow('v2', 'cycle_time', 'timer', { label: 'Cycle time', unit: 'seconds' }),
  fieldRow('v2', 'cycle_estimate', 'number', { label: 'Cycle estimate' }),
  fieldRow('v2', 'climb_seconds', 'number', {
    phase: 'endgame',
    label: 'Climb time',
    visibility_condition: { field_key: 'endgame_climb', op: '=', value: 'high' },
  }),
  fieldRow('v2', 'driver_skill', 'rating', {
    phase: 'post_match',
    label: 'Driver skill',
    config: { max: 5 },
  }),
  fieldRow('vs', 'super_notes', 'long_text', { phase: 'post_match', label: 'Super notes' }),
  fieldRow('vs', 'driver_skill', 'single_select', { phase: 'post_match', config: climb }),
];
const FORMS = [
  { id: 'f-m', season_id: SEASON, kind: 'match', name: 'Match', active_version_id: 'v2' },
  { id: 'f-s', season_id: SEASON, kind: 'super', name: 'Super', active_version_id: 'vs' },
].map((f) => ({ ...f, timer_config: null, created_at: AT, updated_at: AT }));
const VERSIONS = [
  { id: 'v1', form_id: 'f-m' },
  { id: 'v2', form_id: 'f-m' },
  { id: 'vs', form_id: 'f-s' },
];
const RULES = [
  { id: 'r-1', form_id: 'f-m', field_key: 'auto_notes', points: 2, option_points: null },
  { id: 'r-2', form_id: 'f-m', field_key: 'teleop_notes', points: 1, option_points: null },
  {
    id: 'r-3',
    form_id: 'f-m',
    field_key: 'endgame_climb',
    points: 0,
    option_points: { low: 3, high: 6 },
  },
].map((r) => ({ ...r, created_at: AT, updated_at: AT }));
const USERS = [
  { id: 'u-1', full_name: 'Noa Levi' },
  { id: 'u-2', full_name: 'Omer Katz' },
];

let n = 0;
/** A stored entry, as the server holds it and a pull hands it to the device. */
const stored = (team: string, match: number | null, version: string, over: Row = {}): Row => {
  n += 1;
  const at = `2026-03-17T${String(8 + n).padStart(2, '0')}:00:00+00:00`;
  return {
    id: `e-${n}`,
    version: 1,
    form_version_id: version,
    form_kind: version === 'vs' ? 'super' : 'match',
    event_id: EVENT,
    match_id: match === null ? null : `m-${match}`,
    team_id: team,
    alliance: version === 'vs' ? null : 'red',
    scouter_id: n % 2 ? 'u-1' : 'u-2',
    robot_status: version === 'vs' ? null : 'played',
    breakdown_seconds: null,
    data: {},
    client_created_at: at,
    client_updated_at: at,
    deleted_at: null,
    created_at: at,
    updated_at: at,
    ...over,
  };
};

const ENTRIES: Row[] = [
  // 8009: two matches on v1 (before the new fields), then v2.
  stored('t-a', 1, 'v1', { data: { auto_notes: 2, teleop_notes: 5, endgame_climb: 'low' } }),
  stored('t-a', 2, 'v1', { robot_status: 'no_show' }),
  stored('t-a', 3, 'v2', {
    data: {
      auto_notes: 1,
      teleop_notes: 3,
      endgame_climb: 'high',
      climb_seconds: 9,
      cycle_time: null, // "unsure"
      cycle_estimate: 10,
      driver_skill: 4,
      notes: 'Fast cycles',
    },
  }),
  stored('t-a', 4, 'v2', { data: { auto_notes: 0, teleop_notes: 2, endgame_climb: 'none' } }), // left empty
  stored('t-a', 5, 'v2', { robot_status: 'disabled' }),
  stored('t-a', null, 'vs', { data: { super_notes: 'Quick driver', driver_skill: 'high' } }),
  // 8014: three seed entries from before the fields existed.
  stored('t-b', 1, 'v1', { data: { auto_notes: 3, teleop_notes: 2, endgame_climb: 'low' } }),
  stored('t-b', 2, 'v1', { data: { auto_notes: 1, teleop_notes: 4, endgame_climb: 'none' } }),
  stored('t-b', 3, 'v1', { robot_status: 'no_show' }),
  // 8020, for the event's domains and the rank.
  stored('t-c', 1, 'v2', {
    data: { auto_notes: 1, teleop_notes: 8, driver_skill: 2, cycle_time: 6.5, cycle_estimate: 12 },
  }),
];

/** The entry still in the device's outbox: 8014 at Q6, a match the device created itself. */
const OUTBOX_DATA = {
  auto_notes: 2,
  teleop_notes: 6,
  endgame_climb: 'high',
  climb_seconds: 7,
  cycle_time: 8.4,
  cycle_estimate: 9,
  driver_skill: 3,
};
const OUTBOX_AT = '2026-03-17T19:30:00.000Z';
/** The row `submitEntry` writes into the cache (no created_at, the client's stamp). */
const outboxRow: Row = {
  id: 'e-outbox',
  form_version_id: 'v2',
  form_kind: 'match',
  event_id: EVENT,
  match_id: 'm-6',
  team_id: 't-b',
  alliance: 'blue',
  scouter_id: 'u-1',
  robot_status: 'played',
  breakdown_seconds: null,
  data: OUTBOX_DATA,
  entity: 'scouting_entries',
  version: 1,
  client_created_at: OUTBOX_AT,
  client_updated_at: OUTBOX_AT,
  updated_at: OUTBOX_AT,
  deleted_at: null,
};
/** The same entry once pushed, as the server stores it (Postgres's stamp). */
const pushedRow: Row = {
  ...stored('t-b', 6, 'v2', { id: 'e-outbox', alliance: 'blue', scouter_id: 'u-1' }),
  data: OUTBOX_DATA,
  client_created_at: '2026-03-17T19:30:00+00:00',
  client_updated_at: '2026-03-17T19:30:00+00:00',
};
/** `ensureMatchLocally`'s bare row for Q6: event, type, number, nothing else. */
const localMatch: Row = {
  id: 'm-6',
  event_id: EVENT,
  match_type: 'qualification',
  number: 6,
  entity: 'matches',
  version: 1,
  updated_at: OUTBOX_AT,
};

/** The server's Store over the server's rows: only the reads `getTeamStats` makes. */
function serverContext(entries: Row[]): unknown {
  const live = (r: Row) => r.deleted_at == null;
  const store = {
    getTeam: async (id: string) => teams.find((t) => t.id === id) ?? null,
    getEvent: async (id: string) => (id === EVENT ? event : null),
    getRoster: async () => teams,
    entriesForScope: async ({ eventIds }: { eventIds: string[] }) =>
      entries.filter((e) => eventIds.includes(String(e.event_id)) && live(e)),
    getMatchesByIds: async (ids: string[]) => MATCHES.filter((m) => ids.includes(m.id)),
    getFormByKind: async (season: string, kind: string) =>
      FORMS.find((f) => f.season_id === season && f.kind === kind) ?? null,
    getFormFields: async (version: string) =>
      FIELDS.filter((f) => f.form_version_id === version).sort(
        (a, b) => Number(a.display_order) - Number(b.display_order),
      ),
    getScoringRules: async (form: string) => RULES.filter((r) => r.form_id === form),
    listUserNames: async (ids: string[]) => USERS.filter((u) => ids.includes(u.id)),
  };
  return { store, now: () => new Date(AT) };
}

/** The device's cache: the pulled rows, plus the outbox entry and its local match. */
const cache = (entries: Row[], matches: Row[]): DeviceStatsRows => ({
  events: [event],
  teams,
  event_teams: teams.map((t) => ({ id: `et-${t.id}`, event_id: EVENT, team_id: t.id })),
  scouting_entries: entries,
  matches,
  forms: FORMS,
  form_versions: VERSIONS,
  form_fields: FIELDS,
  scoring_rules: RULES,
  users: USERS,
});

async function both(teamId: string): Promise<[TeamStats, TeamStats]> {
  const device = deviceTeamStats(
    cache([...ENTRIES, outboxRow], [...MATCHES.slice(0, 5), localMatch]),
    teamId,
    EVENT,
  );
  if (device.state !== 'held') throw new Error('the device does not hold the team');
  const { getTeamStats } = await serverStats();
  const { next_cursor: _cursor, ...server } = await getTeamStats(
    lead,
    { team_id: teamId, scope: { mode: 'event', event_id: EVENT }, limit: 200 },
    serverContext([...ENTRIES, pushedRow]),
  );
  return [device.stats, server];
}

/** A note's stamp as an instant: the outbox row's `.000Z` and Postgres's `+00:00` are one time. */
const sameInstants = (stats: TeamStats) => ({
  ...stats,
  notes: stats.notes.map((note) => ({
    ...note,
    client_updated_at: new Date(note.client_updated_at).toISOString(),
  })),
});

const values = (metric: StatsMetric | undefined) =>
  metric?.series.map((p) => (p.asked ? p.value : 'not asked'));

describe('the team page on the device and on the server (Phase 1 I side task 5)', () => {
  for (const [name, id] of [
    ['8009', 't-a'],
    ['8014, with its entry in the outbox', 't-b'],
    ['8020', 't-c'],
  ] as const) {
    it(`gives the same statistics, metric for metric, for ${name}`, async () => {
      const [device, server] = await both(id);
      expect(device.metrics.map((m) => m.key)).toEqual(server.metrics.map((m) => m.key));
      for (const metric of server.metrics) {
        expect(
          device.metrics.find((m) => m.key === metric.key),
          metric.key,
        ).toEqual(metric);
      }
      expect(sameInstants(device)).toEqual(sameInstants(server));
    });
  }

  it('reads the four cases: an outbox answer, an older version, a no-show, an unsure timer', async () => {
    const [a] = await both('t-a');
    const [b] = await both('t-b');
    const metric = (stats: TeamStats, key: string) =>
      stats.metrics.find((m) => m.key === `field:${key}`);
    // 8009: Q1, Q2 on v1 (not asked); Q3 answered; Q4 left empty; Q5 disabled.
    expect(values(metric(a, 'driver_skill'))).toEqual(['not asked', 'not asked', 4, null, null]);
    expect(values(metric(a, 'cycle_time'))).toEqual(['not asked', 'not asked', null, null, null]);
    // 8014: three seed entries before the field, then the phone's answer, still unsent.
    expect(values(metric(b, 'driver_skill'))).toEqual(['not asked', 'not asked', 'not asked', 3]);
    expect(metric(b, 'driver_skill')!.value).toBe(3);
    expect(values(metric(b, 'cycle_time'))).toEqual(['not asked', 'not asked', 'not asked', 8.4]);
    expect(values(metric(b, 'cycle_estimate'))).toEqual(['not asked', 'not asked', 'not asked', 9]);
    expect(values(metric(b, 'climb_seconds'))).toEqual(['not asked', 'not asked', 'not asked', 7]);
  });
});
