import { describe, expect, it } from 'vitest';
import {
  buildEntryRows,
  chipCounts,
  filterRows,
  searchRows,
  timeLabel,
  type EntriesSource,
} from './useEntriesView';

const NOW = new Date('2026-03-17T12:00:00.000Z');
const entry = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  event_id: 'ev',
  match_id: 'm38',
  team_id: 't5951',
  alliance: 'blue',
  scouter_id: 'u-noa',
  robot_status: 'played',
  deleted_at: null,
  client_created_at: '2026-03-17T09:41:00.000Z',
  client_updated_at: '2026-03-17T09:41:00.000Z',
  ...over,
});

function source(over: Partial<EntriesSource> = {}): EntriesSource {
  return {
    eventId: 'ev',
    entries: [],
    matches: [
      { id: 'm37', match_type: 'qualification', number: 37 },
      { id: 'm38', match_type: 'qualification', number: 38 },
    ],
    teams: [
      { id: 't5951', number: 5951, name: 'Tiny Titans' },
      { id: 't3316', number: 3316, name: 'D-Bug' },
    ],
    users: [
      { id: 'u-noa', full_name: 'Noa Levi' },
      { id: 'u-amit', full_name: 'Amit Ben-David' },
    ],
    slots: [
      { match_id: 'm38', team_id: 't5951', alliance: 'blue', station: 2 },
      { match_id: 'm37', team_id: 't5951', alliance: 'blue', station: 1 },
    ],
    refusals: new Map(),
    outboxIds: new Set(),
    now: NOW,
    ...over,
  };
}

describe('buildEntryRows', () => {
  it('lists newest first and drops other events, deleted and super entries', () => {
    const rows = buildEntryRows(
      source({
        entries: [
          entry('old', { match_id: 'm37', client_created_at: '2026-03-17T09:00:00.000Z' }),
          entry('new'),
          entry('other-event', { event_id: 'ev-2' }),
          entry('gone', { deleted_at: '2026-03-17T10:00:00.000Z' }),
          entry('super', { form_kind: 'super' }),
        ],
      }),
    );
    expect(rows.map((r) => r.id)).toEqual(['new', 'old']);
    expect(rows[0]).toMatchObject({
      matchLabel: 'Q38',
      station: 'B2',
      teamNumber: 5951,
      teamName: 'Tiny Titans',
      status: 'played',
      scouter: 'Noa Levi',
      waiting: false,
      refused: null,
      notInLineup: false,
      look: false,
    });
  });

  it('marks waiting, refused (never both) and not-in-line-up', () => {
    const rows = buildEntryRows(
      source({
        entries: [
          entry('w', { client_created_at: '2026-03-17T09:43:00.000Z' }),
          entry('r', { client_created_at: '2026-03-17T09:42:00.000Z' }),
          entry('x', { team_id: 't3316', client_created_at: '2026-03-17T09:41:00.000Z' }),
        ],
        outboxIds: new Set(['w', 'r']),
        refusals: new Map([['r', 'This entry is locked — ask a lead']]),
      }),
    );
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.w).toMatchObject({ waiting: true, refused: null, look: false });
    expect(by.r).toMatchObject({
      waiting: false,
      refused: 'This entry is locked — ask a lead',
      look: true,
    });
    expect(by.x).toMatchObject({ notInLineup: true, station: null, look: true });
  });

  it('falls back to the update time when an entry has no creation time', () => {
    const rows = buildEntryRows(
      source({ entries: [entry('a', { client_created_at: undefined })] }),
    );
    expect(rows[0]!.time).toBe(timeLabel('2026-03-17T09:41:00.000Z', NOW));
  });
});

describe('timeLabel', () => {
  it('is a dash when the entry has neither a creation nor an update time', () => {
    expect(timeLabel('', NOW)).toBe('—');
    const rows = buildEntryRows(
      source({
        entries: [entry('a', { client_created_at: undefined, client_updated_at: undefined })],
      }),
    );
    expect(rows[0]!.time).toBe('—');
  });

  it('is the time alone today and the date and time on another day', () => {
    expect(timeLabel('2026-03-17T09:41:00.000Z', NOW)).toMatch(/^\d{2}:\d{2}$/);
    expect(timeLabel('2026-03-16T09:41:00.000Z', NOW)).toMatch(/^16\/03\/2026 \d{2}:\d{2}$/);
  });
});

describe('search, filter and counts', () => {
  const rows = buildEntryRows(
    source({
      entries: [
        entry('a', { client_created_at: '2026-03-17T09:43:00.000Z' }),
        entry('b', {
          scouter_id: 'u-amit',
          team_id: 't3316',
          match_id: 'm37',
          client_created_at: '2026-03-17T09:42:00.000Z',
        }),
      ],
      outboxIds: new Set(['a']),
    }),
  );

  it('searches by team number, team name, match and scouter', () => {
    expect(searchRows(rows, '59').map((r) => r.id)).toEqual(['a']);
    expect(searchRows(rows, 'd-bug').map((r) => r.id)).toEqual(['b']);
    expect(searchRows(rows, 'q37').map((r) => r.id)).toEqual(['b']);
    expect(searchRows(rows, 'amit').map((r) => r.id)).toEqual(['b']);
    expect(searchRows(rows, '')).toHaveLength(2);
  });

  it('filters to mine, waiting and needs a look', () => {
    expect(filterRows(rows, 'mine', 'u-noa').map((r) => r.id)).toEqual(['a']);
    expect(filterRows(rows, 'waiting', 'u-noa').map((r) => r.id)).toEqual(['a']);
    expect(filterRows(rows, 'look', 'u-noa').map((r) => r.id)).toEqual(['b']);
  });

  it('counts follow the search', () => {
    expect(chipCounts(rows, 'u-noa')).toEqual({ all: 2, mine: 1, waiting: 1, look: 1 });
    expect(chipCounts(searchRows(rows, 'Noa'), 'u-noa')).toEqual({
      all: 1,
      mine: 1,
      waiting: 1,
      look: 0,
    });
  });
});
