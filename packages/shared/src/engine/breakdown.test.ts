import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from '../forms/types';
import {
  averagePoints,
  rankByAveragePoints,
  scoreBreakdown,
  scoutedPoints,
  type BreakdownEntry,
} from './breakdown';
import { scoreEntry } from './score';
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
  direction: 'higher_is_better',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
  ...over,
});

const climbOptions = {
  options: [
    { value: 'none', label: 'None' },
    { value: 'park', label: 'Parked' },
    { value: 'deep', label: 'Deep cage' },
  ],
};

const FIELDS: FormFieldDefinition[] = [
  field('auto_leave', 'toggle', 'auto'),
  field('auto_notes', 'counter', 'auto'),
  field('tele_head', 'section', null),
  field('tele_notes', 'counter', 'teleop'),
  field('defense', 'rating', 'teleop'),
  field('climb', 'single_select', 'endgame', { config: climbOptions, is_ordinal: true }),
  field('bonus', 'multi_select', 'endgame', { config: climbOptions }),
  field('comments', 'long_text', null),
];

const RULES: ScoringRule[] = [
  { field_key: 'auto_leave', points: 3, option_points: null },
  { field_key: 'auto_notes', points: 5, option_points: null },
  { field_key: 'tele_notes', points: 2, option_points: null },
  { field_key: 'climb', points: 0, option_points: { none: 0, park: 2, deep: 12 } },
  { field_key: 'bonus', points: 0, option_points: { park: 1, deep: 4 } },
];

const match = (
  data: Record<string, unknown>,
  robot_status: BreakdownEntry['robot_status'] = 'played',
): BreakdownEntry => ({ form_kind: 'match', robot_status, data });

const PLAYED = match({
  auto_leave: true,
  auto_notes: 2,
  tele_notes: 5,
  defense: 4,
  climb: 'deep',
  bonus: ['park', 'deep'],
  comments: 'Fast',
});

