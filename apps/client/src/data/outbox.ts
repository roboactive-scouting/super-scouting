import {
  can,
  isAck,
  PARENT_DELETED_DETAIL,
  type Operation,
  type PushResult,
  type Role,
} from '@frc/shared';
import { session } from '@/auth/session';
import { notifyChanged } from './changes';
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

/**
 * A timestamp as the push protocol takes it: UTC with a `Z` (operationSchema refuses an
 * offset). A pulled row carries Postgres's form, `…+00:00`, so a value read back from the
 * cache must pass through here before it goes into an operation (UF.12). Left as it is
 * when it does not parse: the server then refuses that one operation, visibly.
 */
export function asUtcIso(value: string): string {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
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
  notifyChanged('outbox');
}

/**
 * The operations an automatic push may send, in `seq` order. A PARKED operation (its
 * row carries a recorded rejection, SPEC-FINAL 9.3.1) is excluded: it stays in the
 * outbox and keeps counting as unsynced, but is not retried until a new local edit of
 * the row, or `retryRejected`, un-parks it. This is also what keeps a run of refused
 * operations at the head of the outbox from blocking everything queued behind them.
 * `skip` leaves out op_ids already sent in the current sync. Timestamps go out as UTC
 * `Z` (asUtcIso), which also mends an edit queued before UF.12 with a pulled `+00:00`.
 */
