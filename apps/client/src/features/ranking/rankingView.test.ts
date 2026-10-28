import { describe, expect, it } from 'vitest';
import type { FieldPhase, RankRow, RankSortStep } from '@frc/shared';
import {
  addStep,
  availabilityLabel,
  categoryOptions,
  DEFAULT_SORT,
  figureScale,
  figureShade,
  figureText,
  headerClick,
  moveStep,
  ordinal,
  phasePlace,
  phaseShare,
  removeStep,
  setStepBest,
  sortScales,
  sortFigures,
  sortSentence,
  spreadScale,
  statusMarks,
  statusSpread,
  tieBreakers,
  typicalRange,
} from './rankingView';

const row = (over: Partial<RankRow>): RankRow => ({
  team_id: 't',
  number: 1,
  name: 'T',
  rank: 1,
  average_points: 80,
  stddev: 20,
  phase_averages: [
    { phase: 'auto', average: 8 },
    { phase: 'teleop', average: 48 },
    { phase: 'endgame', average: 24 },
  ],
  matches_counted: 10,
  breakdowns: 3,
  no_shows: 1,
  disabled: 2,
  availability_rate: 10 / 13,
  recent_totals: [70, 80, 90],
  last_counted_match: 30,
  ...over,
});
const empty = row({
  rank: null,
  average_points: null,
  stddev: null,
  phase_averages: [
    { phase: 'auto', average: null },
    { phase: 'teleop', average: null },
    { phase: 'endgame', average: null },
  ],
  matches_counted: 0,
  breakdowns: 0,
  no_shows: 0,
  disabled: 0,
  availability_rate: null,
});

describe('the ranking’s words and sort (task 1.58)', () => {
  it('says a sort as the design does', () => {
    expect(sortSentence(DEFAULT_SORT.scoring)).toBe('Total, best first');
    expect(
      sortSentence([
        { key: 'availability_rate', direction: 'desc' },
        { key: 'breakdowns', direction: 'asc' },
      ]),
    ).toBe('Availability, best first · then Breakdowns, fewest first');
    expect(sortSentence([{ key: 'no_shows', direction: 'desc' }])).toBe('No-shows, most first');
    expect(sortSentence([{ key: 'teleop_points', direction: 'asc' }])).toBe('Teleop, worst first');
  });

  it('makes a clicked header the whole sort, best first; the same one alone reverses', () => {
    const two: RankSortStep[] = [
      { key: 'availability_rate', direction: 'desc' },
      { key: 'breakdowns', direction: 'asc' },
    ];
    expect(headerClick(two, 'breakdowns')).toEqual([{ key: 'breakdowns', direction: 'asc' }]);
    expect(headerClick(two, 'availability_rate')).toEqual([
      { key: 'availability_rate', direction: 'desc' },
    ]);
    expect(headerClick([{ key: 'breakdowns', direction: 'asc' }], 'breakdowns')).toEqual([
      { key: 'breakdowns', direction: 'desc' },
    ]);
  });

  it('edits a sort: add once, remove but never the last, flip, move', () => {
    let sort = addStep(DEFAULT_SORT.availability, 'breakdowns');
    expect(addStep(sort, 'breakdowns')).toEqual(sort);
    sort = setStepBest(sort, 'breakdowns', false);
    expect(sort[1]).toEqual({ key: 'breakdowns', direction: 'desc' });
    expect(moveStep(sort, 1, 0).map((s) => s.key)).toEqual(['breakdowns', 'availability_rate']);
    expect(moveStep(sort, 0, 5)).toEqual(sort);
    expect(removeStep(sort, 'availability_rate').map((s) => s.key)).toEqual(['breakdowns']);
    expect(removeStep([{ key: 'disabled', direction: 'asc' }], 'disabled')).toHaveLength(1);
  });

  it('offers only the open category’s figures, and never Consistency', () => {
    const phases = ['auto', 'teleop', 'endgame', 'post_match'] as const;
    expect(sortFigures('scoring', phases).map((f) => f.label)).toEqual([
      'Total',
      'Auto',
      'Teleop',
      'Endgame',
      'Post-match',
    ]);
    expect(tieBreakers('availability', [], DEFAULT_SORT.availability).map((f) => f.key)).toEqual([
      'breakdowns',
      'no_shows',
      'disabled',
    ]);
    for (const category of ['scoring', 'availability'] as const) {
      const keys = sortFigures(category, phases).map((f) => f.key as string);
      expect(keys).not.toContain('stddev');
      expect(keys).not.toContain('matches_counted');
    }
  });
  it('names the Scoring segment’s columns from the season’s scoring phases (review Minor 11)', () => {
    const holds = (phases: readonly FieldPhase[]) =>
      categoryOptions(phases).map((c) => `${c.name}: ${c.holds}`);
    expect(holds(['auto', 'teleop', 'endgame'])).toEqual([
      'Scoring: Total · Auto · Teleop · Endgame · Consistency',
      'Availability: Availability · Breakdowns · No-shows · Disabled',
    ]);
    // A form that scores post_match and has no endgame names its own columns.
    expect(holds(['auto', 'teleop', 'post_match'])[0]).toBe(
      'Scoring: Total · Auto · Teleop · Post-match · Consistency',
    );
    expect(holds(['teleop'])[0]).toBe('Scoring: Total · Teleop · Consistency');
  });
});

