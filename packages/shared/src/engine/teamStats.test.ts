import { describe, expect, it } from 'vitest';
import { getTeamStatsOutput, rankRow } from '../api/stats';
import type { FormFieldDefinition } from '../forms/types';
import { averagePoints, rankByAveragePoints } from './breakdown';
import {
  buildRankTable,
  buildTeamStats,
  fieldMetricKey,
  type StatsTeam,
  type TeamStatsInput,
} from './teamStats';
import type { EngineEntry, ScoringRule } from './types';

const field = (
  key: string,
  type: FormFieldDefinition['type'],
  phase: FormFieldDefinition['phase'],
  over: Partial<FormFieldDefinition> = {},
): FormFieldDefinition => ({
  id: key,
  key,
  label: `${key} label`,
  help_text: null,
  type,
  section: null,
  display_order: 1,
  required: false,
  default_value: null,
  config: {},
  visibility_condition: null,
  deprecated: false,
  description: 'x',
  unit: 'count',
  phase,
  direction: null,
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
  ...over,
});

const levels = {
  options: [
    { value: 'none', label: 'None' },
    { value: 'low', label: 'Low' },
    { value: 'high', label: 'High' },
  ],
};

const FIELDS: FormFieldDefinition[] = [
  field('cycles', 'counter', 'teleop', { expected_range: { min: 0, max: 20 } }),
  field('fouls', 'counter', 'teleop', { direction: 'lower_is_better' }),
  field('auto_score', 'number', null),
  field('reached', 'multi_select', 'endgame', { config: levels, is_ordinal: true }),
  field('tags', 'multi_select', 'endgame', { config: levels }),
  field('double', 'computed', 'teleop', {
    config: {
      expression: {
        kind: 'op',
        op: '*',
        left: { kind: 'field', key: 'cycles' },
        right: { kind: 'literal', value: 2 },
      },
    },
  }),
  field('old', 'counter', 'auto', { deprecated: true }),
  field('rating', 'rating', 'teleop'),
  field('comment', 'long_text', 'post_match', { label: 'Comment' }),
];
const RULES: ScoringRule[] = [
  { field_key: 'cycles', points: 1, option_points: null },
  { field_key: 'reached', points: 0, option_points: { low: 2, high: 5 } },
];

const TEAMS: StatsTeam[] = [
  { id: 'a', number: 100, name: 'Alpha' },
  { id: 'b', number: 200, name: 'Bravo' },
];

let seq = 0;
const entry = (over: Partial<EngineEntry> & { team_id: string }): EngineEntry => {
  seq += 1;
  const at = new Date(Date.UTC(2026, 0, 1, 0, seq)).toISOString();
  return {
    id: `e-${seq}`,
    form_version_id: 'v2',
    form_kind: 'match',
    event_id: 'ev',
    match_id: `m-${over.match_number ?? seq}`,
    alliance: 'red',
    scouter_id: 'u-1',
    robot_status: 'played',
    data: {},
    client_created_at: at,
    client_updated_at: at,
    deleted_at: null,
    match_type: 'qualification',
    match_number: seq,
    event_sort_order: 1,
    ...over,
  };
};

const input = (entries: EngineEntry[], over: Partial<TeamStatsInput> = {}): TeamStatsInput => ({
  team: TEAMS[0]!,
  event: { id: 'ev', name: 'Event' },
  teams: TEAMS,
  entries,
  scoring: { fields: FIELDS, rules: RULES },
  versions: [{ id: 'v2', fields: FIELDS }],
  scouters: [{ id: 'u-1', full_name: 'Noa Levi' }],
  ...over,
});

