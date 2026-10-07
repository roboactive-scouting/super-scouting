import { beforeEach, describe, expect, it } from 'vitest';
import { PARENT_DELETED_DETAIL, type Operation, type PushResult } from '@frc/shared';
import { session } from '@/auth/session';
import { db } from './db';
import {
  ackResults,
  enqueue,
  matchIdsNeededByOutbox,
  nextSeq,
  pending,
  rejectedRows,
  retryRejected,
  syncStateOf,
  unackedCount,
  unsyncedCount,
} from './outbox';

const op = (over: Partial<Operation> = {}): Operation => ({
  op_id: crypto.randomUUID(),
  entity: 'scouting_entry',
  row_id: 'row-1',
  action: 'create',
  base_version: null,
  payload: { data: { auto_notes: 1 } },
  author_user_id: 'u-1',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: 1,
  ...over,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('outbox', () => {
  it('queues an operation and reports it as pending', async () => {
    await enqueue(op());
    expect(await pending(50)).toHaveLength(1);
    expect(await unackedCount()).toBe(1);
  });

  it('hands out a monotonic per-device seq', async () => {
    const a = await nextSeq();
    const b = await nextSeq();
    expect(b).toBe(a + 1);
  });

  it('coalesces two edits of the same row into one pending operation', async () => {
    await enqueue(op({ action: 'create', base_version: null }));
    await enqueue(
      op({
        action: 'update',
        base_version: 2,
        payload: { data: { auto_notes: 9 } },
        client_updated_at: '2026-11-14T09:05:00.000Z',
      }),
    );
    const queued = await pending(50);
    expect(queued).toHaveLength(1);
    expect(queued[0]!.payload).toEqual({ data: { auto_notes: 9 } });
    expect(queued[0]!.client_updated_at).toBe('2026-11-14T09:05:00.000Z');
    // the earliest base_version is kept, so the server sees one it actually issued
    expect(queued[0]!.base_version).toBeNull();
  });

  it("keeps the create's author when a later edit coalesces into it (attribution, 7.3)", async () => {
    // The server sets scouter_id from a create's author: a lead fixing a scouter's
    // still-unsynced entry must not become its scouter.
    await enqueue(op({ action: 'create', author_user_id: 'u-scouter' }));
    await enqueue(op({ action: 'update', base_version: 1, author_user_id: 'u-lead' }));
    const [queued] = await pending(50);
    expect(queued!.action).toBe('create');
    expect(queued!.author_user_id).toBe('u-scouter');
  });

  it('takes the latest author when an update coalesces into an update', async () => {
    await enqueue(op({ action: 'update', base_version: 1, author_user_id: 'u-scouter' }));
    await enqueue(op({ action: 'update', base_version: 2, author_user_id: 'u-lead' }));
    expect((await pending(50))[0]!.author_user_id).toBe('u-lead');
  });

  it('cancels a create that is deleted before it ever reached the server', async () => {
    await db.rows.put({ entity: 'users', id: 'u-1', role: 'lead' });
    await enqueue(op({ action: 'create' }));
    await enqueue(op({ action: 'delete', base_version: 1, payload: {} }));
    expect(await pending(50)).toHaveLength(0);
    expect(await unackedCount()).toBe(0);
  });

  it('keeps a delete of a row the server already knows about', async () => {
    await db.rows.put({ entity: 'users', id: 'u-1', role: 'lead' });
    await enqueue(op({ action: 'create' }));
    await ackResults([
      { op_id: (await pending(50))[0]!.op_id, status: 'applied', row_id: 'row-1', new_version: 1 },
    ]);
    await enqueue(op({ action: 'delete', base_version: 1, payload: {} }));
    expect(await pending(50)).toHaveLength(1);
  });

  it('prunes on every acking status and keeps the row in the dataset', async () => {
    for (const status of ['applied', 'noop', 'divergence', 'duplicate'] as const) {
      await db.delete();
      await db.open();
      await enqueue(op({ row_id: `row-${status}` }));
      const [queued] = await pending(50);
      const result = {
        op_id: queued!.op_id,
        status,
        row_id: `row-${status}`,
        new_version: 1,
      } as PushResult;
      await ackResults([result]);
      expect(await pending(50), status).toHaveLength(0);
      expect((await syncStateOf(`row-${status}`))?.sync_state, status).toBe('acked');
    }
  });

  it('NEVER prunes on a rejection — the durability rule (SPEC-FINAL 9.4)', async () => {
    await enqueue(op());
    const [queued] = await pending(50);
    await ackResults([
      { op_id: queued!.op_id, status: 'rejected', reason: 'invalid', detail: 'x' },
    ]);
    // Parked (SPEC-FINAL 9.3.1), never pruned: still in the outbox, still unacked.
    expect(await db.outbox.count()).toBe(1);
    expect((await syncStateOf('row-1'))?.sync_state).toBe('pending');
  });

  it('returns pending operations in seq order and never more than the limit', async () => {
    for (let i = 0; i < 250; i += 1) await enqueue(op({ row_id: `row-${i}`, seq: 250 - i }));
    const batch = await pending(200);
    expect(batch).toHaveLength(200);
    expect(batch.map((o) => o.seq)).toEqual([...batch.map((o) => o.seq)].sort((a, b) => a - b));
  });
});

describe('outbox.enqueue refuses a delete from anyone without manage_entries (SPEC-FINAL 7.6)', () => {
  const del = (author: string) =>
    op({ action: 'delete', base_version: 1, payload: {}, author_user_id: author });

  it('throws for a scouter-authored delete and writes nothing', async () => {
    await db.rows.put({ entity: 'users', id: 'u-1', role: 'scouter' });
    await expect(enqueue(del('u-1'))).rejects.toThrow(/lead or admin/);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.syncState.count()).toBe(0);
  });

  it('does not let a scouter delete cancel their own pending create either', async () => {
    await db.rows.put({ entity: 'users', id: 'u-1', role: 'scouter' });
    await enqueue(op({ action: 'create' }));
    await expect(enqueue(del('u-1'))).rejects.toThrow();
    expect(await pending(50)).toHaveLength(1);
  });

  it('refuses a delete whose author is unknown', async () => {
    await expect(enqueue(del('u-nobody'))).rejects.toThrow();
    expect(await db.outbox.count()).toBe(0);
  });

  it('falls back to the session user when the author has no cached row', async () => {
    await session.signIn(
      { id: 'u-9', username: 'l', full_name: 'L', role: 'lead', must_change_password: false },
      't',
    );
    await enqueue(del('u-9'));
    expect(await db.outbox.count()).toBe(1);
  });

  it('believes the cached users row over the session when they disagree', async () => {
    await session.signIn(
      { id: 'u-9', username: 'l', full_name: 'L', role: 'lead', must_change_password: false },
      't',
    );
    await db.rows.put({ entity: 'users', id: 'u-9', role: 'scouter' });
    await expect(enqueue(del('u-9'))).rejects.toThrow();
  });

  it('accepts a delete from a lead or admin', async () => {
    await db.rows.bulkPut([
      { entity: 'users', id: 'u-lead', role: 'lead' },
      { entity: 'users', id: 'u-admin', role: 'admin' },
    ]);
    await enqueue({ ...del('u-lead'), row_id: 'r-a' });
    await enqueue({ ...del('u-admin'), row_id: 'r-b' });
    expect(await db.outbox.count()).toBe(2);
  });
});

describe('push rejections are recorded, never pruned (SPEC-FINAL 9.4, 7.6)', () => {
  it('records the latest rejection on the row and keeps the op queued', async () => {
    await enqueue(op());
    const [queued] = await pending(50);
    await ackResults([
      {
        op_id: queued!.op_id,
        status: 'rejected',
        reason: 'edit-window-expired',
        detail: 'this entry is locked — ask a lead',
      },
    ]);
    const state = await syncStateOf('row-1');
    expect(state?.sync_state).toBe('pending');
    expect(state?.rejection).toMatchObject({
      code: 'edit-window-expired',
      message: 'this entry is locked — ask a lead',
    });
    expect(typeof state?.rejection?.at).toBe('string');
    expect(await db.outbox.count()).toBe(1);
  });

  it('clears the rejection when the row is later acked', async () => {
    await enqueue(op());
    const [queued] = await pending(50);
    await ackResults([{ op_id: queued!.op_id, status: 'rejected', reason: 'forbidden' }]);
    await ackResults([
      { op_id: queued!.op_id, status: 'applied', row_id: 'row-1', new_version: 1 },
    ]);
    expect((await syncStateOf('row-1'))?.rejection ?? null).toBeNull();
  });

  it('does not record a transient server failure as a rejection, and keeps retrying it', async () => {
    await enqueue(op());
    const [queued] = await pending(50);
    await ackResults([
      {
        op_id: queued!.op_id,
        status: 'rejected',
        reason: 'invalid',
        detail: 'unexpected server error',
      },
    ]);
    expect((await syncStateOf('row-1'))?.rejection ?? null).toBeNull();
    expect(await pending(50)).toHaveLength(1);
  });
});

type Reason = 'forbidden' | 'edit-window-expired' | 'parent-deleted' | 'invalid';

async function rejectFirst(reason: Reason, detail?: string) {
  const [queued] = await pending(50);
  await ackResults([
    detail === undefined
      ? { op_id: queued!.op_id, status: 'rejected', reason }
      : { op_id: queued!.op_id, status: 'rejected', reason, detail },
  ]);
}

describe('a rejected op is parked, not retried (SPEC-FINAL 9.3.1)', () => {
  it.each(['forbidden', 'edit-window-expired', 'parent-deleted', 'invalid'] as const)(
    'parks a %s rejection: kept, counted as unsynced, no longer pending a push',
    async (reason) => {
      await enqueue(op());
      await rejectFirst(reason, reason === 'invalid' ? 'stale base version 3' : undefined);
      expect(await pending(50)).toHaveLength(0);
      expect(await db.outbox.count()).toBe(1);
      expect(await unsyncedCount()).toBe(1);
      expect(await unackedCount()).toBe(1);
    },
  );

  it('keeps a transient server failure pending, to be retried', async () => {
    await enqueue(op());
    await rejectFirst('invalid', 'unexpected server error');
    expect(await pending(50)).toHaveLength(1);
  });

  it('un-parks on a new local edit of the row, keeping the earliest base_version', async () => {
    await enqueue(op({ action: 'update', base_version: 3, author_user_id: 'u-scouter' }));
    await rejectFirst('forbidden');
    expect(await pending(50)).toHaveLength(0);

    await enqueue(
      op({
        action: 'update',
        base_version: 4,
        author_user_id: 'u-lead',
        payload: { data: { auto_notes: 7 } },
      }),
    );

    const queued = await pending(50);
    expect(queued).toHaveLength(1);
    expect(queued[0]!.base_version).toBe(3);
    expect(queued[0]!.payload).toEqual({ data: { auto_notes: 7 } });
    expect(await db.outbox.count()).toBe(1);
    expect((await syncStateOf('row-1'))?.rejection ?? null).toBeNull();
  });

  it("un-parks a parked create on a new edit, keeping the create's original author", async () => {
    await enqueue(op({ action: 'create', author_user_id: 'u-scouter' }));
    await rejectFirst('invalid', 'form_version_id is required');
    await enqueue(op({ action: 'update', base_version: 1, author_user_id: 'u-lead' }));
    const [queued] = await pending(50);
    expect(queued!.action).toBe('create');
    expect(queued!.base_version).toBeNull();
    expect(queued!.author_user_id).toBe('u-scouter');
  });

  it('retryRejected un-parks one row, and only that row', async () => {
    await enqueue(op({ row_id: 'row-a', seq: 1 }));
    await enqueue(op({ row_id: 'row-b', seq: 2 }));
    const queued = await pending(50);
    await ackResults(
      queued.map((q) => ({
        op_id: q.op_id,
        status: 'rejected' as const,
        reason: 'forbidden' as const,
      })),
    );
    expect(await pending(50)).toHaveLength(0);

    await retryRejected('row-a');

    expect((await pending(50)).map((q) => q.row_id)).toEqual(['row-a']);
    expect((await syncStateOf('row-b'))?.rejection?.code).toBe('forbidden');
  });

  it('parked ops survive expire and signOut, and still count as unsynced', async () => {
    await session.signIn(
      { id: 'u-1', username: 'l', full_name: 'L', role: 'lead', must_change_password: false },
      't',
    );
    await enqueue(op());
    await rejectFirst('edit-window-expired');

    await session.expire();
    expect(await db.outbox.count()).toBe(1);
    await session.signOut();

    expect(await db.outbox.count()).toBe(1);
    expect(await unsyncedCount()).toBe(1);
    expect(await unackedCount()).toBe(1);
    expect((await syncStateOf('row-1'))?.rejection?.code).toBe('edit-window-expired');
  });
});

describe('a deleted match is rebuilt, not stranded (UF.1, SPEC-FINAL 9.7 v1.18)', () => {
  const EVENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const MATCH = 'bbbbbbbb-0000-4000-8000-000000000080';
  const CANONICAL = 'bbbbbbbb-0000-4000-8000-0000000000cc';

  // Every seq from the device counter, as submitEntry and ensureMatchLocally take theirs.
  const entryOp = async (over: Partial<Operation> = {}) =>
    op({
      row_id: 'entry-1',
      seq: await nextSeq(),
      payload: { event_id: EVENT, match_id: MATCH, team_id: 't-1', data: {} },
      ...over,
    });

  const cachedMatch = {
    entity: 'matches' as const,
    id: MATCH,
    event_id: EVENT,
    match_type: 'qualification',
    number: 80,
  };

  async function cacheEventAndMatch() {
    await db.rows.bulkPut([{ entity: 'events', id: EVENT, name: 'Event' }, cachedMatch]);
  }

  const matchGone = (opId: string): PushResult => ({
    op_id: opId,
    status: 'rejected',
    reason: 'parent-deleted',
    detail: PARENT_DELETED_DETAIL.match,
  });

  it('queues the bare match again from the cached row, ahead of the entry, and leaves the entry pending', async () => {
    await cacheEventAndMatch();
    const entry = await entryOp();
    await enqueue(entry);
    await ackResults([matchGone(entry.op_id)]);

    const queued = await pending(50);
    expect(queued.map((o) => o.entity)).toEqual(['match', 'scouting_entry']);
    const [bare, again] = queued;
    expect(bare).toMatchObject({
      entity: 'match',
      action: 'create',
      row_id: MATCH,
      base_version: null,
      payload: { event_id: EVENT, match_type: 'qualification', number: 80 },
      author_user_id: entry.author_user_id,
    });
    expect(bare!.seq).toBeLessThan(again!.seq);
    expect(again!.op_id).toBe(entry.op_id);
    expect((await syncStateOf('entry-1'))?.rejection ?? null).toBeNull();
    // The bare match is a carrier, never counted on its own (SPEC-FINAL 9.10).
    expect(await unsyncedCount()).toBe(1);
  });

  it('never queues a second bare match for a row that already has one pending', async () => {
    await cacheEventAndMatch();
    const first = await entryOp();
    const second = await entryOp({ row_id: 'entry-2' });
    await enqueue(first);
    await enqueue(second);
    await ackResults([matchGone(first.op_id), matchGone(second.op_id)]);
    const queued = await pending(50);
    expect(queued.filter((o) => o.entity === 'match')).toHaveLength(1);
    expect(queued[0]!.entity).toBe('match');
    expect(await rejectedRows()).toEqual([]);
  });

  it('parks the entry when its rebuilt match was itself refused, instead of looping', async () => {
    await cacheEventAndMatch();
    const entry = await entryOp();
    await enqueue(entry);
    await ackResults([matchGone(entry.op_id)]);
    const [bare] = await pending(50);
    await ackResults([
      { op_id: bare!.op_id, status: 'rejected', reason: 'forbidden', detail: 'no' },
    ]);
    await ackResults([matchGone(entry.op_id)]);
    expect(await db.outbox.where('row_id').equals(MATCH).count()).toBe(1);
    expect((await syncStateOf('entry-1'))?.rejection).toMatchObject({ code: 'parent-deleted' });
  });

  it.each([
    ['the match row is not cached', [{ entity: 'events' as const, id: EVENT }]],
    ['the event is not cached', [cachedMatch]],
  ])('follows 9.7 as before when %s: parked with the reason, nothing queued', async (_, rows) => {
    await db.rows.bulkPut(rows);
    const entry = await entryOp();
    await enqueue(entry);
    await ackResults([matchGone(entry.op_id)]);
    expect(await pending(50)).toEqual([]);
    expect(await db.outbox.count()).toBe(1);
    expect((await syncStateOf('entry-1'))?.rejection).toMatchObject({
      code: 'parent-deleted',
      message: PARENT_DELETED_DETAIL.match,
    });
  });

  it.each([PARENT_DELETED_DETAIL.event, PARENT_DELETED_DETAIL.team, PARENT_DELETED_DETAIL.other])(
    'does not rebuild for another missing parent (%s)',
    async (detail) => {
      await cacheEventAndMatch();
      const entry = await entryOp();
      await enqueue(entry);
      await ackResults([
        { op_id: entry.op_id, status: 'rejected', reason: 'parent-deleted', detail },
      ]);
      expect(await db.outbox.filter((o) => o.entity === 'match').count()).toBe(0);
      expect((await syncStateOf('entry-1'))?.rejection).toMatchObject({ message: detail });
    },
  );

  it('matchIdsNeededByOutbox names queued bare matches and the matches of queued entries', async () => {
    await enqueue(await entryOp());
    await enqueue(
      op({
        entity: 'match',
        row_id: CANONICAL,
        payload: { event_id: EVENT, match_type: 'qualification', number: 81 },
      }),
    );
    await enqueue(op({ row_id: 'super-1', payload: { match_id: null } }));
    expect(await matchIdsNeededByOutbox()).toEqual(new Set([MATCH, CANONICAL]));
  });
});

describe('a bare match answered with another id is remapped (SPEC-FINAL 6.4, UF.1)', () => {
  const EVENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const LOCAL = 'bbbbbbbb-0000-4000-8000-0000000000aa';
  const CANONICAL = 'bbbbbbbb-0000-4000-8000-0000000000cc';

  async function scoutOnALocalMatch() {
    const bare = op({
      entity: 'match',
      row_id: LOCAL,
      seq: 1,
      payload: { event_id: EVENT, match_type: 'qualification', number: 80 },
    });
    const entry = op({
      row_id: 'entry-1',
      seq: 2,
      payload: { event_id: EVENT, match_id: LOCAL, team_id: 't-1', data: {} },
    });
    await enqueue(bare);
    await enqueue(entry);
    await db.rows.bulkPut([
      { entity: 'events', id: EVENT },
      { entity: 'matches', id: LOCAL, event_id: EVENT, match_type: 'qualification', number: 80 },
      { entity: 'scouting_entries', id: 'entry-1', match_id: LOCAL, event_id: EVENT },
    ]);
    return { bare, entry };
  }

  const noop = (opId: string): PushResult => ({
    op_id: opId,
    status: 'noop',
    row_id: CANONICAL,
    new_version: 1,
  });

  const matchGone = (opId: string): PushResult => ({
    op_id: opId,
    status: 'rejected',
    reason: 'parent-deleted',
    detail: PARENT_DELETED_DETAIL.match,
  });

  it('rewrites the queued entry match_id, the cached entry and the cached match row', async () => {
    const { bare } = await scoutOnALocalMatch();
    await ackResults([noop(bare.op_id)]);

    const [entry] = await pending(50);
    expect(entry!.payload.match_id).toBe(CANONICAL);
    expect((await db.rows.get(['scouting_entries', 'entry-1']))?.match_id).toBe(CANONICAL);
    expect(await db.rows.get(['matches', LOCAL])).toBeUndefined();
    expect(await db.rows.get(['matches', CANONICAL])).toMatchObject({ number: 80 });
  });

  it('leaves pending, not parked, the entry the same batch sent with the old id', async () => {
    const { bare, entry } = await scoutOnALocalMatch();
    await ackResults([noop(bare.op_id), matchGone(entry.op_id)]);
    const queued = await pending(50);
    expect(queued).toHaveLength(1);
    expect(queued[0]!.payload.match_id).toBe(CANONICAL);
    // No needless rebuild of a match the server already holds.
    expect(queued[0]!.entity).toBe('scouting_entry');
  });

  it('moves an entry submitted later from a screen still on the old id, when its push is refused', async () => {
    const { bare } = await scoutOnALocalMatch();
    await ackResults([noop(bare.op_id)]);
    const late = op({
      row_id: 'entry-2',
      seq: 9,
      payload: { event_id: EVENT, match_id: LOCAL, team_id: 't-2', data: {} },
    });
    await enqueue(late);
    await ackResults([matchGone(late.op_id)]);
    const moved = (await pending(50)).find((o) => o.row_id === 'entry-2');
    expect(moved?.payload.match_id).toBe(CANONICAL);
    expect((await syncStateOf('entry-2'))?.rejection ?? null).toBeNull();
  });

  it('keeps an already cached canonical row rather than overwriting it with the local copy', async () => {
    const { bare } = await scoutOnALocalMatch();
    await db.rows.put({
      entity: 'matches',
      id: CANONICAL,
      event_id: EVENT,
      match_type: 'qualification',
      number: 80,
      updated_at: 'server',
    });
    await ackResults([noop(bare.op_id)]);
    expect((await db.rows.get(['matches', CANONICAL]))?.updated_at).toBe('server');
  });
});
