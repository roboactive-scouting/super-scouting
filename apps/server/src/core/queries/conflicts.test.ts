import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Caller, ConflictItem } from '@frc/shared';
import type { StoredFullUser } from '../context.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';
import { listConflicts } from './conflicts.js';

const CALLERS: Caller[] = [
  { kind: 'user', userId: 'u-scouter', role: 'scouter' },
  { kind: 'user', userId: 'u-lead', role: 'lead' },
  { kind: 'user', userId: 'u-admin', role: 'admin' },
  { kind: 'service', label: 'mcp' },
];
const scouter = CALLERS[0]!;

const EV = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_EV = 'aaaaaaaa-0000-4000-8000-000000000002';
const T1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const T2 = 'bbbbbbbb-0000-4000-8000-000000000002';
const M12 = 'cccccccc-0000-4000-8000-000000000012';
const id = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const E = (n: number) => id('eeeeeeee', n);
const C = (n: number) => id('dddddddd', n);

const user = (userId: string, fullName: string): StoredFullUser => ({
  id: userId,
  username: userId,
  full_name: fullName,
  role: 'scouter',
  password_hash: 'x',
  must_change_password: false,
  disabled_at: null,
  created_at: '2026-11-01T00:00:00.000Z',
});

const entry = (n: number, over: Record<string, unknown> = {}) => ({
  id: E(n),
  version: 2,
  event_id: EV,
  form_version_id: 'fv-1',
  form_kind: 'match',
  match_id: M12,
  team_id: T1,
  alliance: 'red',
  scouter_id: 'u-dana',
  robot_status: 'played',
  breakdown_seconds: null,
  data: { auto_notes: 3, climb: 'high', events: [{ t: 1, k: 'shot' }] },
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:04:00.000Z',
  deleted_at: null,
  ...over,
});

const divergence = (n: number, rowN: number, over: Record<string, unknown> = {}) => ({
  id: C(n),
  event_id: EV,
  entity: 'scouting_entry',
  row_id: E(rowN),
  kind: 'divergence',
  superseded_payload: {
    form_version_id: 'fv-1',
    robot_status: 'played',
    data: { auto_notes: 5, climb: 'high', events: [{ t: 1, k: 'shot' }], teleop: 2 },
  },
  superseded_author_id: 'u-omer',
  superseded_client_updated_at: '2026-11-14T09:03:00.000Z',
  base_version: 1,
  duplicate_row_id: null,
  created_at: `2026-11-14T09:0${n}:30.000Z`,
  updated_at: `2026-11-14T09:0${n}:30.000Z`,
  resolved_at: null,
  resolved_by: null,
  resolution: null,
  ...over,
});

const duplicate = (n: number, aN: number, bN: number, over: Record<string, unknown> = {}) => ({
  ...divergence(n, aN),
  kind: 'duplicate',
  superseded_payload: null,
  superseded_author_id: null,
  superseded_client_updated_at: null,
  base_version: null,
  duplicate_row_id: E(bN),
  ...over,
});

let ctx: FakeContext;
const put = (store: Map<string, unknown>, row: { id: string }) => store.set(row.id, row as never);

beforeEach(() => {
  ctx = makeFakeContext();
  for (const [uid, name] of [
    ['u-dana', 'Dana Levi'],
    ['u-omer', 'Omer Katz'],
    ['u-lead', 'Lea Lead'],
  ] as const) {
    ctx.usersById.set(uid, user(uid, name));
  }
  ctx.teams.set(T1, { id: T1, number: 1690, name: 'Orbit', created_at: '', updated_at: '' });
  ctx.teams.set(T2, { id: T2, number: 2230, name: 'Zebracorns', created_at: '', updated_at: '' });
  ctx.rows.matches.set(M12, { id: M12, event_id: EV, match_type: 'qualification', number: 12 });
});

const list = (input: Record<string, unknown> = {}, caller: Caller = scouter) =>
  listConflicts(caller, { event_id: EV, ...input }, ctx);

