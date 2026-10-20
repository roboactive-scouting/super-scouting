import type { Operation, PullEntityKey } from '@frc/shared';
import { cachedRows } from './cache';
import { notifyChanged } from './changes';
import { db, getMeta, setMeta, WATERMARK_KEY, type CachedRow, type SyncStateRecord } from './db';
import { nextSeq, QR_DISPOSED_KEY, type QrDisposal } from './outbox';

/**
 * The QR receiver's data (SPEC-FINAL 9.8; task 1.48): received copies land in this device's
 * dataset AND its outbox, wait there for the cloud, and are disposed of on their ack and never
 * before (ackResults). Only lazy modules import this one: the receive page and the Sync page.
 */

/** Where a received operation's row lives in the dataset; other entities go to the outbox only. */
const DATASET: Partial<Record<Operation['entity'], PullEntityKey>> = {
  scouting_entry: 'scouting_entries',
  match: 'matches',
};

const time = (value: unknown): number => (typeof value === 'string' ? Date.parse(value) : NaN);

/** The latest of the given times that parse, or null when none does. */
function latest(...values: unknown[]): number | null {
  const times = values.map(time).filter((t) => !Number.isNaN(t));
  return times.length === 0 ? null : Math.max(...times);
}

/** A received operation's row, written as the device's own save writes it (submitEntry, 6.4). */
function datasetRow(op: Operation, table: PullEntityKey, row: CachedRow | undefined): CachedRow {
  if (table === 'matches') {
    return {
      ...op.payload,
      entity: 'matches',
      id: op.row_id,
      version: Number(row?.version ?? 1),
      updated_at: op.client_updated_at,
    };
  }
  return {
    ...op.payload,
    entity: table,
    id: op.row_id,
    // The scouter is the payload's; a copy is never re-authored (9.8).
    scouter_id: op.payload.scouter_id ?? row?.scouter_id ?? op.author_user_id,
    version: Number(row?.version ?? op.base_version ?? 1),
    client_created_at: op.client_created_at,
    client_updated_at: op.client_updated_at,
    updated_at: op.client_updated_at,
    deleted_at: null,
  };
}

export type ReceiveResult = {
  /** Operations written into the dataset and the outbox. */
  written: number;
  /** Already held: the same copy again, or the device holds a newer change of the row. */
  unchanged: number;
};

/**
 * SPEC-FINAL 9.8: writes a complete batch into this device's dataset AND its outbox, each copy
 * marked `origin: 'qr'` and `received_by_qr`, with the time of the scan. Copies keep their
 * original op_id, row_id, author, client timestamps and base version — **never re-authored**;
 * only the outbox's local `seq` is new, in the sender's order, so a bare match still goes ahead
 * of its entry. **Additive and idempotent**: the same copy again (a re-scan, or a bare match
 * repeated in several batches) changes nothing but its last-scan time, and a copy older than
 * what the device holds for that row (its queued operation, else its cached row) is skipped, so
 * a re-scanned old batch never overwrites a newer change. A copy never replaces an operation this
 * device queued itself (9.4), only an earlier received copy. One transaction: a failure writes
 * nothing.
 */
export async function receiveOperations(
  operations: readonly Operation[],
  at: string = new Date().toISOString(),
): Promise<ReceiveResult> {
  const ordered = [...operations].sort((a, b) => a.seq - b.seq);
  const result: ReceiveResult = { written: 0, unchanged: 0 };
  await db.transaction('rw', [db.rows, db.outbox, db.syncState, db.meta], async () => {
    for (const op of ordered) {
      const queued = await db.outbox.where('row_id').equals(op.row_id).first();
      const state = await db.syncState.get(op.row_id);
      if (queued?.op_id === op.op_id) {
        if (state?.received_by_qr) await db.syncState.put({ ...state, received_at: at });
        result.unchanged += 1;
        continue;
      }
      // SPEC-FINAL 9.4: an operation leaves the outbox ONLY on a cloud ack. A queued operation of
      // this device's own (a lead's correction of a received entry, its own unsent edit) is
      // never replaced by a copy, however new — nor is its cached row. The sender keeps its own
      // copy pending (9.8), and the server's base-version rule (9.5) settles the two edits. Only
      // a queued copy received earlier (still `origin: 'qr'`) gives way to a newer copy.
      if (queued && state?.origin !== 'qr') {
        result.unchanged += 1;
        continue;
      }
      const table = DATASET[op.entity];
      const row = table ? await db.rows.get([table, op.row_id]) : undefined;
      const held = latest(queued?.client_updated_at, row?.client_updated_at ?? row?.updated_at);
      if (held !== null && held >= time(op.client_updated_at)) {
        result.unchanged += 1;
        continue;
      }
      if (queued) await db.outbox.delete(queued.op_id);
      await db.outbox.put({ ...op, seq: await nextSeq() });
      // A fresh state: new content is a new attempt, so a parked row is un-parked (9.3.1).
      await db.syncState.put({
        row_id: op.row_id,
        sync_state: 'pending',
        acked_at: null,
        origin: 'qr',
        received_by_qr: true,
        received_at: at,
      });
      if (table) {
        if (op.action === 'delete') {
          await db.rows.where('[entity+id]').equals([table, op.row_id]).delete();
        } else {
          await db.rows.put(datasetRow(op, table, row));
        }
      }
      result.written += 1;
    }
  });
  notifyChanged('outbox');
  notifyChanged('rows');
  return result;
}

