import { describe, expect, it } from 'vitest';
import {
  agoText,
  coverageCells,
  lastEntryOf,
  missingLine,
  phoneSyncLine,
  syncNote,
  versionLine,
} from './homeData';

const NOW = Date.parse('2026-10-07T09:10:00.000Z');
const at = (min: number) => new Date(NOW - min * 60_000).toISOString();
const matches = [
  { id: 'm1', event_id: 'e', match_type: 'qualification', number: 1 },
  { id: 'm2', event_id: 'e', match_type: 'qualification', number: 2 },
  { id: 'p1', event_id: 'e', match_type: 'practice', number: 1 },
  { id: 'x1', event_id: 'other', match_type: 'qualification', number: 3 },
];
const teams = [{ id: 't1', number: 5951, name: 'Tiny Titans' }];
const entry = (id: string, scouter: string, min: number, extra: object = {}) => ({
  id,
  event_id: 'e',
  match_id: 'm2',
  team_id: 't1',
  alliance: 'blue' as const,
  scouter_id: scouter,
  client_created_at: at(min),
  ...extra,
});

describe('lastEntryOf', () => {
  it('is my newest live match entry at this event, named', () => {
    const entries = [
      entry('a', 'me', 30),
      entry('b', 'me', 2),
      entry('c', 'other', 1),
      entry('d', 'me', 0, { deleted_at: '2026-10-07T09:09:00Z' }),
      entry('f', 'me', 0, { event_id: 'other' }),
    ];
    expect(lastEntryOf(entries, matches, teams, 'e', 'me')).toMatchObject({
      matchId: 'm2',
      match: 'Q2',
      teamNumber: 5951,
      teamName: 'Tiny Titans',
      at: at(2),
    });
  });
  it('is null when I have none', () => {
    expect(lastEntryOf([entry('c', 'other', 1)], matches, teams, 'e', 'me')).toBeNull();
  });
});

describe('coverageCells', () => {
  it('covers only this event’s qualification matches, labelled', () => {
    const cells = coverageCells(matches, [], [], 'e');
    expect(cells.map((c) => c.label)).toEqual(['Q1', 'Q2']);
    expect(cells.every((c) => c.state === 'none')).toBe(true);
  });
});

describe('copy', () => {
  it('agoText', () => {
    expect(agoText(at(0), NOW)).toBe('1 min ago');
    expect(agoText(at(2), NOW)).toBe('2 min ago');
    expect(agoText(at(185), NOW)).toBe('3 h ago');
    expect(agoText('2026-03-17T09:00:00.000Z', NOW)).toMatch(/^\d\d\/03\/2026$/);
  });
  it('syncNote', () => {
    expect(syncNote({ waiting: 3, lastSyncAt: null })).toBe('Sends when online');
    expect(syncNote({ waiting: 0, lastSyncAt: null })).toBe('');
    expect(syncNote({ waiting: 3, lastSyncAt: at(2) })).toMatch(
      /^Last sync \d\d:\d\d · sends when online$/,
    );
  });
  it('phoneSyncLine', () => {
    expect(phoneSyncLine({ waiting: 3, lastSyncAt: null })).toBe('3 entries waiting to send');
    expect(phoneSyncLine({ waiting: 1, lastSyncAt: null })).toBe('1 entry waiting to send');
    expect(phoneSyncLine({ waiting: 0, lastSyncAt: at(1) })).toMatch(
      /^Everything is sent · last sync \d\d:\d\d$/,
    );
  });
  it('versionLine', () => {
    expect(versionLine('1.4.0', '2026-10-02', true)).toBe('version 1.4.0 · 2026-10-02');
    expect(versionLine('1.4.0', '2026-10-02', false)).toBe('version 1.4.0');
    expect(versionLine('1.4.0', '', true)).toBe('version 1.4.0');
  });
  it('missingLine', () => {
    expect(missingLine(1)).toBe('1 match is missing a robot');
    expect(missingLine(4)).toBe('4 matches are missing a robot');
  });
});
