import { beforeEach, describe, expect, it } from 'vitest';
import type { ConflictItem, SettledConflict } from '@frc/shared';
import { db } from '@/data/db';
import {
  cardOf,
  diffOf,
  localMidnight,
  readCacheLookups,
  readCachedConflicts,
  readCardContext,
  sameValue,
  settledLineOf,
} from './conflictsView';

const T = (hm: string) => `2026-11-14T${hm}:00+00:00`;

/** One conflict pair, as the device caches it after a pull (the server's columns). */
const ENTRY_LIVE = {
  entity: 'scouting_entries' as const,
  id: 'e-live',
  event_id: 'ev-1',
  form_kind: 'match',
  team_id: 't-2096',
  match_id: 'm-12',
  alliance: 'red',
  scouter_id: 'u-dana',
  form_version_id: 'fv-1',
  robot_status: 'broke_down',
  breakdown_seconds: 52,
  data: { teleop_notes: 7, endgame_climb: 'high', auto_notes: 3, log: [{ t: 1 }] },
  client_updated_at: T('09:09'),
  version: 3,
  deleted_at: null,
};
const ENTRY_A = {
  ...ENTRY_LIVE,
  id: 'e-a',
  team_id: 't-1690',
  match_id: 'm-14',
  alliance: 'blue',
  scouter_id: 'u-omer',
  robot_status: 'played',
  breakdown_seconds: null,
  data: { auto_notes: 2 },
  client_updated_at: T('09:33'),
  version: 1,
};
const ENTRY_B = {
  ...ENTRY_A,
  id: 'e-b',
  scouter_id: 'u-yael',
  data: { auto_notes: 2, mystery_key: 0.5 },
  client_updated_at: T('09:31'),
};

const CONFLICT_DIV = {
  entity: 'sync_conflicts' as const,
  id: 'c-div',
  event_id: 'ev-1',
  kind: 'divergence',
  row_id: 'e-live',
  duplicate_row_id: null,
  superseded_payload: {
    form_version_id: 'fv-1',
    robot_status: 'played',
    data: { teleop_notes: 7, endgame_climb: 'low', auto_notes: 4, log: [{ t: 1 }] },
  },
  superseded_author_id: 'u-noa',
  superseded_client_updated_at: '2026-11-14T09:07:00.000Z',
  base_version: 2,
  created_at: T('09:10'),
  resolved_at: null,
  resolved_by: null,
  resolution: null,
};
const CONFLICT_DUP = {
  ...CONFLICT_DIV,
  id: 'c-dup',
  kind: 'duplicate',
  row_id: 'e-a',
  duplicate_row_id: 'e-b',
  superseded_payload: null,
  superseded_author_id: null,
  superseded_client_updated_at: null,
  base_version: null,
  created_at: T('09:34'),
};

