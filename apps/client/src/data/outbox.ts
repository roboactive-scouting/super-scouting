import { isAck, type Operation, type PushResult } from '@frc/shared';
import { db, getMeta, setMeta, type SyncStateRecord } from './db';

const SEQ_KEY = 'outbox.seq';

export async function nextSeq(): Promise<number> {
  const current = await getMeta<number>(SEQ_KEY, 0);
  const next = current + 1;
  await setMeta(SEQ_KEY, next);
  return next;
}

/**
 * SPEC-FINAL 9.4 / D26. At most one pending operation per row_id: a second update
 * replaces the first, keeping the EARLIEST base_version and the LATEST payload and
 * client_updated_at. A delete after a still-pending create removes both without
 * ever contacting the server, since the row never reached it.
 */
export async function enqueue(op: Operation, origin: 'local' | 'qr' = 'local'): Promise<void> {
  await db.transaction('rw', db.outbox, db.syncState, async () => {
    const existing = await db.outbox.where('row_id').equals(op.row_id).first();

    if (existing && op.action === 'delete' && existing.action === 'create') {
      await db.outbox.delete(existing.op_id);
      await db.syncState.delete(op.row_id);
      return;
    }

    if (existing) {
      await db.outbox.delete(existing.op_id);
      await db.outbox.put({
        ...op,
        base_version: existing.base_version,
        action: existing.action === 'create' ? 'create' : op.action,
        seq: existing.seq,
      });
    } else {
      await db.outbox.put(op);
    }

    await db.syncState.put({
      row_id: op.row_id,
      sync_state: 'pending',
      acked_at: null,
      origin,
    });
  });
}

export async function pending(limit: number): Promise<Operation[]> {
  return db.outbox.orderBy('seq').limit(limit).toArray();
}

/**
 * What the connection indicator counts (SPEC-FINAL 9.10): the records a person made,
 * not the operations behind them. A bare match (6.4) only exists to carry an entry and
 * pushes with it, so it is never counted on its own. The wipe guard (9.9) still uses
 * unackedCount, which counts everything.
 */
export async function unsyncedCount(): Promise<number> {
  return db.outbox.filter((op) => op.entity !== 'match').count();
}

export async function unackedCount(): Promise<number> {
  return db.syncState.where('sync_state').equals('pending').count();
}

export async function syncStateOf(rowId: string): Promise<SyncStateRecord | undefined> {
  return db.syncState.get(rowId);
}

/**
 * The durability rule (SPEC-FINAL 9.4): a record leaves the outbox ONLY on a cloud
 * ack for that exact row_id. `rejected` is never an ack.
 */
export async function ackResults(results: PushResult[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.outbox, db.syncState, async () => {
    for (const result of results) {
      const op = await db.outbox.get(result.op_id);
      if (!op) continue;
      if (!isAck(result.status)) continue;
      await db.outbox.delete(result.op_id);
      await db.syncState.put({
        row_id: op.row_id,
        sync_state: 'acked',
        acked_at: now,
        origin: (await db.syncState.get(op.row_id))?.origin ?? 'local',
      });
    }
  });
}
