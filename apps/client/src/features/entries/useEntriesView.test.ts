import { describe, expect, it } from 'vitest';
import {
  buildEntryRows,
  chipCounts,
  filterRows,
  kindCounts,
  kindRows,
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
  it('lists match and super entries newest first, and never another event’s or a deleted one', () => {
    const rows = buildEntryRows(
      source({
        entries: [
          entry('old', { match_id: 'm37', client_created_at: '2026-03-17T09:00:00.000Z' }),
          entry('new'),
          entry('other-event', { event_id: 'ev-2', client_created_at: '2026-03-17T11:00:00.000Z' }),
          entry('gone', { deleted_at: '2026-03-17T10:00:00.000Z' }),
          entry('super', {
            form_kind: 'super',
            match_id: null,
            alliance: null,
            robot_status: null,
            client_created_at: '2026-03-17T09:20:00.000Z',
          }),
        ],
      }),
    );
    expect(rows.map((r) => r.id)).toEqual(['new', 'super', 'old']);
    expect(rows[1]).toMatchObject({
      kind: 'super',
      matchLabel: '',
      status: null,
      points: null,
      notInLineup: false,
      look: false,
    });
    expect(rows[0]).toMatchObject({
      kind: 'match',
      matchLabel: 'Q38',
      teamNumber: 5951,
      teamName: 'Tiny Titans',
      status: 'played',
      scouter: 'Noa Levi',
      waiting: false,
      unsent: false,
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
        refusals: new Map([
          ['r', 'Changed after the 5-minute edit window. A lead can save it for you.'],
        ]),
      }),
    );
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.w).toMatchObject({ waiting: true, unsent: true, refused: null, look: false });
    expect(by.r).toMatchObject({
      waiting: false,
      unsent: true,
      refused: 'Changed after the 5-minute edit window. A lead can save it for you.',
      look: true,
    });
    expect(by.x).toMatchObject({ notInLineup: true, look: true });
  });

  it('falls back to the update time when an entry has no creation time', () => {
    const rows = buildEntryRows(
      source({ entries: [entry('a', { client_created_at: undefined })] }),
    );
    expect(rows[0]!.time).toBe(timeLabel('2026-03-17T09:41:00.000Z', NOW));
  });
});

describe('scouted points (SPEC-FINAL 13.3, 11.3)', () => {
  // A form whose active version is v2: entries on v1 are scored with v2's fields, as the server's
  // entry search scores them (task 1.50).
  const scoring = {
    forms: [{ id: 'f-1', kind: 'match', active_version_id: 'fv-2', deleted_at: null }],
    versions: [
      { id: 'fv-1', form_id: 'f-1', version_no: 1 },
      { id: 'fv-2', form_id: 'f-1', version_no: 2 },
    ],
    fields: [
      {
        id: 'ff-2',
        form_version_id: 'fv-2',
        key: 'auto_notes',
        label: 'Auto notes',
        type: 'counter',
        display_order: 1,
        phase: 'auto',
        config: { min: 0, max: 10, step: 1 },
        deprecated: false,
      },
    ],
    rules: [{ id: 'r-1', form_id: 'f-1', field_key: 'auto_notes', points: 4, option_points: null }],
  };

  it('scores each match row with the form’s active version and rules; "—" for a dead robot and a super entry', () => {
    const rows = buildEntryRows(
      source({
        scoring,
        entries: [
          entry('played', { form_version_id: 'fv-1', data: { auto_notes: 3 } }),
          entry('noshow', { form_version_id: 'fv-2', robot_status: 'no_show', data: {} }),
          entry('dis', {
            form_version_id: 'fv-2',
            robot_status: 'disabled',
            data: { auto_notes: 5 },
          }),
          entry('sup', { form_kind: 'super', form_version_id: 'fv-2', data: { auto_notes: 5 } }),
        ],
      }),
    );
    const by = Object.fromEntries(rows.map((r) => [r.id, r.points]));
    expect(by).toEqual({ played: 12, noshow: null, dis: null, sup: null });
  });
});

describe('the kind switch (26-entry-search final)', () => {
  const rows = buildEntryRows(
    source({
      entries: [
        entry('m1'),
        entry('s1', {
          form_kind: 'super',
          match_id: null,
          client_created_at: '2026-03-17T09:30:00.000Z',
        }),
        entry('s2', {
          form_kind: 'super',
          match_id: null,
          scouter_id: 'u-amit',
          client_created_at: '2026-03-17T09:20:00.000Z',
        }),
      ],
    }),
  );

  it('Super shows only super rows, Match only match rows, Both all of them', () => {
    expect(kindRows(rows, 'super').map((r) => r.id)).toEqual(['s1', 's2']);
    expect(kindRows(rows, 'super').every((r) => r.kind === 'super')).toBe(true);
    expect(kindRows(rows, 'match').map((r) => r.id)).toEqual(['m1']);
    expect(kindRows(rows, 'both')).toHaveLength(3);
  });

  it('counts each kind over what the search and the chip leave', () => {
    expect(kindCounts(rows)).toEqual({ both: 3, match: 1, super: 2 });
    expect(kindCounts(filterRows(rows, 'mine', 'u-noa'))).toEqual({ both: 2, match: 1, super: 1 });
    expect(chipCounts(kindRows(rows, 'super'), 'u-noa')).toMatchObject({ all: 2, mine: 1 });
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

  it('a refused entry still in the outbox counts as waiting to send, like the shell (RB.19)', () => {
    const withRefused = buildEntryRows(
      source({
        entries: [entry('w'), entry('r', { client_created_at: '2026-03-17T09:40:00.000Z' })],
        outboxIds: new Set(['w', 'r']),
        refusals: new Map([
          ['r', 'Changed after the 5-minute edit window. A lead can save it for you.'],
        ]),
      }),
    );
    expect(chipCounts(withRefused, 'u-noa')).toMatchObject({ waiting: 2, look: 1 });
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