describe('a row in words (task 1.58)', () => {
  it('prints one decimal, whole percents and counts; no data is "—", never 0', () => {
    expect(figureText(row({ average_points: 81.25 }), 'average_points')).toBe('81.3');
    expect(figureText(row({}), 'teleop_points')).toBe('48');
    expect(figureText(row({ availability_rate: 0.9 }), 'availability_rate')).toBe('90%');
    expect(figureText(row({}), 'breakdowns')).toBe('3');
    for (const key of [
      'average_points',
      'auto_points',
      'availability_rate',
      'breakdowns',
    ] as const) {
      expect(figureText(empty, key)).toBe('—');
    }
    // A team that only ever no-showed has data: 0 % available, 2 no-shows.
    const absent = { ...empty, no_shows: 2, availability_rate: 0 };
    expect(figureText(absent, 'availability_rate')).toBe('0%');
    expect(figureText(absent, 'average_points')).toBe('—');
  });

  it('spreads the scouted matches: Played = counted − breakdowns, never the schedule', () => {
    expect(statusSpread(row({}))).toEqual({ played: 7, broke_down: 3, disabled: 2, no_show: 1 });
    expect(statusMarks(row({}))).toEqual([
      'broke_down',
      'broke_down',
      'broke_down',
      'disabled',
      'disabled',
      'no_show',
    ]);
    expect(statusMarks(row({ breakdowns: 0, disabled: 0, no_shows: 0 }))).toEqual([]);
    expect(spreadScale([row({}), empty])).toEqual({ onField: 10, missed: 3 });
    expect(spreadScale([empty])).toEqual({ onField: 1, missed: 1 });
    expect(
      availabilityLabel(row({ availability_rate: 1, breakdowns: 1, disabled: 0, no_shows: 0 })),
    ).toBe('Availability 100% · 1 breakdown · 0 disabled · 0 no-shows');
  });

  it('gives the study its share, place and typical range', () => {
    const a = row({ team_id: 'a' });
    const b = row({
      team_id: 'b',
      average_points: 40,
      stddev: 5,
      phase_averages: [
        { phase: 'auto', average: 20 },
        { phase: 'teleop', average: 10 },
        { phase: 'endgame', average: 10 },
      ],
    });
    expect(phaseShare(a, 'teleop')).toBe('60%');
    expect(phaseShare(empty, 'teleop')).toBe('—');
    expect(phasePlace([a, b, empty], a, 'auto')).toBe(2);
    expect(phasePlace([a, b, empty], a, 'teleop')).toBe(1);
    expect(phasePlace([a, b, empty], empty, 'teleop')).toBeNull();
    expect(typicalRange([a, b], a)).toEqual({ low: 60, high: 100, mean: 80, axisMax: 100 });
    expect(typicalRange([a, b], row({ average_points: 4, stddev: 9 }))!.low).toBe(0);
    expect(typicalRange([a], empty)).toBeNull();
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
    ]);
  });
});

