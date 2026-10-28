import { describe, expect, it } from 'vitest';
import type { RankRow, RankSortStep } from '@frc/shared';
import {
  addStep,
  availabilityLabel,
  DEFAULT_SORT,
  figureText,
  headerClick,
  moveStep,
  ordinal,
  phasePlace,
  phaseShare,
  removeStep,
  setStepBest,
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