describe('scoreBreakdown (SPEC-FINAL 13.4, task 1.50)', () => {
  it('lays the answers out by phase in match order, with points and subtotals', () => {
    const b = scoreBreakdown(PLAYED, FIELDS, RULES);
    expect(b.phases.map((p) => p.phase)).toEqual(['auto', 'teleop', 'endgame', 'post_match']);
    expect(b.phases.map((p) => p.subtotal)).toEqual([13, 10, 17, null]);
    const auto = b.phases[0]!;
    expect(auto.fields).toEqual([
      { key: 'auto_leave', label: 'auto_leave label', type: 'toggle', value: true, points: 3 },
      { key: 'auto_notes', label: 'auto_notes label', type: 'counter', value: 2, points: 10 },
    ]);
  });

  it('has a total that is exactly scoreEntry, and subtotals that add up to it', () => {
    for (const entry of [PLAYED, match({}), match({ tele_notes: 3 }, 'broke_down')]) {
      const b = scoreBreakdown(entry, FIELDS, RULES);
      expect(b.total).toBe(scoreEntry(entry, FIELDS, RULES));
      const sum = b.phases.reduce((s, p) => s + (p.subtotal ?? 0), 0);
      expect(sum).toBe(b.total);
    }
    // Fractional points too: the total is scoreEntry's own figure, not a re-summed one.
    const half: ScoringRule[] = [{ field_key: 'tele_notes', points: 0.1, option_points: null }];
    const odd = match({ tele_notes: 3 });
    expect(scoreBreakdown(odd, FIELDS, half).total).toBe(scoreEntry(odd, FIELDS, half));
  });

  it('gives an unscored field null points and a scored field that earned nothing 0', () => {
    const b = scoreBreakdown(match({ auto_leave: false }), FIELDS, RULES);
    const rows = b.phases.flatMap((p) => p.fields);
    expect(rows.find((r) => r.key === 'auto_leave')!.points).toBe(0);
    expect(rows.find((r) => r.key === 'defense')!.points).toBeNull();
    expect(rows.find((r) => r.key === 'comments')!.points).toBeNull();
  });

  it('leaves out section headings, and a row the entry holds no value for has no value', () => {
    const b = scoreBreakdown(match({}), FIELDS, RULES);
    const rows = b.phases.flatMap((p) => p.fields);
    expect(rows.map((r) => r.key)).not.toContain('tele_head');
    expect('value' in rows.find((r) => r.key === 'climb')!).toBe(false);
  });

  it('shows a select as its option label, never as an ordinal rank', () => {
    const rows = scoreBreakdown(PLAYED, FIELDS, RULES).phases.flatMap((p) => p.fields);
    expect(rows.find((r) => r.key === 'climb')!.value).toBe('Deep cage');
    expect(rows.find((r) => r.key === 'bonus')!.value).toEqual(['Parked', 'Deep cage']);
    // An option the list no longer has reads as the stored value.
    const gone = scoreBreakdown(match({ climb: 'triple' }), FIELDS, RULES);
    expect(gone.phases.flatMap((p) => p.fields).find((r) => r.key === 'climb')!.value).toBe(
      'triple',
    );
  });

  it('gives a no-show or disabled robot no phases and no total — never zeros', () => {
    for (const status of ['no_show', 'disabled'] as const) {
      const b = scoreBreakdown(match({ auto_notes: 4 }, status), FIELDS, RULES);
      expect(b).toEqual({ total: null, phases: [] });
    }
  });

  it('gives a super entry its answers by phase with no points and no total', () => {
    const b = scoreBreakdown(
      { form_kind: 'super', robot_status: null, data: { auto_notes: 3 } },
      FIELDS,
      RULES,
    );
    expect(b.total).toBeNull();
    expect(b.phases.length).toBeGreaterThan(0);
    expect(b.phases.every((p) => p.subtotal === null)).toBe(true);
    expect(b.phases.flatMap((p) => p.fields).every((r) => r.points === null)).toBe(true);
  });

  it('leaves out a retired or hidden field, unless the entry holds a value for it', () => {
    const fields = [
      ...FIELDS,
      field('old', 'counter', 'teleop', { deprecated: true }),
      field('why', 'short_text', 'teleop', {
        visibility_condition: { field_key: 'auto_leave', op: '=', value: true },
      }),
    ];
    const rules = [...RULES, { field_key: 'old', points: 1, option_points: null }];
    const without = scoreBreakdown(match({ auto_leave: false }), fields, rules);
    const keys = without.phases.flatMap((p) => p.fields).map((r) => r.key);
    expect(keys).not.toContain('old');
    expect(keys).not.toContain('why');
    // Held: shown and scored, so the rows still add up to scoreEntry.
    const held = match({ auto_leave: false, old: 4 });
    const b = scoreBreakdown(held, fields, rules);
    expect(b.phases.flatMap((p) => p.fields).find((r) => r.key === 'old')!.points).toBe(4);
    expect(b.total).toBe(scoreEntry(held, fields, rules));
    expect(b.phases.reduce((s, p) => s + (p.subtotal ?? 0), 0)).toBe(b.total);
  });

  it('re-derives a computed field from the data, rather than trusting the stored value', () => {
    const fields = [
      ...FIELDS,
      field('total_notes', 'computed', 'teleop', {
        config: {
          expression: {
            kind: 'op',
            op: '+',
            left: { kind: 'field', key: 'auto_notes' },
            right: { kind: 'field', key: 'tele_notes' },
          },
        },
      }),
    ];
    const b = scoreBreakdown(
      match({ auto_notes: 2, tele_notes: 5, total_notes: 99 }),
      fields,
      RULES,
    );
    const row = b.phases.flatMap((p) => p.fields).find((r) => r.key === 'total_notes');
    expect(row).toMatchObject({ value: 7, points: null });
  });
});

