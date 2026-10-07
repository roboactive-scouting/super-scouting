import { describe, expect, it, vi } from 'vitest';
import { formatTime } from '@frc/shared';
import type { LineupSlot } from '@/lib/derive/entries';
import type { Tile } from './LineupTiles';
import type { LocalEntry } from './localEntries';
import {
  allianceFor,
  flaggedNotInLineup,
  hhmm,
  resolveChoice,
  sideOf,
  type TeamLite,
} from './scoutChoice';

const tile = (station: Tile['station'], n: number, done: Tile['done'] = null): Tile => ({
  station,
  teamId: `t-${n}`,
  number: n,
  name: `Team ${n}`,
  done,
});
const tiles = [tile('R1', 1690), tile('B2', 5654), tile('B3', 7039, { locked: true, until: null })];
const roster: TeamLite[] = [
  { id: 't-3316', number: 3316, name: 'D-Bug' },
  { id: 't-1690', number: 1690, name: 'Orbit' },
];
const base = {
  key: 'qualification:39',
  tileKey: 'qualification:39:B2',
  valid: true,
  showLineup: true,
  tiles,
  station: 'B2' as const,
  tilePick: null,
  teamPick: null,
  alliance: 'blue' as const,
  roster,
  scouted: new Map<string, LocalEntry>(),
  isLocked: () => false,
};

describe('allianceFor', () => {
  it('uses the pick for this key, else the station side, else nothing', () => {
    expect(allianceFor({ key: 'k', side: 'red' }, 'k', 'B2')).toBe('red');
    expect(allianceFor({ key: 'other', side: 'red' }, 'k', 'B2')).toBe('blue');
    expect(allianceFor(null, 'k', 'R3')).toBe('red');
    expect(allianceFor(null, 'k', null)).toBeNull();
    expect(allianceFor(null, 'k', undefined)).toBeNull();
  });
});

describe('resolveChoice, in the line-up', () => {
  it('picks the remembered station by default', () => {
    const { chosen, selected } = resolveChoice(base);
    expect(selected).toBe('B2');
    expect(chosen).toMatchObject({ team: { number: 5654 }, side: 'blue' });
  });

  it('picks nothing when the remembered station is locked, or there is none', () => {
    expect(resolveChoice({ ...base, station: 'B3' })).toEqual({ selected: null });
    expect(resolveChoice({ ...base, station: null })).toEqual({ selected: null });
  });

  it('follows an explicit tile pick for this match, with the side of that tile', () => {
    const tilePick = { key: base.tileKey, station: 'R1' as const };
    const { chosen, selected } = resolveChoice({ ...base, tilePick });
    expect(selected).toBe('R1');
    expect(chosen).toMatchObject({ team: { number: 1690 }, side: 'red' });
  });

  it('ignores a tile pick made for another match or station', () => {
    const tilePick = { key: 'qualification:38:B2', station: 'R1' as const };
    expect(resolveChoice({ ...base, tilePick }).selected).toBe('B2');
  });
});

describe('resolveChoice, from the roster', () => {
  const fromRoster = { ...base, showLineup: false };
  const teamPick = { key: base.key, teamId: 't-3316' };

  it('needs a pick for this match, a valid match and an alliance', () => {
    expect(resolveChoice(fromRoster).chosen).toBeUndefined();
    expect(resolveChoice({ ...fromRoster, teamPick }).chosen).toMatchObject({
      team: { number: 3316 },
      side: 'blue',
    });
    expect(resolveChoice({ ...fromRoster, teamPick, alliance: null }).chosen).toBeUndefined();
    expect(resolveChoice({ ...fromRoster, teamPick, valid: false }).chosen).toBeUndefined();
    const other = { key: 'qualification:1', teamId: 't-3316' };
    expect(resolveChoice({ ...fromRoster, teamPick: other }).chosen).toBeUndefined();
  });

  it('never chooses a locked team', () => {
    expect(resolveChoice({ ...fromRoster, teamPick, isLocked: () => true }).chosen).toBeUndefined();
  });
});

describe('flaggedNotInLineup', () => {
  const slots: LineupSlot[] = [
    { match_id: 'm-1', team_id: 't-1690', alliance: 'red', station: 1 },
    { match_id: 'm-1', team_id: 't-5654', alliance: 'blue', station: 2 },
  ];
  const chosen = (id: string, side: 'red' | 'blue') => ({
    team: { id, number: 1, name: 'x' },
    side,
  });

  it('flags a team outside the alliance it is chosen on, only through "Team not here?"', () => {
    expect(flaggedNotInLineup(true, chosen('t-3316', 'blue'), slots, 'm-1')).toBe(true);
    expect(flaggedNotInLineup(true, chosen('t-5654', 'blue'), slots, 'm-1')).toBe(false);
    expect(flaggedNotInLineup(false, chosen('t-3316', 'blue'), slots, 'm-1')).toBe(false);
    expect(flaggedNotInLineup(true, undefined, slots, 'm-1')).toBe(false);
    expect(flaggedNotInLineup(true, chosen('t-3316', 'blue'), slots, undefined)).toBe(false);
  });
});

describe('sideOf', () => {
  it('maps a station to its alliance', () => {
    expect(sideOf('R3')).toBe('red');
    expect(sideOf('B1')).toBe('blue');
  });
});

describe('hhmm', () => {
  it('is 24-hour HH:MM like every other time in the app, whatever the device locale', () => {
    // A 12-hour device: the time must not follow it (Home and Entries use formatTime).
    const twelve = vi.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('1:05 PM');
    const d = new Date('2026-10-07T13:05:00Z');
    expect(hhmm(d)).toMatch(/^\d{2}:\d{2}$/);
    expect(hhmm(d)).toBe(formatTime(d.toISOString()));
    twelve.mockRestore();
  });
});