export async function pending(
  limit: number,
  skip: ReadonlySet<string> = new Set(),
): Promise<Operation[]> {
  const parked = new Set((await rejectedRows()).map((s) => s.row_id));
  const ops = await db.outbox
    .orderBy('seq')
    .filter((op) => !parked.has(op.row_id) && !skip.has(op.op_id))
    .limit(limit)
    .toArray();
  return ops.map((op) => ({
    ...op,
    client_created_at: asUtcIso(op.client_created_at),
    client_updated_at: asUtcIso(op.client_updated_at),
  }));
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
  notifyChanged('outbox');
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
 * Every match id the outbox still needs: a queued bare match, and the match of every
 * queued entry, parked ones included. A pull never drops these from the cache (UF.1): the
 * rebuild below works from the cached row.
 */
export async function matchIdsNeededByOutbox(): Promise<Set<string>> {
  const needed = new Set<string>();
  await db.outbox.each((op) => {
    if (op.entity === 'match') needed.add(op.row_id);
    const matchId = op.entity === 'scouting_entry' ? op.payload.match_id : undefined;
    if (typeof matchId === 'string') needed.add(matchId);
  });
  return needed;
}

/** Old bare-match id → the canonical id the server kept (see remapMatch). */
const MATCH_REMAP = 'outbox.match_remap';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SPEC-FINAL 6.4, 9.3.1: the server answered a bare match with ANOTHER id — two offline
 * devices created the same match number, and the server kept the first. Everything on this
 * device that names the old id moves to the canonical one: the queued entries' match_id,
 * the cached entries, and the cached match row itself (one row per match, or the picker
 * finds the stale copy). The pair is remembered, so an entry submitted later from a screen
 * still open on the old id is moved when its push is refused. Returns the op_ids rewritten.
 */
async function remapMatch(oldId: string, newId: string): Promise<string[]> {
  const rewritten: string[] = [];
  const entries = await db.outbox
    .filter((op) => op.entity === 'scouting_entry' && op.payload.match_id === oldId)
    .toArray();
  for (const op of entries) {
    await db.outbox.put({ ...op, payload: { ...op.payload, match_id: newId } });
    rewritten.push(op.op_id);
  }
  const cached = await db.rows.where('match_id').equals(oldId).toArray();
  for (const row of cached) {
    if (row.entity === 'scouting_entries') await db.rows.put({ ...row, match_id: newId });
  }
  const local = await db.rows.get(['matches', oldId]);
  if (local) {
    if (!(await db.rows.get(['matches', newId]))) await db.rows.put({ ...local, id: newId });
    await db.rows.where('[entity+id]').equals(['matches', oldId]).delete();
  }
  const remap = await getMeta<Record<string, string>>(MATCH_REMAP, {});
  await setMeta(MATCH_REMAP, { ...remap, [oldId]: newId });
  return rewritten;
}

/**
 * SPEC-FINAL 9.7 (amended v1.18): an entry refused because its MATCH is gone is not
 * discarded. A match is only event + type + number, so the bare match create is queued
 * again from the cached row, under the cached id, ahead of the entry (it takes the entry's
 * seq; the entry moves behind it), and the entry is left pending for the next sync to send
 * both. Returns false when the rebuild is impossible — another parent is gone, the event or
 * the match row is no longer cached, or the match's own push was refused — and the caller
 * then records the rejection as before.
 *
 * Loop guards: only the server's "match" detail rebuilds; a bare match already queued for
 * that row is never queued twice (a parked one parks the entry too); and syncNow sends an
 * operation at most once per sync, so this runs at most once per operation per sync.
 */
async function rebuildMatchFor(
  op: Operation,
  result: Extract<PushResult, { status: 'rejected' }>,
): Promise<boolean> {
  if (result.detail !== PARENT_DELETED_DETAIL.match) return false;
  const matchId = op.payload.match_id;
  if (typeof matchId !== 'string') return false;

  // Sent with an id this device has since remapped: send it again with the canonical one.
  const canonical = (await getMeta<Record<string, string>>(MATCH_REMAP, {}))[matchId];
  if (canonical !== undefined) {
    await db.outbox.put({ ...op, payload: { ...op.payload, match_id: canonical } });
    return true;
  }

  if (!UUID.test(matchId)) return false;
  const match = await db.rows.get(['matches', matchId]);
  const eventId = match?.event_id;
  if (!match || typeof eventId !== 'string' || !(await db.rows.get(['events', eventId]))) {
    return false;
  }

  const queued = await db.outbox.where('row_id').equals(matchId).first();
  if (queued) {
    if ((await db.syncState.get(matchId))?.rejection != null) return false;
    if (queued.seq > op.seq) await db.outbox.put({ ...op, seq: await nextSeq() });
    return true;
  }

  const at = new Date().toISOString();
  await db.outbox.put({
    op_id: crypto.randomUUID(),
    entity: 'match',
    row_id: matchId,
    action: 'create',
    base_version: null,
    payload: { event_id: eventId, match_type: match.match_type, number: match.number },
    author_user_id: op.author_user_id,
    client_created_at: at,
    client_updated_at: at,
    seq: op.seq,
  });
  await db.syncState.put({
    row_id: matchId,
    sync_state: 'pending',
    acked_at: null,
    origin: 'local',
  });
  await db.outbox.put({ ...op, seq: await nextSeq() });
  return true;
}

/**
 * The durability rule (SPEC-FINAL 9.4): a record leaves the outbox ONLY on a cloud
 * ack for that exact row_id. `rejected` is never an ack. A rejection is recorded on the
 * row's sync state, which PARKS the operation (SPEC-FINAL 9.3.1: "not retried
 * automatically") and lets the UI say why. Every reason parks, with two exceptions: a
 * transient server failure (not recorded, retried on the next sync), and an entry whose
 * match is gone, which rebuildMatchFor re-queues behind a new bare match (9.7, v1.18).
 * A bare match answered with another id remaps everything that names it (remapMatch).
 */
export async function ackResults(results: PushResult[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', [db.outbox, db.syncState, db.rows, db.meta], async () => {
    // Entries this pass already moved to a canonical match id: a refusal of the copy that
    // was sent with the old id is answered by the move itself.
    const remapped = new Set<string>();
    for (const result of results) {
      const op = await db.outbox.get(result.op_id);
      if (!op) continue;
      if (result.status === 'rejected') {
        if (isTransient(result)) continue;
        if (
          result.reason === 'parent-deleted' &&
          op.entity === 'scouting_entry' &&
          (remapped.has(op.op_id) || (await rebuildMatchFor(op, result)))
        ) {
          // Un-parked: the next sync sends it.
          const state = await db.syncState.get(op.row_id);
          if (state?.rejection != null) await db.syncState.put({ ...state, rejection: null });
          continue;
        }
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
      if (op.entity === 'match' && result.row_id !== op.row_id) {
        for (const opId of await remapMatch(op.row_id, result.row_id)) remapped.add(opId);
      }
      await db.outbox.delete(result.op_id);
      await db.syncState.put({
        row_id: op.row_id,
        sync_state: 'acked',
        acked_at: now,
        origin: (await db.syncState.get(op.row_id))?.origin ?? 'local',
      });
    }
  });
  notifyChanged('outbox');
}