describe('scoutedPoints', () => {
  it('is scoreEntry for a match entry, null for a dead robot and null for a super entry', () => {
    expect(scoutedPoints(PLAYED, FIELDS, RULES)).toBe(scoreEntry(PLAYED, FIELDS, RULES));
    expect(scoutedPoints(match({ auto_notes: 1 }, 'no_show'), FIELDS, RULES)).toBeNull();
    expect(
      scoutedPoints(
        { form_kind: 'super', robot_status: null, data: { auto_notes: 2 } },
        FIELDS,
        RULES,
      ),
    ).toBeNull();
  });
});

let seq = 0;
const engineEntry = (over: Partial<EngineEntry>): EngineEntry => {
  seq += 1;
  return {
    id: `e-${seq}`,
    form_version_id: 'fv',
    form_kind: 'match',
    event_id: 'ev',
    match_id: `m-${seq}`,
    team_id: 't-1',
    alliance: 'red',
    scouter_id: 'u',
    robot_status: 'played',
    data: {},
    client_created_at: '2026-03-01T10:00:00.000Z',
    client_updated_at: '2026-03-01T10:00:00.000Z',
    deleted_at: null,
    match_type: 'qualification',
    match_number: seq,
    event_sort_order: 1,
    ...over,
  };
};

describe('averagePoints (NEXT-CHAT "1.57 average points")', () => {
  it('averages the counted match entries only, and counts them', () => {
    const entries = [
      engineEntry({ data: { auto_notes: 2 } }), // 10
      engineEntry({ data: { tele_notes: 10 } }), // 20
      engineEntry({ robot_status: 'no_show', data: { auto_notes: 9 } }), // never counted
      engineEntry({ match_type: 'practice', data: { auto_notes: 9 } }), // practice
      engineEntry({ deleted_at: '2026-03-02T00:00:00Z', data: { auto_notes: 9 } }), // deleted
      engineEntry({
        form_kind: 'super',
        match_id: null,
        robot_status: null,
        match_type: null,
        data: { auto_notes: 9 },
      }),
    ];
    expect(averagePoints(entries, FIELDS, RULES)).toEqual({ avg: 15, matches_counted: 2 });
  });

  it('is null over nothing, never 0', () => {
    expect(averagePoints([], FIELDS, RULES)).toEqual({ avg: null, matches_counted: 0 });
    expect(averagePoints([engineEntry({ robot_status: 'disabled' })], FIELDS, RULES)).toEqual({
      avg: null,
      matches_counted: 0,
    });
  });
});

describe('rankByAveragePoints (interim rank until task 1.58)', () => {
  const teams = [
    { id: 't-a', number: 300 },
    { id: 't-b', number: 200 },
    { id: 't-c', number: 100 },
    { id: 't-d', number: 50 },
  ];

  it('ranks by average, ties to the lower number, and leaves a team with no counted entry unranked', () => {
    const entries = [
      engineEntry({ team_id: 't-a', data: { auto_notes: 2 } }), // 10
      engineEntry({ team_id: 't-b', data: { auto_notes: 4 } }), // 20
      engineEntry({ team_id: 't-c', data: { auto_notes: 4 } }), // 20, lower number
      engineEntry({ team_id: 't-d', robot_status: 'no_show' }), // not counted
      engineEntry({ team_id: 't-zz', data: { auto_notes: 99 } }), // not on the roster
    ];
    const ranks = rankByAveragePoints(entries, teams, FIELDS, RULES);
    expect(ranks.map((r) => [r.team_id, r.rank])).toEqual([
      ['t-c', 1],
      ['t-b', 2],
      ['t-a', 3],
      ['t-d', null],
    ]);
    expect(ranks.find((r) => r.team_id === 't-d')).toMatchObject({ avg: null, matches_counted: 0 });
  });

  it('ranks nobody when there are no entries', () => {
    expect(rankByAveragePoints([], teams, FIELDS, RULES).every((r) => r.rank === null)).toBe(true);
  });
});
