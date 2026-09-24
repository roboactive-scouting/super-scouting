import { can, isAck, type Operation, type PushResult, type Role } from '@frc/shared';
import { session } from '@/auth/session';
import { db, getMeta, setMeta, type SyncStateRecord } from './db';

/** The detail syncPush gives an operation that failed for a reason not the client's. */
export const TRANSIENT_REJECTION_DETAIL = 'unexpected server error';

export class DeleteNotAllowedError extends Error {
  constructor() {
    super('only a lead or admin may delete an entry');
    this.name = 'DeleteNotAllowedError';
  }
}

/**
 * The author's role as this device knows it: the pulled `users` row (the database is
 * authoritative), else the signed-in user when the author is them, else unknown.
 */
async function authorRole(authorUserId: string): Promise<Role | null> {
  const row = (await db.rows.get(['users', authorUserId])) as { role?: Role } | undefined;
  if (row?.role) return row.role;
  const current = await session.current();
  if (current?.user.id === authorUserId) return current.user.role;
  return null;
}

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
  // SPEC-FINAL 7.6: scouters never delete, and the server refuses it permanently. An op
  // that can never succeed would sit in the outbox forever, breaking the durability
  // rule's assumption that everything queued eventually drains — so it is never queued.
  if (op.action === 'delete') {
    const role = await authorRole(op.author_user_id);
    if (
      role === null ||
      !can({ kind: 'user', userId: op.author_user_id, role }, 'manage_entries')
    ) {
      throw new DeleteNotAllowedError();
    }
  }

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
        // A create's author becomes the row's scouter on the server, so an edit folded
        // into a still-pending create (a lead fixing a scouter's unsynced entry) keeps
        // the original author. Coalesced updates take the latest author as before.
        author_user_id: existing.action === 'create' ? existing.author_user_id : op.author_user_id,
        seq: existing.seq,
      });
    } else {
      await db.outbox.put(op);
    }

    // No `rejection`: new content is a new attempt, so this also UN-PARKS a row whose
    // previous operation was refused (SPEC-FINAL 9.3.1).
    await db.syncState.put({
      row_id: op.row_id,
      sync_state: 'pending',
      acked_at: null,
      origin,
    });
  });
}

/**
 * The operations an automatic push may send, in `seq` order. A PARKED operation (its
 * row carries a recorded rejection, SPEC-FINAL 9.3.1) is excluded: it stays in the
 * outbox and keeps counting as unsynced, but is not retried until a new local edit of
 * the row, or `retryRejected`, un-parks it. This is also what keeps a run of refused
 * operations at the head of the outbox from blocking everything queued behind them.
 * `skip` leaves out op_ids already sent in the current sync.
 */
export async function pending(
  limit: number,
  skip: ReadonlySet<string> = new Set(),
): Promise<Operation[]> {
  const parked = new Set((await rejectedRows()).map((s) => s.row_id));
  return db.outbox
    .orderBy('seq')
    .filter((op) => !parked.has(op.row_id) && !skip.has(op.op_id))
    .limit(limit)
    .toArray();
}

/**
 * Un-parks one row so the next sync sends its operation again — for the sync page
 * (task 1.45). The operation itself is untouched; only the recorded rejection goes.
 */
export async function retryRejected(rowId: string): Promise<void> {
  await db.transaction('rw', db.syncState, async () => {
    const state = await db.syncState.get(rowId);
    if (state?.rejection == null) return;
    await db.syncState.put({ ...state, rejection: null });
  });
}

/** `invalid` + exactly this detail is a transient server failure: retried, never parked. */
function isTransient(result: Extract<PushResult, { status: 'rejected' }>): boolean {
  return result.reason === 'invalid' && result.detail === TRANSIENT_REJECTION_DETAIL;
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

/** Every row whose latest push was refused, for the per-entry sync line. */
export async function rejectedRows(): Promise<SyncStateRecord[]> {
  return db.syncState.filter((s) => s.rejection != null).toArray();
}

/**
 * The durability rule (SPEC-FINAL 9.4): a record leaves the outbox ONLY on a cloud
 * ack for that exact row_id. `rejected` is never an ack. A rejection is recorded on the
 * row's sync state, which PARKS the operation (SPEC-FINAL 9.3.1: "not retried
 * automatically") and lets the UI say why. Every reason parks — `parent-deleted`
 * included, until task 1.40 gives it its own path (9.7). The one exception is a
 * transient server failure: not recorded, not parked, retried on the next sync.
 */
export async function ackResults(results: PushResult[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.outbox, db.syncState, async () => {
    for (const result of results) {
      const op = await db.outbox.get(result.op_id);
      if (!op) continue;
      if (result.status === 'rejected') {
        if (isTransient(result)) continue;
        const state = await db.syncState.get(op.row_id);
        await db.syncState.put({
          row_id: op.row_id,
          sync_state: state?.sync_state ?? 'pending',
          acked_at: state?.acked_at ?? null,
          origin: state?.origin ?? 'local',
          rejection: { code: result.reason, message: result.detail ?? '', at: now },
        });
        continue;
      }
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