describe('buildTeamStats (task 1.57)', () => {
  it('passes its wire schema even with no entries at all, with nulls rather than zeros', () => {
    const stats = buildTeamStats(input([]));
    expect(getTeamStatsOutput.safeParse({ ...stats, next_cursor: null }).success).toBe(true);
    expect(stats.headline).toEqual({ label: 'Average points', value: null });
    expect(stats.tiles).toEqual({
      median: null,
      availability: { rate: null, available: 0, total: 0 },
      best_match: null,
      trend: null,
    });
    expect(stats.rank).toEqual({ rank: null, of: 2 });
    expect(stats.matches).toEqual([]);
    expect(stats.notes).toEqual([]);
    expect(stats.metrics.every((m) => m.value === null && m.series.length === 0)).toBe(true);
  });

  it('takes the domain from expected_range, else the observed range at the event', () => {
    const stats = buildTeamStats(
      input([
        entry({ team_id: 'a', data: { cycles: 4, fouls: 1, auto_score: 3 } }),
        entry({ team_id: 'b', data: { cycles: 8, fouls: 3, auto_score: 9 } }),
      ]),
    );
    const by = (key: string) => stats.metrics.find((m) => m.key === fieldMetricKey(key))!;
    expect(by('cycles')).toMatchObject({ value: 4, domain: { min: 0, max: 20 } });
    expect(by('fouls')).toMatchObject({
      value: 1,
      direction: 'lower_is_better',
      domain: { min: 1, max: 3 },
    });
    // A field with no direction reads as higher_is_better; one with no phase is post-match.
    expect(by('auto_score')).toMatchObject({ direction: 'higher_is_better', group: 'post_match' });
  });

  it('includes the team itself in the domain when it is not on the roster', () => {
    const stats = buildTeamStats(
      input(
        [entry({ team_id: 'x', data: { fouls: 9 } }), entry({ team_id: 'b', data: { fouls: 3 } })],
        {
          team: { id: 'x', number: 999, name: 'Guest' },
        },
      ),
    );
    expect(stats.metrics.find((m) => m.field_key === 'fouls')!.domain).toEqual({ min: 3, max: 9 });
    expect(stats.rank).toEqual({ rank: null, of: 2 });
  });

  it('reads an ordinal multi select by its highest rank, and a nominal one by its mode', () => {
    const stats = buildTeamStats(
      input([
        entry({ team_id: 'a', data: { reached: ['low', 'high'], tags: ['low', 'high'] } }),
        entry({ team_id: 'a', data: { reached: ['low'], tags: ['low'] } }),
      ]),
    );
    const reached = stats.metrics.find((m) => m.field_key === 'reached')!;
    expect(reached).toMatchObject({ kind: 'ordinal', value: 1.5, display: 'High' });
    expect(reached.series.map((p) => p.value)).toEqual([2, 1]);
    expect(stats.metrics.find((m) => m.field_key === 'tags')).toMatchObject({
      kind: 'nominal',
      value: null,
      display: 'Low',
    });
    const cell = stats.matches[0]!.columns[fieldMetricKey('reached')];
    expect(cell).toEqual({ value: 2, display: 'Low, High' });
  });

  it('gives one metric per live scorable field: no computed, rating, text or deprecated one', () => {
    const keys = buildTeamStats(input([])).metrics.map((m) => m.field_key);
    expect(keys).toEqual([null, null, null, 'cycles', 'fouls', 'reached', 'tags', 'auto_score']);
  });

  it('refuses a field whose type changed in a version a counted entry names, and only then', () => {
    const older = [field('cycles', 'number', 'teleop'), ...FIELDS.slice(1)];
    const entries = [entry({ team_id: 'a', data: { cycles: 4 } })];
    const unread = buildTeamStats(input(entries, { versions: [{ id: 'v1', fields: older }] }));
    expect(unread.metrics.find((m) => m.field_key === 'cycles')!.unavailable_reason).toBeNull();

    // Another team's counted entry on v1 is in the event's window: the metric is refused.
    const window = [
      ...entries,
      entry({ team_id: 'b', form_version_id: 'v1', data: { cycles: 1 } }),
    ];
    const stats = buildTeamStats(
      input(window, {
        versions: [
          { id: 'v2', fields: FIELDS },
          { id: 'v1', fields: older },
        ],
      }),
    );
    expect(stats.metrics.find((m) => m.field_key === 'cycles')).toMatchObject({
      value: null,
      domain: null,
      series: [],
      unavailable_reason: 'type-changed',
    });
    // A practice entry on v1 never feeds an aggregate, so it does not refuse anything.
    const practice = buildTeamStats(
      input([...entries, entry({ team_id: 'b', form_version_id: 'v1', match_type: 'practice' })], {
        versions: [{ id: 'v1', fields: older }],
      }),
    );
    expect(practice.metrics.find((m) => m.field_key === 'cycles')!.unavailable_reason).toBeNull();
  });

  it('keeps a disabled robot out of every figure but the reliability counts', () => {
    const stats = buildTeamStats(
      input([
        entry({ team_id: 'a', match_number: 1, data: { cycles: 6 } }),
        entry({ team_id: 'a', match_number: 2, robot_status: 'disabled', data: { cycles: 50 } }),
        entry({ team_id: 'a', match_number: 3, robot_status: 'broke_down', data: { cycles: 2 } }),
      ]),
    );
    expect(stats.headline.value).toBe(4);
    expect(stats.matches.map((m) => m.scouted_points)).toEqual([6, null, 2]);
    expect(stats.reliability).toMatchObject({
      disabled: 1,
      breakdowns: 1,
      disabled_matches: ['Q2'],
      breakdown_matches: ['Q3'],
      availability_rate: 2 / 3,
    });
    expect(stats.metrics[0]!.series.map((p) => p.value)).toEqual([6, null, 2]);
  });

  it('labels notes by the active version, falling back to the entry’s own version', () => {
    const v1 = [field('legacy', 'long_text', 'post_match', { label: 'Legacy note' })];
    const stats = buildTeamStats(
      input(
        [
          entry({ team_id: 'a', data: { comment: '  ' } }),
          entry({ team_id: 'a', form_version_id: 'v1', data: { legacy: 'שלום', comment: 'ok' } }),
        ],
        {
          versions: [
            { id: 'v2', fields: FIELDS },
            { id: 'v1', fields: v1 },
          ],
        },
      ),
    );
    expect(stats.notes.map((n) => [n.field_label, n.value, n.scouter_name])).toEqual([
      ['Comment', 'ok', 'Noa Levi'],
      ['Legacy note', 'שלום', 'Noa Levi'],
    ]);
  });
});

