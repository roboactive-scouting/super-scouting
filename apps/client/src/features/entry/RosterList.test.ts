import { describe, expect, it } from 'vitest';
import type { LineupSlot } from '@/lib/derive/entries';
import { rosterItems } from './RosterList';

const roster = [
  { id: 't-1690', number: 1690, name: 'Orbit' },
  { id: 't-3316', number: 3316, name: 'D-Bug' },
  { id: 't-254', number: 254, name: 'Cheesy Poofs' },
];
const slots: LineupSlot[] = [
  { match_id: 'm-1', team_id: 't-1690', alliance: 'red', station: 1 },
  { match_id: 'm-2', team_id: 't-3316', alliance: 'blue', station: 2 },
];
const none = () => null;

describe('rosterItems', () => {
  it('shows the name, and the place in the typed match for a line-up team', () => {
    const items = rosterItems(roster, slots, 'm-1', none);
    expect(items.map((i) => i.detail)).toEqual([
      'Orbit · in this match, Red 1',
      'D-Bug',
      'Cheesy Poofs',
    ]);
    expect(items.every((i) => !i.locked)).toBe(true);
  });

  it('shows only names when the match is unknown or has no line-up', () => {
    expect(rosterItems(roster, slots, undefined, none).map((i) => i.detail)).toEqual([
      'Orbit',
      'D-Bug',
      'Cheesy Poofs',
    ]);
    expect(rosterItems(roster, slots, 'm-9', none)[0]?.detail).toBe('Orbit');
  });

  it('says what the device holds for a scouted team, and locks it only after the window', () => {
    const items = rosterItems(roster, slots, 'm-1', (id) => {
      if (id === 't-1690') return { locked: true, until: null };
      if (id === 't-3316') return { locked: false, until: '14:05' };
      return null;
    });
    expect(items[0]).toMatchObject({ detail: 'Scouted · locked', locked: true });
    expect(items[1]).toMatchObject({ detail: 'Scouted · edit until 14:05', locked: false });
    expect(items[2]).toMatchObject({ detail: 'Cheesy Poofs', locked: false });
  });

  it('keeps the roster order and the team numbers', () => {
    expect(rosterItems(roster, slots, 'm-1', none).map((i) => i.number)).toEqual([1690, 3316, 254]);
  });
});
