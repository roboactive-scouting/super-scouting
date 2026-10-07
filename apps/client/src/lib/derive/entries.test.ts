import { describe, expect, it } from 'vitest';
import {
  matchesSearch,
  needsLook,
  newestFirst,
  notInLineup,
  stationOf,
  type LineupSlot,
} from './entries';

const SLOTS: LineupSlot[] = [
  { match_id: 'm37', team_id: 't5654', alliance: 'blue', station: 2 },
  { match_id: 'm37', team_id: 't1690', alliance: 'red', station: 2 },
];

describe('entry derivations', () => {
  it('finds the station a team holds in a match', () => {
    expect(stationOf(SLOTS, 'm37', 't5654')).toBe('B2');
    expect(stationOf(SLOTS, 'm37', 't3316')).toBeNull();
  });
  it('flags a team outside its alliance line-up, but not when the match has no line-up', () => {
    expect(notInLineup(SLOTS, 'm37', 't3316', 'blue')).toBe(true);
    expect(notInLineup(SLOTS, 'm37', 't1690', 'blue')).toBe(true);
    expect(notInLineup(SLOTS, 'm37', 't5654', 'blue')).toBe(false);
    expect(notInLineup(SLOTS, 'm99', 't3316', 'red')).toBe(false);
  });
  it('needs a look when refused or not in line-up', () => {
    expect(
      needsLook(
        { id: 'e1', match_id: 'm37', team_id: 't5654', alliance: 'blue' },
        SLOTS,
        new Set(['e1']),
      ),
    ).toBe(true);
    expect(
      needsLook(
        { id: 'e2', match_id: 'm37', team_id: 't3316', alliance: 'blue' },
        SLOTS,
        new Set(),
      ),
    ).toBe(true);
    expect(
      needsLook(
        { id: 'e3', match_id: 'm37', team_id: 't5654', alliance: 'blue' },
        SLOTS,
        new Set(),
      ),
    ).toBe(false);
  });
  it('orders newest first without mutating', () => {
    const rows = [
      { client_created_at: '2026-10-06T09:00:00Z' },
      { client_created_at: '2026-10-06T11:00:00Z' },
    ];
    expect(newestFirst(rows)[0]!.client_created_at).toBe('2026-10-06T11:00:00Z');
    expect(rows[0]!.client_created_at).toBe('2026-10-06T09:00:00Z');
  });
  it('searches team number by prefix and names by substring, any case', () => {
    expect(matchesSearch('59', [5951, 'Tiny Titans'])).toBe(true);
    expect(matchesSearch('titans', [5951, 'Tiny Titans'])).toBe(true);
    expect(matchesSearch('noa', ['Noa Levi'])).toBe(true);
    expect(matchesSearch('', [1])).toBe(true);
    expect(matchesSearch('95', [5951])).toBe(false);
  });
});
