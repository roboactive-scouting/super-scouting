import type { MatchRow, MatchSlot, RosterRow, TeamRow } from '@frc/shared';

/** Test fixtures for the Matches tab and the phone matches view (RB.17). */

const ROSTER_TEAMS: [number, string][] = [
  [1574, 'MisCar'],
  [1690, 'Orbit'],
  [1937, 'Elysium'],
  [1943, 'NeatTeam'],
  [2096, 'RobActive'],
  [2231, 'OnyxTronix'],
  [2630, 'Thunderbolts'],
  [3075, 'Ha-Dream Team'],
  [3316, 'D-Bug'],
  [3339, 'BumbleB'],
  [4320, 'The Joker'],
  [4338, 'Falcons'],
  [4590, 'GreenBlitz'],
  [5135, 'Black Unicorns'],
  [5654, 'Phoenix'],
  [5951, 'Tiny Titans'],
  [5987, 'Galaxia'],
  [6230, 'Team Koi'],
  [6238, 'Iron Eagles'],
  [6738, 'Excalibur'],
  [7039, 'Ultimate'],
  [8175, 'Piece of Mind'],
];

export const tid = (n: number) => `t-${n}`;
export const T6230 = tid(6230);
export const T7845 = tid(7845);

export const ROSTER_22: RosterRow[] = ROSTER_TEAMS.map(([number, name]) => ({
  team_id: tid(number),
  number,
  name,
}));
export const ROSTER_IDS: ReadonlySet<string> = new Set(ROSTER_22.map((r) => r.team_id));

/** The whole registry: the roster plus 7845, which is in Q8's line-up but not on the roster. */
export const REGISTRY: TeamRow[] = [
  ...ROSTER_22.map((r) => ({ id: r.team_id, number: r.number, name: r.name })),
  { id: T7845, number: 7845, name: 'Rogue Robotics' },
].map((t) => ({ ...t, created_at: '', updated_at: '' }));

const ORDER: Array<[MatchSlot['alliance'], 1 | 2 | 3]> = [
  ['red', 1],
  ['red', 2],
  ['red', 3],
  ['blue', 1],
  ['blue', 2],
  ['blue', 3],
];

/** A qualification match from its six numbers, red 1 … blue 3 (0 = empty). */
export function qual(number: number, line: number[]): MatchRow {
  const slots = line.flatMap((team, i) => {
    const [alliance, station] = ORDER[i]!;
    return team ? [{ alliance, station, team_id: tid(team) }] : [];
  });
  return {
    id: `m-${number}`,
    event_id: 'ev-1',
    match_type: 'qualification',
    number,
    created_at: '',
    updated_at: '',
    slots,
  };
}

export const Q7_ONE_EMPTY = qual(7, [3339, 4320, 4590, 5135, 1943, 0]);
export const Q8_WITH_7845 = qual(8, [5987, 7845, 6738, 8175, 3075, 1574]);
export const Q9_FULL = qual(9, [5654, 2096, 6230, 4338, 7039, 1690]);
export const Q10_PARTIAL = qual(10, [5951, 1937, 0, 0, 0, 0]);
