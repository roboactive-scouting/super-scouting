import { beforeEach, describe, expect, it } from 'vitest';
import type { Operation, PushResult } from '@frc/shared';
import { db } from './db';
import { ackResults, enqueue, nextSeq, pending, syncStateOf, unackedCount } from './outbox';

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

  it('cancels a create that is deleted before it ever reached the server', async () => {
    await enqueue(op({ action: 'create' }));
    await enqueue(op({ action: 'delete', base_version: 1, payload: {} }));
    expect(await pending(50)).toHaveLength(0);
    expect(await unackedCount()).toBe(0);
  });

  it('keeps a delete of a row the server already knows about', async () => {
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
    expect(await pending(50)).toHaveLength(1);
    expect((await syncStateOf('row-1'))?.sync_state).toBe('pending');
  });

  it('returns pending operations in seq order and never more than the limit', async () => {
    for (let i = 0; i < 250; i += 1) await enqueue(op({ row_id: `row-${i}`, seq: 250 - i }));
    const batch = await pending(200);
    expect(batch).toHaveLength(200);
    expect(batch.map((o) => o.seq)).toEqual([...batch.map((o) => o.seq)].sort((a, b) => a - b));
  });
});