describe('listConflicts — the review queue (SPEC-FINAL 9.5, task 1.41)', () => {
  it('returns only unresolved conflicts by default', async () => {
    put(ctx.rows.scouting_entries, entry(1));
    put(ctx.conflicts, divergence(1, 1));
    put(
      ctx.conflicts,
      divergence(2, 1, { resolved_at: '2026-11-14T09:59:00.000Z', resolved_by: 'u-lead' }),
    );
    const out = await list();
    expect(out.items.map((i) => i.id)).toEqual([C(1)]);
    expect(out.next_cursor).toBeNull();
  });

  it('only lists the event’s own scouting-entry conflicts', async () => {
    put(ctx.rows.scouting_entries, entry(1));
    put(ctx.conflicts, divergence(1, 1, { event_id: OTHER_EV }));
    put(ctx.conflicts, divergence(2, 1, { entity: 'pick_list' }));
    expect((await list()).items).toEqual([]);
  });

  it('a divergence carries the team, the match, both authors’ full names, both client times and a full diff', async () => {
    put(ctx.rows.scouting_entries, entry(1));
    put(ctx.conflicts, divergence(1, 1));
    const [item] = (await list()).items;
    expect(item).toMatchObject({
      id: C(1),
      kind: 'divergence',
      form_kind: 'match',
      team: { id: T1, number: 1690, name: 'Orbit' },
      match: { id: M12, match_type: 'qualification', number: 12 },
      alliance: 'red',
      counted: 'live',
      live: {
        row_id: E(1),
        version: 2,
        author: { id: 'u-dana', full_name: 'Dana Levi' },
        client_updated_at: '2026-11-14T09:04:00.000Z',
        robot_status: 'played',
        data: { auto_notes: 3 },
        deleted_at: null,
      },
      superseded: {
        author: { id: 'u-omer', full_name: 'Omer Katz' },
        client_updated_at: '2026-11-14T09:03:00.000Z',
        base_version: 1,
        robot_status: 'played',
        data: { auto_notes: 5 },
      },
    });
    const diff = (item as Extract<ConflictItem, { kind: 'divergence' }>).diff;
    expect(diff).toEqual([
      { field_key: 'robot_status', live: 'played', superseded: 'played', differs: false },
      { field_key: 'breakdown_seconds', live: null, superseded: null, differs: false },
      { field_key: 'auto_notes', live: 3, superseded: 5, differs: true },
      { field_key: 'climb', live: 'high', superseded: 'high', differs: false },
      // Deep equality: an equal event log is not a difference.
      {
        field_key: 'events',
        live: [{ t: 1, k: 'shot' }],
        superseded: [{ t: 1, k: 'shot' }],
        differs: false,
      },
      // A key only one copy has reads as null on the other side.
      { field_key: 'teleop', live: null, superseded: 2, differs: true },
    ]);
  });

  it('a duplicate carries both rows with their authors, a diff of a/b, and the copy counted now', async () => {
    put(ctx.rows.scouting_entries, entry(1, { client_updated_at: '2026-11-14T09:04:00.000Z' }));
    put(
      ctx.rows.scouting_entries,
      entry(2, {
        scouter_id: 'u-omer',
        version: 1,
        robot_status: 'no_show',
        data: {},
        client_updated_at: '2026-11-14T09:06:00+00:00',
      }),
    );
    put(ctx.conflicts, duplicate(1, 1, 2));
    const [item] = (await list()).items;
    expect(item).toMatchObject({
      kind: 'duplicate',
      team: { number: 1690, name: 'Orbit' },
      match: { number: 12 },
      a: {
        row_id: E(1),
        author: { full_name: 'Dana Levi' },
        client_updated_at: '2026-11-14T09:04:00.000Z',
      },
      b: {
        row_id: E(2),
        author: { full_name: 'Omer Katz' },
        client_updated_at: '2026-11-14T09:06:00+00:00',
      },
      // The later instant, compared as instants across the two formats.
      counted: 'b',
    });
    const diff = (item as Extract<ConflictItem, { kind: 'duplicate' }>).diff;
    expect(diff[0]).toEqual({
      field_key: 'robot_status',
      a: 'played',
      b: 'no_show',
      differs: true,
    });
    expect(diff.find((d) => d.field_key === 'auto_notes')).toEqual({
      field_key: 'auto_notes',
      a: 3,
      b: null,
      differs: true,
    });
  });

  it('a soft-deleted duplicate row is never the one counted', async () => {
    put(ctx.rows.scouting_entries, entry(1));
    put(
      ctx.rows.scouting_entries,
      entry(2, {
        client_updated_at: '2026-11-14T09:59:00.000Z',
        deleted_at: '2026-11-14T09:59:30.000Z',
      }),
    );
    put(ctx.conflicts, duplicate(1, 1, 2));
    const [item] = (await list()).items;
    expect(item).toMatchObject({ counted: 'a', b: { deleted_at: '2026-11-14T09:59:30.000Z' } });
  });

  it('a super entry has no match', async () => {
    put(
      ctx.rows.scouting_entries,
      entry(1, { form_kind: 'super', match_id: null, alliance: null }),
    );
    put(ctx.conflicts, divergence(1, 1));
    const [item] = (await list()).items;
    expect(item).toMatchObject({ form_kind: 'super', match: null, alliance: null });
  });

  it('a divergence with no recorded superseded author has a null name, never a crash', async () => {
    put(ctx.rows.scouting_entries, entry(1));
    put(ctx.conflicts, divergence(1, 1, { superseded_author_id: null }));
    const [item] = (await list()).items;
    expect(item).toMatchObject({ superseded: { author: { id: null, full_name: null } } });
  });

  it('lists every open conflict of a row that diverged twice', async () => {
    put(ctx.rows.scouting_entries, entry(1));
    put(ctx.conflicts, divergence(1, 1));
    put(ctx.conflicts, divergence(2, 1));
    expect((await list()).items.map((i) => i.id)).toEqual([C(1), C(2)]);
  });

  it('leaves out a conflict whose row no longer exists, rather than failing', async () => {
    put(ctx.rows.scouting_entries, entry(1));
    put(ctx.rows.scouting_entries, entry(2));
    put(ctx.conflicts, divergence(1, 9)); // its row was hard-deleted by a form delete
    put(ctx.conflicts, duplicate(2, 1, 9)); // one of its two rows is gone
    put(ctx.conflicts, duplicate(3, 1, 2));
    expect((await list()).items.map((i) => i.id)).toEqual([C(3)]);
  });

  it('is bounded and paginated, oldest first, with an exact keyset', async () => {
    put(ctx.rows.scouting_entries, entry(1));
    // Created out of order, and two at the same instant: the id breaks the tie.
    put(ctx.conflicts, divergence(3, 1));
    put(ctx.conflicts, divergence(1, 1));
    put(ctx.conflicts, divergence(2, 1, { created_at: '2026-11-14T09:01:30.000Z' }));
    const first = await list({ limit: 2 });
    expect(first.items.map((i) => i.id)).toEqual([C(1), C(2)]);
    expect(first.next_cursor).toEqual(expect.any(String));
    const second = await list({ limit: 2, cursor: first.next_cursor });
    expect(second.items.map((i) => i.id)).toEqual([C(3)]);
    expect(second.next_cursor).toBeNull();
  });

  it('clamps a large limit to 50 rather than rejecting it, and defaults to 20', async () => {
    const spy = vi.spyOn(ctx.store, 'listOpenConflicts');
    await list({ limit: 10_000 });
    expect(spy.mock.calls[0]![2]).toBe(51);
    await list();
    expect(spy.mock.calls[1]![2]).toBe(21);
  });

  it('reads each table once per call: conflicts, entries, users, teams, matches', async () => {
    put(ctx.rows.scouting_entries, entry(1));
    put(ctx.rows.scouting_entries, entry(2, { team_id: T2 }));
    put(ctx.conflicts, divergence(1, 1));
    put(ctx.conflicts, duplicate(2, 1, 2));
    put(
      ctx.conflicts,
      divergence(3, 2, {
        resolved_at: '2026-11-14T09:59:00.000Z',
        resolved_by: 'u-lead',
        resolution: { keep: 'live' },
      }),
    );
    const spies = (
      ['getEntriesByIds', 'listUserNames', 'getTeamsByIds', 'getMatchesByIds'] as const
    ).map((name) => vi.spyOn(ctx.store, name));
    await list();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(new Set(spies[0]!.mock.calls[0]![0])).toEqual(new Set([E(1), E(2)]));
  });

  it('refuses an unreadable cursor and a settled_since that is not an instant', async () => {
    await expect(list({ cursor: 'not-a-cursor' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(list({ settled_since: 'yesterday' })).rejects.toMatchObject({ code: 'invalid' });
  });

  it('every role may read it, and a service caller too — resolving is what is gated', async () => {
    put(ctx.rows.scouting_entries, entry(1));
    put(ctx.conflicts, divergence(1, 1));
    for (const caller of CALLERS) {
      expect((await list({}, caller)).items, caller.kind).toHaveLength(1);
    }
  });
});

describe('listConflicts — settled today (SPEC-FINAL 9.5, v1.28)', () => {
  const settled = (n: number, over: Record<string, unknown>) =>
    divergence(n, 1, { resolved_by: 'u-lead', ...over });

  beforeEach(() => {
    put(ctx.rows.scouting_entries, entry(1));
    put(ctx.rows.scouting_entries, entry(2, { scouter_id: 'u-omer' }));
  });

  it('names what was kept, when and by whom, newest first, and leaves the open ones out', async () => {
    put(
      ctx.conflicts,
      settled(1, { resolved_at: '2026-11-14T09:10:00.000Z', resolution: { keep: 'live' } }),
    );
    put(
      ctx.conflicts,
      settled(2, { resolved_at: '2026-11-14T09:20:00.000Z', resolution: { keep: 'superseded' } }),
    );
    put(
      ctx.conflicts,
      duplicate(3, 1, 2, {
        resolved_at: '2026-11-14T09:30:00.000Z',
        resolved_by: 'u-lead',
        resolution: { keep_row_id: E(2) },
      }),
    );
    put(ctx.conflicts, divergence(4, 1)); // open
    const out = await list();
    expect(out.items.map((i) => i.id)).toEqual([C(4)]);
    expect(out.settled).toEqual([
      {
        id: C(3),
        kind: 'duplicate',
        form_kind: 'match',
        team: { id: T1, number: 1690, name: 'Orbit' },
        match: { id: M12, match_type: 'qualification', number: 12 },
        resolution: { keep_row_id: E(2) },
        resolved_at: '2026-11-14T09:30:00.000Z',
        resolved_by: { id: 'u-lead', full_name: 'Lea Lead' },
        kept: { row_id: E(2), author_full_name: 'Omer Katz' },
      },
      expect.objectContaining({
        id: C(2),
        resolution: { keep: 'superseded' },
        kept: { row_id: E(1), author_full_name: 'Omer Katz' }, // the superseded author
      }),
      expect.objectContaining({
        id: C(1),
        resolution: { keep: 'live' },
        kept: { row_id: E(1), author_full_name: 'Dana Levi' }, // the live row's scouter
      }),
    ]);
  });

  it('respects settled_since, the device’s own midnight', async () => {
    put(
      ctx.conflicts,
      settled(1, { resolved_at: '2026-11-13T21:59:00.000Z', resolution: { keep: 'live' } }),
    );
    put(
      ctx.conflicts,
      settled(2, { resolved_at: '2026-11-13T22:01:00.000Z', resolution: { keep: 'live' } }),
    );
    // Midnight in Israel (UTC+2) on 14 November.
    const out = await list({ settled_since: '2026-11-14T00:00:00+02:00' });
    expect(out.settled.map((s) => s.id)).toEqual([C(2)]);
  });

  it('defaults to the last 24 hours', async () => {
    // The fake clock reads 2026-11-14T10:00:00Z.
    put(
      ctx.conflicts,
      settled(1, { resolved_at: '2026-11-13T09:59:00.000Z', resolution: { keep: 'live' } }),
    );
    put(
      ctx.conflicts,
      settled(2, { resolved_at: '2026-11-13T10:01:00.000Z', resolution: { keep: 'live' } }),
    );
    expect((await list()).settled.map((s) => s.id)).toEqual([C(2)]);
  });

  it('still lists a settled conflict whose rows are gone, with what it can name', async () => {
    put(
      ctx.conflicts,
      divergence(1, 9, {
        resolved_at: '2026-11-14T09:10:00.000Z',
        resolved_by: 'u-lead',
        resolution: { keep: 'live' },
      }),
    );
    const [line] = (await list()).settled;
    expect(line).toMatchObject({
      team: null,
      match: null,
      form_kind: null,
      kept: { row_id: E(9), author_full_name: null },
      resolved_by: { full_name: 'Lea Lead' },
    });
  });

  it('is bounded at 100', async () => {
    const spy = vi.spyOn(ctx.store, 'listSettledConflicts');
    await list();
    expect(spy.mock.calls[0]![3]).toBe(100);
  });
});