/**
 * The records among `states` the way the Sync count reads them: bare matches (6.4) are not
 * records of their own. When only bare matches are left they are counted, so a count is never
 * 0 while anything is held.
 */
async function recordCount(states: readonly SyncStateRecord[]): Promise<number> {
  let records = 0;
  for (const state of states) {
    const op = await db.outbox.where('row_id').equals(state.row_id).first();
    const row = op ? undefined : await db.rows.where('id').equals(state.row_id).first();
    const entity = op ? op.entity : row?.entity === 'matches' ? 'match' : 'scouting_entry';
    if (entity !== 'match') records += 1;
  }
  return records === 0 ? states.length : records;
}

/**
 * The received copies: `unacked`, those that have not reached the cloud (still pending, or still
 * in the outbox), and `present`, the acked ones whose row is still in the dataset — what Discard
 * would remove. An acked copy whose row has left (its event evicted, its form version pruned) is
 * in neither: there is nothing of it to discard, so it is never counted or promised.
 */
async function receivedCopies(): Promise<{
  unacked: SyncStateRecord[];
  present: SyncStateRecord[];
}> {
  // `origin: 'qr'` alone also counts: a copy still marked so has not been acked.
  const received = await db.syncState
    .filter((s) => s.received_by_qr === true || s.origin === 'qr')
    .toArray();
  const queued = new Set<string>();
  await db.outbox.each((op) => queued.add(op.row_id));
  const unacked: SyncStateRecord[] = [];
  const present: SyncStateRecord[] = [];
  for (const state of received) {
    if (state.sync_state !== 'acked' || queued.has(state.row_id)) unacked.push(state);
    else if ((await db.rows.where('id').equals(state.row_id).count()) > 0) present.push(state);
  }
  return { unacked, present };
}

export type DiscardResult = { discarded: number; refused: number };

/**
 * SPEC-FINAL 9.8's escape hatch, "Discard received QR data": removes every received copy — its
 * row from the dataset and its sync state. **Refused whole** while any received copy has no cloud
 * ack (the wipe guard of 9.9): it removes nothing and reports how many it would refuse. The
 * device's own records are never touched. Counts are records (bare matches go unlisted), the
 * same count More and the confirm show (`receivedQrState`).
 *
 * Every row it removes is a cloud row that a delta pull would never send again, so the same
 * transaction clears the sync watermark: the next sync pulls the event in full and the rows of
 * the current event come back (a wrong event's stay gone). The hydration mark stays, so the
 * offline gate is unchanged.
 */
export async function discardReceivedQrData(): Promise<DiscardResult> {
  const outcome = await db.transaction(
    'rw',
    [db.rows, db.outbox, db.syncState, db.meta],
    async () => {
      const { unacked, present } = await receivedCopies();
      if (unacked.length > 0) return { discarded: 0, refused: await recordCount(unacked) };
      if (present.length === 0) return { discarded: 0, refused: 0 };
      const records = await recordCount(present);
      for (const state of present) {
        await db.rows.where('id').equals(state.row_id).delete();
        await db.syncState.delete(state.row_id);
      }
      await setMeta(WATERMARK_KEY, null);
      return { discarded: records, refused: 0 };
    },
  );
  if (outcome.discarded > 0) {
    notifyChanged('rows');
    notifyChanged('outbox');
    notifyChanged('meta');
  }
  return outcome;
}

/** What Sync's More says about "Discard received QR data". */
export type ReceivedQrState = {
  /** Received copies still waiting for the cloud: the action is held while this is above 0. */
  held: number;
  /** Received copies already acked: what the action would remove. */
  discardable: number;
};

export async function receivedQrState(): Promise<ReceivedQrState> {
  const { unacked, present } = await receivedCopies();
  if (unacked.length > 0) return { held: await recordCount(unacked), discardable: 0 };
  return { held: 0, discardable: present.length === 0 ? 0 : await recordCount(present) };
}

