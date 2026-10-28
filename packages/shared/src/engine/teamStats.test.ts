import { describe, expect, it } from 'vitest';
import { FIELD_PHASES } from '../api/forms';
import {
  getTeamStatsOutput,
  PHASE_SORT_KEYS,
  RANK_SORT_KEYS,
  rankRow,
  rankTeamsInput,
  SORT_DIRECTIONS,
  type RankSortKey,
} from '../api/stats';
import { aggregate } from './aggregate';
import type { FormFieldDefinition } from '../forms/types';
import { averagePoints, rankByAveragePoints } from './breakdown';
import { shadeFor } from './shading';
import {
  buildRankTable,
  buildTeamStats,
  compareRankRows,
  fieldMetricKey,
  phaseOfSortKey,
  RANK_SORT_DEFAULT_DIRECTION,
  rankRowHasData,
  scoringPhases,
  sortRankRows,
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
  field('climb_time', 'timer', 'endgame', { unit: 'seconds' }),
  field('driver', 'rating', 'post_match', { config: { max: 10 } }),
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

  it('gives one metric per live scorable, rating or timer field: no computed, text or deprecated one', () => {
    const stats = buildTeamStats(input([]));
    expect(stats.metrics.map((m) => m.field_key)).toEqual([
      null,
      null,
      null,
      'cycles',
      'fouls',
      'rating',
      'reached',
      'tags',
      'climb_time',
      'auto_score',
      'driver',
    ]);
    // A Post-match group with a rating in it; ratings and timers are never match-table columns.
    expect(stats.metrics.filter((m) => m.group === 'post_match').map((m) => m.field_key)).toEqual([
      'auto_score',
      'driver',
    ]);
    expect(stats.columns.map((c) => c.key)).toEqual([
      fieldMetricKey('cycles'),
      fieldMetricKey('reached'),
    ]);
  });

  it('averages a rating over its declared 1..max domain, higher is better by default', () => {
    const stats = buildTeamStats(
      input([
        entry({ team_id: 'a', data: { rating: 4, driver: 7 } }),
        entry({ team_id: 'a', data: { rating: 5, driver: 8 } }),
        entry({ team_id: 'b', data: { rating: 1, driver: 2 } }),
      ]),
    );
    const by = (key: string) => stats.metrics.find((m) => m.field_key === key)!;
    expect(by('rating')).toMatchObject({
      kind: 'number',
      aggregation: 'avg',
      value: 4.5,
      display: null,
      direction: 'higher_is_better',
      domain: { min: 1, max: 5 },
    });
    expect(by('driver')).toMatchObject({ value: 7.5, domain: { min: 1, max: 10 } });
    expect(by('driver').series.map((p) => p.value)).toEqual([7, 8]);
  });

  it('reads a timer as lower-is-better with no declared direction, worded in seconds', () => {
    const stats = buildTeamStats(
      input([
        entry({ team_id: 'a', data: { climb_time: 10 } }),
        entry({ team_id: 'a', data: { climb_time: 14.75 } }),
        entry({ team_id: 'b', data: { climb_time: 30 } }),
      ]),
    );
    const timer = stats.metrics.find((m) => m.field_key === 'climb_time')!;
    expect(timer).toMatchObject({
      kind: 'number',
      aggregation: 'avg',
      group: 'endgame',
      direction: 'lower_is_better',
      value: 12.375,
      display: '12.4 s',
      domain: { min: 12.375, max: 30 },
    });
    // The reversed scale: the fastest team at the event is shaded best, not flat.
    const domain = { kind: 'range' as const, ...timer.domain! };
    expect(shadeFor(timer.value, domain, timer.direction)).toMatchObject({
      position: 1,
      flat: false,
    });
    expect(shadeFor(30, domain, timer.direction)).toMatchObject({ position: 0, flat: false });
    // A declared direction and range win.
    const declared = buildTeamStats(
      input([entry({ team_id: 'a', data: { climb_time: 10 } })], {
        scoring: {
          fields: FIELDS.map((f) =>
            f.key === 'climb_time'
              ? { ...f, direction: 'higher_is_better', expected_range: { min: 0, max: 60 } }
              : f,
          ),
          rules: RULES,
        },
      }),
    );
    expect(declared.metrics.find((m) => m.field_key === 'climb_time')).toMatchObject({
      direction: 'higher_is_better',
      domain: { min: 0, max: 60 },
      display: '10 s',
    });
  });

  it('leaves an unsure timer and a no-show out of the figure: null in the series, never 0', () => {
    const stats = buildTeamStats(
      input([
        entry({ team_id: 'a', match_number: 1, data: { climb_time: 8, driver: 6 } }),
        entry({ team_id: 'a', match_number: 2, data: { climb_time: null, driver: 4 } }),
        entry({ team_id: 'a', match_number: 3, robot_status: 'no_show', data: {} }),
        entry({ team_id: 'a', match_number: 4, data: { driver: 5 } }),
      ]),
    );
    const by = (key: string) => stats.metrics.find((m) => m.field_key === key)!;
    expect(by('climb_time').value).toBe(8);
    expect(by('climb_time').series.map((p) => p.value)).toEqual([8, null, null, null]);
    expect(by('driver').value).toBe(5);
    expect(by('driver').series.map((p) => p.value)).toEqual([6, 4, null, 5]);
  });

  it('tells a field its form version did not have from a gap: asked false, never a "—" (side task 5)', () => {
    const before = FIELDS.filter((f) => f.key !== 'driver' && f.key !== 'climb_time');
    const stats = buildTeamStats(
      input(
        [
          // Scouted on v1, before Driver skill and Climb time existed.
          entry({ team_id: 'a', match_number: 1, form_version_id: 'v1', data: { cycles: 2 } }),
          entry({ team_id: 'a', match_number: 2, form_version_id: 'v1', robot_status: 'no_show' }),
          // On v2: an answer with an "unsure" timer, a no-show, a field left empty.
          entry({
            team_id: 'a',
            match_number: 3,
            data: { cycles: 5, driver: 7, climb_time: null },
          }),
          entry({ team_id: 'a', match_number: 4, robot_status: 'no_show' }),
          entry({ team_id: 'a', match_number: 5, data: { cycles: 1 } }),
          // A version the caller does not hold: read from the entry alone.
          entry({ team_id: 'a', match_number: 6, form_version_id: 'v9', data: { driver: 3 } }),
          entry({ team_id: 'a', match_number: 7, form_version_id: 'v9', data: { cycles: 4 } }),
        ],
        {
          versions: [
            { id: 'v1', fields: before },
            { id: 'v2', fields: FIELDS },
          ],
        },
      ),
    );
    const by = (key: string) => stats.metrics.find((m) => m.field_key === key)!;
    const points = (key: string) => by(key).series.map((p) => [p.value, p.asked]);
    expect(points('driver')).toEqual([
      [null, false],
      [null, false],
      [7, true],
      [null, true],
      [null, true],
      [3, true],
      [null, false],
    ]);
    expect(points('climb_time')).toEqual([
      [null, false],
      [null, false],
      [null, true],
      [null, true],
      [null, true],
      [null, false],
      [null, false],
    ]);
    // A field every version held has every match asked, the no-shows its only gaps; on the
    // unknown version only the entry that holds a value of it is.
    expect(points('cycles')).toEqual([
      [2, true],
      [null, true],
      [5, true],
      [null, true],
      [1, true],
      [null, false],
      [4, true],
    ]);
    expect(by('driver').value).toBe(5);
    expect(stats.metrics[0]!.series.every((p) => p.asked)).toBe(true);
    expect(getTeamStatsOutput.safeParse({ ...stats, next_cursor: null }).success).toBe(true);
  });

  it('reads a series point from a server that predates `asked` as asked', () => {
    const stats = buildTeamStats(input([entry({ team_id: 'a', data: { driver: 4 } })]));
    const old = {
      ...stats,
      next_cursor: null,
      metrics: stats.metrics.map((m) => ({
        ...m,
        series: m.series.map(({ asked: _asked, ...p }) => p),
      })),
    };
    const parsed = getTeamStatsOutput.parse(old);
    expect(parsed.metrics.every((m) => m.series.every((p) => p.asked === true))).toBe(true);
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

describe('buildRankTable — Consistency and the phase averages (task 1.58)', () => {
  // a: cycles 5 / reached high (10) and cycles 9 / low (11); b: one match, cycles 3, then a
  // no-show; c: a practice match only (no data at all).
  const TEAMS3: StatsTeam[] = [...TEAMS, { id: 'c', number: 50, name: 'Charlie' }];
  const entries = [
    entry({ team_id: 'a', data: { cycles: 5, reached: ['high'] } }),
    entry({ team_id: 'a', data: { cycles: 9, reached: ['low'] } }),
    entry({ team_id: 'b', data: { cycles: 3 } }),
    entry({ team_id: 'b', robot_status: 'no_show', data: { cycles: 40 } }),
    entry({ team_id: 'c', match_type: 'practice', data: { cycles: 30 } }),
  ];
  const table = () =>
    buildRankTable({ teams: TEAMS3, entries, scoring: { fields: FIELDS, rules: RULES } });

  it('lists the phases that carry points in the form, in FIELD_PHASES order, on every row', () => {
    expect(scoringPhases({ fields: FIELDS, rules: RULES })).toEqual(['teleop', 'endgame']);
    for (const row of table()) {
      expect(row.phase_averages.map((p) => p.phase)).toEqual(['teleop', 'endgame']);
      expect(rankRow.strict().safeParse(row).success).toBe(true);
    }
  });

  it('averages each phase over the counted entries, so the phases add up to Total', () => {
    const a = table().find((r) => r.team_id === 'a')!;
    expect(a.average_points).toBe(10.5);
    expect(a.phase_averages).toEqual([
      { phase: 'teleop', average: 7 },
      { phase: 'endgame', average: 3.5 },
    ]);
    // b's no-show is left out of every figure, never a zero (11.3).
    const b = table().find((r) => r.team_id === 'b')!;
    expect(b.phase_averages).toEqual([
      { phase: 'teleop', average: 3 },
      { phase: 'endgame', average: 0 },
    ]);
    for (const row of table()) {
      if (row.average_points === null) continue;
      const sum = row.phase_averages.reduce((s, p) => s + (p.average ?? 0), 0);
      expect(sum).toBeCloseTo(row.average_points, 9);
    }
  });

  it('gives Consistency as the std dev of the same points, null under two matches', () => {
    const rows = table();
    expect(rows.find((r) => r.team_id === 'a')!.stddev).toBe(aggregate([10, 11], 'stddev'));
    expect(rows.find((r) => r.team_id === 'b')!.stddev).toBeNull();
  });

  it('agrees with the team page on every row: rank, Total and std dev', () => {
    for (const row of table()) {
      const stats = buildTeamStats(
        input(entries, { team: TEAMS3.find((t) => t.id === row.team_id)!, teams: TEAMS3 }),
      );
      expect(stats.rank.rank, row.team_id).toBe(row.rank);
      expect(stats.headline.value, row.team_id).toBe(row.average_points);
      expect(stats.metrics.find((m) => m.key === 'stddev_points')!.value, row.team_id).toBe(
        row.stddev,
      );
    }
  });

  it('gives a team with no data nulls — never zeros — and sorts it last under every key', () => {
    const c = table().find((r) => r.team_id === 'c')!;
    expect(c).toMatchObject({
      rank: null,
      average_points: null,
      stddev: null,
      availability_rate: null,
      matches_counted: 0,
    });
    expect(c.phase_averages.every((p) => p.average === null)).toBe(true);
    expect(rankRowHasData(c)).toBe(false);
    for (const key of RANK_SORT_KEYS) {
      for (const direction of SORT_DIRECTIONS) {
        const rows = buildRankTable({
          teams: TEAMS3,
          entries,
          scoring: { fields: FIELDS, rules: RULES },
          sort_by: key,
          direction,
        });
        expect(rows.at(-1)!.team_id, `${key} ${direction}`).toBe('c');
      }
    }
  });

  it('sorts by a phase, best first by default; a phase the form does not score ties to rank', () => {
    const order = (sort_by: RankSortKey) =>
      buildRankTable({
        teams: TEAMS3,
        entries,
        scoring: { fields: FIELDS, rules: RULES },
        sort_by,
      }).map((r) => r.team_id);
    expect(order('teleop_points')).toEqual(['a', 'b', 'c']);
    expect(RANK_SORT_DEFAULT_DIRECTION.endgame_points).toBe('desc');
    expect(order('auto_points')).toEqual(['a', 'b', 'c']); // null everywhere: rank order
  });

  it('keeps the phase keys in step with the phases, and never takes Consistency as a key', () => {
    const phaseKeys = RANK_SORT_KEYS.filter((k) => phaseOfSortKey(k) !== null);
    expect(phaseKeys).toEqual(FIELD_PHASES.map((p) => PHASE_SORT_KEYS[p]));
    expect(RANK_SORT_KEYS).not.toContain('stddev' as never);
    expect(rankTeamsInput.safeParse({ event_id: 'ev', sort_by: 'stddev' }).success).toBe(false);
    expect(rankTeamsInput.safeParse({ event_id: 'ev', sort_by: 'teleop_points' }).success).toBe(
      true,
    );
  });

  it('settles ties with each later figure, then rank; the rank itself never moves', () => {
    const base = table();
    const tied = base.map((r) => ({ ...r, breakdowns: 0 }));
    const sorted = sortRankRows(tied, [
      { key: 'breakdowns', direction: 'asc' },
      { key: 'teleop_points', direction: 'asc' },
    ]);
    expect(sorted.map((r) => r.team_id)).toEqual(['b', 'a', 'c']);
    for (const row of sorted) {
      expect(row.rank).toBe(base.find((r) => r.team_id === row.team_id)!.rank);
    }
    // Still tied after every figure: rank order.
    expect(
      sortRankRows(tied, [{ key: 'breakdowns', direction: 'desc' }]).map((r) => r.team_id),
    ).toEqual(['a', 'b', 'c']);
    expect(compareRankRows(tied[0]!, tied[0]!, [])).toBe(0);
  });

  it('counts a retired field a scoring rule still names in its phase, so the sum holds', () => {
    const rules: ScoringRule[] = [...RULES, { field_key: 'old', points: 3, option_points: null }];
    // The second match holds no `old`: its retired Auto row is not there at all, and it still
    // counts 0 in Auto (not "no data"), so the phases add up to Total.
    const withOld = [
      entry({ team_id: 'a', data: { cycles: 2, old: 2 } }),
      entry({ team_id: 'a', data: { cycles: 4 } }),
    ];
    const [a] = buildRankTable({
      teams: [TEAMS[0]!],
      entries: withOld,
      scoring: { fields: FIELDS, rules },
    });
    expect(a!.phase_averages.map((p) => p.phase)).toEqual(['auto', 'teleop', 'endgame']);
    expect(a!.average_points).toBe(6);
    expect(a!.phase_averages).toEqual([
      { phase: 'auto', average: 3 },
      { phase: 'teleop', average: 3 },
      { phase: 'endgame', average: 0 },
    ]);
  });
});

describe('buildRankTable — the trend line and "before a match" (task 1.58b)', () => {
  const scoring = { fields: FIELDS, rules: RULES };
  // a: Q1..Q7 scoring 1..7 (cycles), with a no-show at Q4 and a disabled robot at Q6 in between;
  // b: Q2 8, Q5 2. Numbers fixed, so "before" reads real match numbers.
  const at = (team_id: string, n: number, cycles: number, over: Partial<EngineEntry> = {}) =>
    entry({ team_id, match_number: n, match_id: `m-${team_id}-${n}`, data: { cycles }, ...over });
  const entries = [
    at('a', 1, 1),
    at('a', 2, 2),
    at('a', 3, 3),
    at('a', 4, 40, { robot_status: 'no_show' }),
    at('a', 5, 5),
    at('a', 6, 60, { robot_status: 'disabled' }),
    at('a', 7, 7),
    at('a', 8, 8),
    at('a', 9, 9),
    at('b', 2, 8),
    at('b', 5, 2),
    at('a', 1, 99, { match_type: 'practice', match_id: 'm-p1' }),
  ];
  const table = (over: Partial<Parameters<typeof buildRankTable>[0]> = {}) =>
    buildRankTable({ teams: TEAMS, entries, scoring, ...over });
  const row = (rows: ReturnType<typeof table>, id: string) => rows.find((r) => r.team_id === id)!;

  it('gives the last five counted totals, oldest first, no-show and disabled left out', () => {
    const a = row(table(), 'a');
    expect(a.recent_totals).toEqual([3, 5, 7, 8, 9]);
    expect(a.last_counted_match).toBe(9);
    // The same population as the average: the totals ARE the points the average reads.
    expect(a.matches_counted).toBe(7);
    expect(row(table(), 'b').recent_totals).toEqual([8, 2]);
    expect(row(table(), 'b').last_counted_match).toBe(5);
    for (const r of table()) expect(rankRow.strict().safeParse(r).success).toBe(true);
  });

  it('leaves the trend line empty and the last match null with no counted match', () => {
    const [c] = buildRankTable({
      teams: [{ id: 'c', number: 50, name: 'Charlie' }],
      entries: [
        entry({ team_id: 'c', match_type: 'practice', data: { cycles: 4 } }),
        entry({ team_id: 'c', robot_status: 'no_show', data: { cycles: 4 } }),
      ],
      scoring,
    });
    expect(c!.recent_totals).toEqual([]);
    expect(c!.last_counted_match).toBeNull();
  });

  it('counts only the qualification matches numbered below before_match_number', () => {
    const before = table({ before_match_number: 5 });
    const a = row(before, 'a');
    // Q1–Q3 (Q4 a no-show): 1, 2, 3; b only Q2 (8).
    expect(a.recent_totals).toEqual([1, 2, 3]);
    expect(a.average_points).toBe(2);
    expect(a.matches_counted).toBe(3);
    expect(a.no_shows).toBe(1);
    expect(a.last_counted_match).toBe(3);
    const b = row(before, 'b');
    expect(b.average_points).toBe(8);
    expect(b.last_counted_match).toBe(2);
    // The rank is recomputed over the earlier matches: b led then, a leads now.
    expect(before.map((r) => [r.team_id, r.rank])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
    expect(table().map((r) => [r.team_id, r.rank])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('is the same table as the entries before that match, and nothing at all before Q1', () => {
    const earlier = entries.filter(
      (e) => e.match_type !== 'qualification' || (e.match_number ?? 0) < 7,
    );
    expect(table({ before_match_number: 7 })).toEqual(table({ entries: earlier }));
    const none = table({ before_match_number: 1 });
    expect(none.every((r) => r.rank === null && r.recent_totals.length === 0)).toBe(true);
    // Unset, every match counts; past the last match, the same.
    expect(table({ before_match_number: 100 })).toEqual(table());
  });

  it('takes before_match_number through rankTeamsInput, a positive whole number only', () => {
    expect(rankTeamsInput.safeParse({ event_id: 'ev', before_match_number: 36 }).success).toBe(
      true,
    );
    for (const bad of [0, -1, 2.5, '36']) {
      expect(rankTeamsInput.safeParse({ event_id: 'ev', before_match_number: bad }).success).toBe(
        false,
      );
    }
  });
});
