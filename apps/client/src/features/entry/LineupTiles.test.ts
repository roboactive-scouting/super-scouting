import { describe, expect, it } from 'vitest';
import type { LineupSlot } from '@/lib/derive/entries';
import { lineupTiles, tileSubline, type Tile } from './LineupTiles';

const team = (n: number) => ({ id: `t-${n}`, number: n, name: `Team ${n}` });
const teamById = new Map([1690, 5654, 3075].map((n) => [`t-${n}`, team(n)]));
const slot = (
  matchId: string,
  n: number,
  alliance: 'red' | 'blue',
  station: 1 | 2 | 3,
): LineupSlot => ({ match_id: matchId, team_id: `t-${n}`, alliance, station });
const none = () => null;

describe('tileSubline', () => {
  it('shows the team name until the robot is scouted', () => {
    expect(tileSubline({ name: 'Orbit', done: null })).toBe('Orbit');
  });

  it('says what this device holds for a scouted robot', () => {
    const done = (d: Tile['done']) => tileSubline({ name: 'Orbit', done: d });
    expect(done({ locked: true, until: null })).toBe('Scouted · locked');
    expect(done({ locked: false, until: '14:05' })).toBe('Scouted · edit until 14:05');
    expect(done({ locked: false, until: null })).toBe('Scouted');
  });
});

describe('lineupTiles', () => {
  const slots = [
    slot('m-1', 5654, 'blue', 2),
    slot('m-1', 1690, 'red', 1),
    slot('m-1', 3075, 'red', 3),
    slot('m-2', 3075, 'red', 1),
  ];

  it('is empty without a match, or for a match with no line-up', () => {
    expect(lineupTiles(slots, undefined, teamById, none)).toEqual([]);
    expect(lineupTiles(slots, 'm-9', teamById, none)).toEqual([]);
  });

  it('lists only that match, ordered by station (red before blue)', () => {
    const tiles = lineupTiles(slots, 'm-1', teamById, none);
    expect(tiles.map((t) => [t.station, t.number, t.name])).toEqual([
      ['B2', 5654, 'Team 5654'],
      ['R1', 1690, 'Team 1690'],
      ['R3', 3075, 'Team 3075'],
    ]);
  });

  it('skips a slot whose team is not on the device', () => {
    const tiles = lineupTiles([slot('m-1', 9999, 'red', 2), ...slots], 'm-1', teamById, none);
    expect(tiles).toHaveLength(3);
  });

  it('carries what the device holds for each robot', () => {
    const tiles = lineupTiles(slots, 'm-1', teamById, (id) =>
      id === 't-1690' ? { locked: true, until: null } : null,
    );
    expect(tiles.find((t) => t.number === 1690)?.done).toEqual({ locked: true, until: null });
    expect(tiles.find((t) => t.number === 5654)?.done).toBeNull();
  });
});