/** The same two conflicts as listConflicts sends them. */
const SERVER_DIV: ConflictItem = {
  id: 'c-div',
  kind: 'divergence',
  created_at: T('09:10'),
  form_kind: 'match',
  team: { id: 't-2096', number: 2096, name: 'RobActive' },
  match: { id: 'm-12', match_type: 'qualification', number: 12 },
  alliance: 'red',
  live: {
    row_id: 'e-live',
    version: 3,
    form_version_id: 'fv-1',
    author: { id: 'u-dana', full_name: 'Dana Levi' },
    client_updated_at: T('09:09'),
    robot_status: 'broke_down',
    breakdown_seconds: 52,
    data: ENTRY_LIVE.data,
    deleted_at: null,
  },
  superseded: {
    form_version_id: 'fv-1',
    author: { id: 'u-noa', full_name: 'Noa Cohen' },
    client_updated_at: '2026-11-14T09:07:00+00:00',
    base_version: 2,
    robot_status: 'played',
    breakdown_seconds: null,
    data: CONFLICT_DIV.superseded_payload.data,
  },
  counted: 'live',
  diff: [
    { field_key: 'robot_status', live: 'broke_down', superseded: 'played', differs: true },
    { field_key: 'breakdown_seconds', live: 52, superseded: null, differs: true },
    { field_key: 'auto_notes', live: 3, superseded: 4, differs: true },
    { field_key: 'endgame_climb', live: 'high', superseded: 'low', differs: true },
    { field_key: 'log', live: [{ t: 1 }], superseded: [{ t: 1 }], differs: false },
    { field_key: 'teleop_notes', live: 7, superseded: 7, differs: false },
  ],
};
const copyOf = (e: typeof ENTRY_A, name: string) => ({
  row_id: e.id,
  version: e.version,
  form_version_id: 'fv-1',
  author: { id: e.scouter_id, full_name: name },
  client_updated_at: e.client_updated_at,
  robot_status: e.robot_status,
  breakdown_seconds: e.breakdown_seconds,
  data: e.data,
  deleted_at: null,
});
const SERVER_DUP: ConflictItem = {
  id: 'c-dup',
  kind: 'duplicate',
  created_at: T('09:34'),
  form_kind: 'match',
  team: { id: 't-1690', number: 1690, name: 'Orbit' },
  match: { id: 'm-14', match_type: 'qualification', number: 14 },
  alliance: 'blue',
  a: copyOf(ENTRY_A, 'Omer Katz'),
  b: copyOf(ENTRY_B, 'Yael Shapira'),
  counted: 'a',
  diff: [
    { field_key: 'robot_status', a: 'played', b: 'played', differs: false },
    { field_key: 'breakdown_seconds', a: null, b: null, differs: false },
    { field_key: 'auto_notes', a: 2, b: 2, differs: false },
    { field_key: 'mystery_key', a: null, b: 0.5, differs: true },
  ],
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    ENTRY_LIVE,
    ENTRY_A,
    ENTRY_B,
    CONFLICT_DIV,
    CONFLICT_DUP,
    { entity: 'users', id: 'u-dana', full_name: 'Dana Levi' },
    { entity: 'users', id: 'u-noa', full_name: 'Noa Cohen' },
    { entity: 'users', id: 'u-omer', full_name: 'Omer Katz' },
    { entity: 'users', id: 'u-yael', full_name: 'Yael Shapira' },
    { entity: 'users', id: 'u-lead', full_name: 'Noa Levi' },
    { entity: 'teams', id: 't-2096', number: 2096, name: 'RobActive' },
    { entity: 'teams', id: 't-1690', number: 1690, name: 'Orbit' },
    { entity: 'matches', id: 'm-12', match_type: 'qualification', number: 12 },
    { entity: 'matches', id: 'm-14', match_type: 'qualification', number: 14 },
    ...[
      ['auto_notes', 'Auto pieces', 'counter', 1],
      ['teleop_notes', 'Teleop pieces', 'counter', 2],
      ['endgame_climb', 'Climb', 'single_select', 3],
    ].map(([key, label, type, order]) => ({
      entity: 'form_fields' as const,
      id: `f-${String(key)}`,
      form_version_id: 'fv-1',
      key,
      label,
      type,
      display_order: order,
      deprecated: false,
      config:
        type === 'single_select'
          ? {
              options: [
                { value: 'low', label: 'Low' },
                { value: 'high', label: 'High' },
              ],
            }
          : {},
    })),
    // The line-up puts 2096 at Red 2 in Q12; a cleared slot is not a station.
    {
      entity: 'match_teams',
      id: 's-1',
      match_id: 'm-12',
      team_id: 't-2096',
      alliance: 'red',
      station: 2,
      deleted_at: null,
    },
    {
      entity: 'match_teams',
      id: 's-2',
      match_id: 'm-14',
      team_id: 't-1690',
      alliance: 'blue',
      station: 1,
      deleted_at: '2026-11-14T08:00:00Z',
    },
  ]);
});

