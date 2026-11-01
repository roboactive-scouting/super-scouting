import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rankByAveragePoints } from '@frc/shared';
import type * as Shared from '@frc/shared';
import { db } from '@/data/db';
import { EVENT_ID, EVENT_NAME, seedTeamCache } from '@/test/teamSearchFixtures';
import {
  loadCachedTeamSearch,
  matchSpan,
  monthYear,
  orderTeams,
  shortEventName,
  teamHit,
  teamView,
  type TeamItem,
} from './teamSearch';

// The real helper, watched: the device must rank through it, never through a copy of it.
vi.mock('@frc/shared', async (original) => {
  const actual = await original<typeof Shared>();
  return { ...actual, rankByAveragePoints: vi.fn(actual.rankByAveragePoints) };
});

const item = (over: Partial<TeamItem> & Pick<TeamItem, 'id' | 'number'>): TeamItem => ({
  name: `Team ${over.number}`,
  in_active_event: true,
  rank: null,
  entries_here: 0,
  other_events: [],
  ...over,
});

describe('team search rules (SPEC-FINAL 13.2, task 1.51)', () => {
  it('matches a name anywhere (any case) and a number by its start, as the server does', () => {
    const orbit = { number: 1690, name: 'Orbit' };
    expect(teamHit(orbit, '')).toBe(true);
    expect(teamHit(orbit, 'orb')).toBe(true);
    expect(teamHit(orbit, 'BIT')).toBe(true);
    expect(teamHit(orbit, '16')).toBe(true);
    expect(teamHit(orbit, '69')).toBe(false);
    expect(teamHit({ number: 254, name: 'The 1690 fans' }, '1690')).toBe(true);
  });

  it('orders at-event teams by rank, unranked last by number, then the others by number', () => {
    const ordered = orderTeams([
      item({ id: 'a', number: 9000, in_active_event: false }),
      item({ id: 'b', number: 5000, rank: null }),
      item({ id: 'c', number: 4000, rank: 2 }),
      item({ id: 'd', number: 100, in_active_event: false }),
      item({ id: 'e', number: 6000, rank: 1 }),
      item({ id: 'f', number: 3000, rank: null }),
    ]);
    expect(ordered.map((t) => t.id)).toEqual(['e', 'c', 'f', 'b', 'd', 'a']);
  });

  it('counts every chip for the query, whichever chip is on', () => {
    const items = [
      item({ id: 'a', number: 7039, rank: 1 }),
      item({ id: 'b', number: 7112, rank: 2 }),
      item({ id: 'c', number: 7845, in_active_event: false }),
      item({ id: 'd', number: 1690, rank: 3 }),
    ];
    const at = teamView(items, '7', 'at_event');
    expect(at.rows.map((t) => t.id)).toEqual(['a', 'b']);
    expect(at.counts).toEqual({ all: 3, at_event: 2, other: 1 });
    expect(teamView(items, '7', 'other').rows.map((t) => t.id)).toEqual(['c']);
    expect(teamView(items, '', 'all').counts).toEqual({ all: 4, at_event: 3, other: 1 });
  });

  it('says events and months as the design does', () => {
    expect(shortEventName('District #3 · Tel Aviv')).toBe('District #3');
    expect(shortEventName('Israel Championship')).toBe('Israel Championship');
    expect(monthYear('2026-03-17T08:00:00.000Z')).toBe('Mar 2026');
  });

  it('finds the part to highlight: a number by its start, a name anywhere', () => {
    expect(matchSpan('3075', '30', 'number')).toEqual(['', '30', '75']);
    expect(matchSpan('1690', 'orb', 'number')).toBeNull();
    expect(matchSpan('Ha-Dream', 'dream', 'name')).toEqual(['Ha-', 'Dream', '']);
    expect(matchSpan('Orbit', '', 'name')).toBeNull();
  });
});

describe('the device’s list (offline is the normal mode at a venue)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seedTeamCache();
  });

  it('lists every cached season team, ranked at the event by the shared helper', async () => {
    const out = await loadCachedTeamSearch(EVENT_ID);
    expect(out.eventName).toBe(EVENT_NAME);
    expect(out.seasonYear).toBe(2026);
    expect(out.items.map((t) => [t.number, t.in_active_event, t.rank])).toEqual([
      [2096, true, 1],
      [1577, true, 2],
      [5987, true, 3],
      [4590, true, 4],
      [1690, true, null],
      [3339, false, null],
    ]);
    // Entries of both kinds and every status count as entries here; the no-show is one.
    expect(out.items.find((t) => t.number === 5987)?.entries_here).toBe(2);
    expect(out.items.find((t) => t.number === 1690)?.entries_here).toBe(0);
    expect(out.items.every((t) => t.other_events.length === 0)).toBe(true);
  });

  it('ranks through rankByAveragePoints itself, never a second implementation', async () => {
    vi.mocked(rankByAveragePoints).mockClear();
    await loadCachedTeamSearch(EVENT_ID);
    expect(rankByAveragePoints).toHaveBeenCalledTimes(1);
    const [entries, teams, fields, rules] = vi.mocked(rankByAveragePoints).mock.calls[0]!;
    // The roster only, the event's live match entries only, the active version and its rules.
    expect(teams.map((t) => t.number).sort()).toEqual([1577, 1690, 2096, 4590, 5987]);
    expect(entries).toHaveLength(6);
    expect(entries.every((e) => e.event_id === EVENT_ID && e.match_type === 'qualification')).toBe(
      true,
    );
    expect(fields.map((f) => f.key)).toEqual(['notes']);
    expect(rules).toEqual([{ field_key: 'notes', points: 5, option_points: null }]);
  });

  it('never ranks a team on a no-show: Galaxia’s average is its one played match', async () => {
    const out = await loadCachedTeamSearch(EVENT_ID);
    // 10 points (rank 3) above GreenBlitz's 5 (rank 4): a no-show zero would have sunk it.
    expect(out.items.find((t) => t.number === 5987)?.rank).toBe(3);
  });
});