/** One scouter on Sync's "Received by QR" block (17-sync final, phone image 6). */
export type ReceivedAuthor = {
  author_user_id: string;
  /** The cached user's full name; null when this device does not hold them ("a scouter"). */
  name: string | null;
  count: number;
  /** The latest scan of any of their waiting copies. */
  last_scan_at: string | null;
};

export type ReceivedByQr = { total: number; authors: ReceivedAuthor[] };

/**
 * The received copies still waiting for the cloud, by author (SPEC-FINAL 9.10): what sits in
 * the outbox marked `origin: 'qr'`, bare matches left out (the Waiting count's rule). An acked
 * copy has left the outbox and is not counted: it is under Sent. Latest scan first.
 */
export async function readReceivedByQr(): Promise<ReceivedByQr> {
  const [ops, states, users] = await Promise.all([
    db.outbox.toArray(),
    db.syncState.where('origin').equals('qr').toArray(),
    cachedRows<{ id: string; full_name?: unknown }>('users'),
  ]);
  const stateOf = new Map(states.map((s) => [s.row_id, s]));
  const nameOf = new Map(
    users.map((u) => [u.id, typeof u.full_name === 'string' && u.full_name ? u.full_name : null]),
  );
  const byAuthor = new Map<string, ReceivedAuthor>();
  for (const op of ops) {
    if (op.entity === 'match') continue;
    const state = stateOf.get(op.row_id);
    if (!state) continue;
    const author = byAuthor.get(op.author_user_id) ?? {
      author_user_id: op.author_user_id,
      name: nameOf.get(op.author_user_id) ?? null,
      count: 0,
      last_scan_at: null,
    };
    author.count += 1;
    const scan = state.received_at ?? null;
    if (scan !== null && (author.last_scan_at === null || scan > author.last_scan_at)) {
      author.last_scan_at = scan;
    }
    byAuthor.set(op.author_user_id, author);
  }
  const authors = [...byAuthor.values()].sort(
    (a, b) =>
      (b.last_scan_at ?? '').localeCompare(a.last_scan_at ?? '') ||
      b.count - a.count ||
      (a.name ?? '￿').localeCompare(b.name ?? '￿'),
  );
  return { total: authors.reduce((n, a) => n + a.count, 0), authors };
}

/** What the receive page's done screen says about a batch (21-qr-receive final). */
export type BatchSummary = {
  /** Records a person made: every operation but a bare match. */
  records: number;
  entries: number;
  supers: number;
  others: number;
  /** Each author's first name, from the cached users; null for one this device does not hold. */
  authors: (string | null)[];
};

export async function describeBatch(operations: readonly Operation[]): Promise<BatchSummary> {
  const users = await cachedRows<{ id: string; full_name?: unknown }>('users');
  return summarizeBatch(operations, new Map(users.map((u) => [u.id, u.full_name])));
}

/**
 * The done screen's summary from the operations alone; an author missing from `nameOf` (or
 * every author, when the cached users could not be read) is null — "a scouter".
 */
export function summarizeBatch(
  operations: readonly Operation[],
  nameOf: ReadonlyMap<string, unknown> = new Map(),
): BatchSummary {
  const records = operations.filter((op) => op.entity !== 'match');
  const authorIds = [
    ...new Set((records.length > 0 ? records : operations).map((op) => op.author_user_id)),
  ];
  const first = (full: unknown) =>
    typeof full === 'string' && full.trim() ? (full.trim().split(/\s+/)[0] ?? null) : null;
  return {
    records: records.length,
    entries: records.filter(
      (op) => op.entity === 'scouting_entry' && op.payload.form_kind !== 'super',
    ).length,
    supers: records.filter(
      (op) => op.entity === 'scouting_entry' && op.payload.form_kind === 'super',
    ).length,
    others: records.filter((op) => op.entity !== 'scouting_entry').length,
    authors: authorIds.map((id) => first(nameOf.get(id))),
  };
}

/**
 * Sync's success notice (SPEC-FINAL 9.8, task 1.48): how many received copies the cloud has
 * acked — and so left the outbox — since it was last dismissed; null when there is nothing new.
 */
export async function qrDisposal(): Promise<QrDisposal | null> {
  const value = await getMeta<QrDisposal | null>(QR_DISPOSED_KEY, null);
  return value && value.count > 0 ? value : null;
}

export async function dismissQrDisposal(): Promise<void> {
  await setMeta(QR_DISPOSED_KEY, null);
  notifyChanged('meta');
}