describe('buildRankTable (task 1.57)', () => {
  const entries = [
    entry({ team_id: 'a', data: { cycles: 5 } }),
    entry({ team_id: 'b', data: { cycles: 5 } }),
    entry({ team_id: 'b', robot_status: 'no_show' }),
  ];

  it('agrees with averagePoints and rankByAveragePoints, and carries no weighting', () => {
    const rows = buildRankTable({
      teams: TEAMS,
      entries,
      scoring: { fields: FIELDS, rules: RULES },
    });
    const ranks = rankByAveragePoints(entries, TEAMS, FIELDS, RULES);
    expect(rows.map((r) => [r.team_id, r.rank])).toEqual(ranks.map((r) => [r.team_id, r.rank]));
    expect(rows[1]!.average_points).toBe(
      averagePoints(
        entries.filter((e) => e.team_id === 'b'),
        FIELDS,
        RULES,
      ).avg,
    );
    for (const row of rows) {
      expect(rankRow.strict().safeParse(row).success).toBe(true);
      expect(row).not.toHaveProperty('weights');
      expect(row).not.toHaveProperty('contributions');
    }
  });

  it('breaks a tie on the sort column by the canonical rank, then the number', () => {
    // Same average (5): a ranks first by number; same availability? a 1, b 1/2.
    const rows = buildRankTable({
      teams: TEAMS,
      entries,
      scoring: { fields: FIELDS, rules: RULES },
      sort_by: 'average_points',
      direction: 'asc',
    });
    expect(rows.map((r) => r.team_id)).toEqual(['a', 'b']);
    const byMissed = buildRankTable({
      teams: TEAMS,
      entries,
      scoring: { fields: FIELDS, rules: RULES },
      sort_by: 'no_shows',
      direction: 'desc',
    });
    expect(byMissed.map((r) => r.team_id)).toEqual(['b', 'a']);
  });

  it('lists a roster team once, even when the roster names it twice', () => {
    const rows = buildRankTable({
      teams: [...TEAMS, TEAMS[0]!],
      entries: [],
      scoring: { fields: FIELDS, rules: RULES },
    });
    expect(rows.map((r) => r.team_id)).toEqual(['a', 'b']);
    expect(rows.every((r) => r.rank === null && r.average_points === null)).toBe(true);
  });
});