describe('value shading scales (task 1.59; SPEC-FINAL 12.6)', () => {
  const lo = row({
    team_id: 'lo',
    average_points: 20,
    phase_averages: [
      { phase: 'auto', average: 2 },
      { phase: 'teleop', average: 10 },
      { phase: 'endgame', average: 8 },
    ],
    breakdowns: 0,
    no_shows: 0,
    disabled: 4,
    availability_rate: 0.5,
  });
  const hi = row({
    team_id: 'hi',
    average_points: 60,
    phase_averages: [
      { phase: 'auto', average: 6 },
      { phase: 'teleop', average: 40 },
      { phase: 'endgame', average: 14 },
    ],
    breakdowns: 5,
    no_shows: 2,
    disabled: 0,
    availability_rate: 0.9,
  });
  const rows = [lo, hi, empty];

  it('runs Total and each phase over the observed min–max, higher is better', () => {
    expect(figureScale(rows, 'average_points')).toEqual({
      domain: { kind: 'range', min: 20, max: 60 },
      direction: 'higher_is_better',
    });
    expect(figureScale(rows, 'teleop_points')).toEqual({
      domain: { kind: 'range', min: 10, max: 40 },
      direction: 'higher_is_better',
    });
  });

  it('leaves a row with no data, or no value, out of the domain', () => {
    // `empty` holds null everywhere: it would drag a min of 0 in if it counted.
    expect(figureScale(rows, 'auto_points')!.domain).toEqual({ kind: 'range', min: 2, max: 6 });
    // A counted row whose phase is null does not count either.
    const noPhase = row({
      team_id: 'np',
      phase_averages: [
        { phase: 'auto', average: null },
        { phase: 'teleop', average: 99 },
        { phase: 'endgame', average: 1 },
      ],
    });
    expect(figureScale([lo, hi, noPhase], 'auto_points')!.domain).toEqual({
      kind: 'range',
      min: 2,
      max: 6,
    });
  });

  it('fixes Availability at 0–100 %, whatever the rows hold', () => {
    const scale = figureScale([lo, hi], 'availability_rate')!;
    expect(scale).toEqual({ domain: { kind: 'rate' }, direction: 'higher_is_better' });
    expect(figureShade(lo, 'availability_rate', scale)!.position).toBeCloseTo(0.5, 6);
    expect(figureShade(hi, 'availability_rate', scale)!.position).toBeCloseTo(0.9, 6);
  });

  it('reverses the problem counts over their observed min–max: the fewest is the darkest', () => {
    for (const key of ['breakdowns', 'no_shows', 'disabled'] as const) {
      expect(figureScale(rows, key)!.direction, key).toBe('lower_is_better');
    }
    const scale = figureScale(rows, 'breakdowns')!;
    expect(scale.domain).toEqual({ kind: 'range', min: 0, max: 5 });
    expect(figureShade(lo, 'breakdowns', scale)!.mix).toBe(52);
    expect(figureShade(hi, 'breakdowns', scale)!.mix).toBe(6);
  });

  it('reads Matches counted as more is better; the team number has no scale', () => {
    expect(figureScale(rows, 'matches_counted')!.direction).toBe('higher_is_better');
    expect(figureScale(rows, 'number')).toBeNull();
  });

  it('shades the best Total darkest and the worst palest, and a no-data row not at all', () => {
    const scale = figureScale(rows, 'average_points')!;
    expect(figureShade(hi, 'average_points', scale)!.mix).toBe(52);
    expect(figureShade(lo, 'average_points', scale)!.mix).toBe(6);
    expect(figureShade(empty, 'average_points', scale)).toBeNull();
    expect(figureShade(empty, 'breakdowns', figureScale(rows, 'breakdowns')!)).toBeNull();
  });

  it('is flat when every value is equal or there is a single one', () => {
    expect(figureShade(lo, 'average_points', figureScale([lo], 'average_points')!)!.flat).toBe(
      true,
    );
    const twin = row({ team_id: 'twin', breakdowns: lo.breakdowns });
    const scale = figureScale([lo, twin], 'breakdowns')!;
    expect(figureShade(lo, 'breakdowns', scale)!.flat).toBe(true);
    // Every row without data: no cell is shaded, the scale is a point.
    expect(figureScale([empty], 'average_points')!.domain).toEqual({
      kind: 'range',
      min: 0,
      max: 0,
    });
  });

  it('builds the scales of a whole sort, one per figure in it, never Consistency', () => {
    const scales = sortScales(rows, [
      { key: 'availability_rate', direction: 'desc' },
      { key: 'breakdowns', direction: 'asc' },
    ]);
    expect(Object.keys(scales).sort()).toEqual(['availability_rate', 'breakdowns']);
    expect(Object.keys(sortScales(rows, DEFAULT_SORT.scoring))).toEqual(['average_points']);
  });
});