describe('the device-side diff (the server’s rule)', () => {
  it('compares robot status, breakdown time, then the union of data keys in key order; missing reads null', () => {
    expect(
      diffOf(
        { robot_status: 'played', breakdown_seconds: null, data: { b: 1, a: [1, { x: 2 }] } },
        { robot_status: 'played', data: { a: [1, { x: 2 }], c: 'y' } },
      ),
    ).toEqual([
      { field_key: 'robot_status', x: 'played', y: 'played', differs: false },
      { field_key: 'breakdown_seconds', x: null, y: null, differs: false },
      { field_key: 'a', x: [1, { x: 2 }], y: [1, { x: 2 }], differs: false },
      { field_key: 'b', x: 1, y: null, differs: true },
      { field_key: 'c', x: null, y: 'y', differs: true },
    ]);
  });

  it('is deep equality, not identity or key order', () => {
    expect(sameValue({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameValue(0, null)).toBe(false);
  });
});

describe('one card from two sources (SPEC-FINAL 9.6: the queue is readable offline)', () => {
  it('builds the same open items from the cache as the server sends, oldest first', async () => {
    const { items } = await readCachedConflicts('ev-1');
    expect(items.map((i) => i.id)).toEqual(['c-div', 'c-dup']);
    expect(items[0]!.diff).toEqual(SERVER_DIV.diff);
    expect(items[1]!.diff).toEqual(SERVER_DUP.diff);
  });

  it('renders the same card for the same conflict through either mapper', async () => {
    const ctx = { ...(await readCardContext()), now: new Date(T('12:00')) };
    const { items } = await readCachedConflicts('ev-1');
    expect(cardOf(items[0]!, ctx)).toEqual(cardOf(SERVER_DIV, ctx));
    expect(cardOf(items[1]!, ctx)).toEqual(cardOf(SERVER_DUP, ctx));
  });

  it('leaves out a cached conflict whose entry is not on the device, and another event’s', async () => {
    await db.rows.bulkPut([
      { ...CONFLICT_DIV, id: 'c-orphan', row_id: 'e-missing', created_at: T('08:00') },
      { ...CONFLICT_DIV, id: 'c-other', event_id: 'ev-0', created_at: T('08:00') },
    ]);
    const { items } = await readCachedConflicts('ev-1');
    expect(items.map((i) => i.id)).toEqual(['c-div', 'c-dup']);
  });
});

describe('the card', () => {
  it('labels and orders data fields by the form version, with words for status and seconds', async () => {
    const card = cardOf(SERVER_DIV, { ...(await readCardContext()), now: new Date(T('12:00')) });
    expect(card.rows.map((r) => [r.label, ...r.values, r.differs])).toEqual([
      ['Robot status', 'Broke down', 'Played', true],
      ['Breakdown time', '52 s', '—', true],
      ['Auto pieces', '3', '4', true],
      ['Teleop pieces', '7', '7', false],
      ['Climb', 'High', 'Low', true],
      // A key with no field reads as the key; a list of records reads as a count.
      ['log', '1 item', '1 item', false],
    ]);
    expect(card.differing).toBe(4);
    expect(card).toMatchObject({
      match: 'Q12',
      station: 'R2',
      short: 'Q12 2096',
      copies: [
        { first: 'Dana', counted: true },
        { first: 'Noa', counted: false },
      ],
    });
    expect(card.actions.map((a) => [a.label, a.primary, a.resolution, a.done])).toEqual([
      ['Keep Dana’s', true, { keep: 'live' }, 'Kept Dana’s copy'],
      ['Restore Noa’s', false, { keep: 'superseded' }, 'Restored Noa’s copy'],
    ]);
    expect(card.why).toBe(
      'Two edits started from the same copy on different phones. Dana’s later edit is counted now; Noa’s is kept aside.',
    );
  });

  it('a duplicate: the earlier copy first, two secondary Keeps, no station from a cleared slot', async () => {
    const card = cardOf(SERVER_DUP, { ...(await readCardContext()), now: new Date(T('12:00')) });
    expect(card.copies.map((c) => [c.first, c.time, c.counted])).toEqual([
      ['Yael', expect.stringMatching(/^\d\d:\d\d$/), false],
      ['Omer', expect.stringMatching(/^\d\d:\d\d$/), true],
    ]);
    expect(card.actions.map((a) => [a.label, a.primary, a.resolution])).toEqual([
      ['Keep Yael’s', false, { keep_row_id: 'e-b' }],
      ['Keep Omer’s', false, { keep_row_id: 'e-a' }],
    ]);
    expect(card.station).toBeNull();
    expect(card.alliance).toBe('blue');
    expect(card.why).toBe(
      'Two people scouted this robot in this match. Omer’s, entered later, is counted now; both are kept until you pick.',
    );
    // Robot status and breakdown are equal; breakdown is null on both and is no row.
    expect(card.rows.map((r) => r.label)).toEqual(['Robot status', 'Auto pieces', 'mystery_key']);
    expect(card.rows.at(-1)!.values).toEqual(['0.50', '—']);
  });

  it('shows a card with zero differing fields', async () => {
    const same: ConflictItem = {
      ...SERVER_DUP,
      diff: SERVER_DUP.diff.map((r) => ({ ...r, differs: false })),
    };
    expect(cardOf(same, await readCardContext()).differing).toBe(0);
  });

  it('tells two authors with one first name apart, and names copies by time when a name is unknown', async () => {
    const ctx = await readCardContext();
    const twoDanas = cardOf(
      {
        ...SERVER_DIV,
        superseded: { ...SERVER_DIV.superseded, author: { id: 'u-x', full_name: 'Dana Cohen' } },
      },
      ctx,
    );
    expect(twoDanas.actions.map((a) => a.label)).toEqual(['Keep Dana L.’s', 'Restore Dana C.’s']);
    const unknown = cardOf(
      {
        ...SERVER_DIV,
        superseded: { ...SERVER_DIV.superseded, author: { id: null, full_name: null } },
      },
      ctx,
    );
    expect(unknown.actions.map((a) => [a.label, a.done])).toEqual([
      ['Keep the later copy', 'Kept the later copy'],
      ['Restore the earlier copy', 'Restored the earlier copy'],
    ]);
    expect(unknown.copies[1].first).toBe('Unknown');
  });
});

describe('Settled today', () => {
  const settled = (over: Partial<SettledConflict>): SettledConflict => ({
    id: 'c-dup',
    kind: 'duplicate',
    form_kind: 'match',
    team: { id: 't-1690', number: 1690, name: 'Orbit' },
    match: { id: 'm-14', match_type: 'qualification', number: 14 },
    resolution: { keep_row_id: 'e-a' },
    resolved_at: T('10:17'),
    resolved_by: { id: 'u-lead', full_name: 'Noa Levi' },
    kept: { row_id: 'e-a', author_full_name: 'Omer Katz' },
    ...over,
  });

  it('says what was kept and, from the cache, what was removed; who settled it and when', async () => {
    const { look, conflicts } = await readCacheLookups();
    const row = conflicts.find((c) => c.id === 'c-dup');
    expect(settledLineOf(settled({}), look, row)).toMatchObject({
      title: 'Q14 · 1690',
      what: 'kept Omer’s, removed Yael’s',
      time: expect.stringMatching(/^\d\d:\d\d$/),
      by: 'Noa L.',
    });
    expect(settledLineOf(settled({})).what).toBe('kept Omer’s');
  });

  it('a divergence: kept or restored; a super entry: "Super · 4338"', () => {
    const div = settled({
      kind: 'divergence',
      resolution: { keep: 'live' },
      kept: { row_id: 'e', author_full_name: 'Dana Levi' },
    });
    expect(settledLineOf(div).what).toBe('kept Dana’s');
    expect(
      settledLineOf({
        ...div,
        resolution: { keep: 'superseded' },
        kept: { row_id: 'e', author_full_name: 'Noa Cohen' },
      }).what,
    ).toBe('restored Noa’s');
    expect(
      settledLineOf({
        ...div,
        form_kind: 'super',
        match: null,
        team: { id: 't', number: 4338, name: 'Falcons' },
      }).title,
    ).toBe('Super · 4338');
  });

  it('offline, lists the event’s conflicts settled since local midnight, newest first', async () => {
    const today = new Date();
    const earlier = new Date(today.getTime() - 36 * 3600_000).toISOString();
    await db.rows.bulkPut([
      {
        ...CONFLICT_DUP,
        id: 'c-s1',
        resolved_at: new Date(today.getTime() - 60_000).toISOString(),
        resolved_by: 'u-lead',
        resolution: { keep_row_id: 'e-a' },
      },
      {
        ...CONFLICT_DIV,
        id: 'c-s2',
        resolved_at: earlier,
        resolved_by: 'u-lead',
        resolution: { keep: 'live' },
      },
    ]);
    const { settled: rows } = await readCachedConflicts('ev-1', localMidnight(today));
    expect(rows.map((s) => [s.id, s.kept?.author_full_name, s.resolved_by?.full_name])).toEqual([
      ['c-s1', 'Omer Katz', 'Noa Levi'],
    ]);
  });

  it('local midnight is an ISO instant with the device’s offset', () => {
    const at = new Date(2026, 10, 14, 15, 30);
    const midnight = localMidnight(at);
    expect(midnight).toMatch(/^2026-11-14T00:00:00[+-]\d\d:\d\d$/);
    expect(new Date(midnight).getTime()).toBe(new Date(2026, 10, 14).getTime());
  });
});
