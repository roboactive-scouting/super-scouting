import { formatCount, type Operation } from '@frc/shared';
import { encodeBatch, QR_BATCH_MAX_OPERATIONS } from '@frc/shared/qr';
import { notifyChanged } from '@/data/changes';
import { db } from '@/data/db';
import { asUtcIso } from '@/data/outbox';
import { matchLabel } from '@/lib/matchLabel';
import { plural } from '@/lib/plural';

/**
 * The QR sender's data (SPEC-FINAL 9.8; task 1.47). Only the lazy QR send page imports this
 * module, so the codec (and fflate behind it) never reaches the initial chunk.
 */

/** One batch on the sender: its frames and what it holds. */
export type QrBatch = {
  /** `encodeBatch`'s frames, each with this batch's own random id in its header. */
  frames: Uint8Array[];
  /** Every row the batch carries (bare matches too): each gets "shown by QR". */
  row_ids: string[];
  /** The records a person made: every operation but a bare match (SPEC-FINAL 9.10). */
  records: number;
  /** "12 entries · 1 super entry". */
  holds: string;
  /** "Q28–Q39" over its match entries when they are all of one match type; else null. */
  matches: string | null;
};

export type QrSendPlan = {
  batches: QrBatch[];
  /** Records in every batch together. */
  records: number;
  /** When the page read the outbox: the batch is fixed then ("saved before 11:44"). */
  read_at: string;
};

/**
 * EVERY operation in this device's outbox, in `seq` order, timestamps as UTC `Z` — the parked
 * (refused) ones too, unlike `pending()`: Sync's Waiting list counts them, and a QR hop is a
 * backup copy, not a push, so a refused record is as worth carrying as any other. Bare matches
 * are carried as well; `splitIntoBatches` puts each with the entries that need it.
 */
export async function readQrOutbox(): Promise<Operation[]> {
  const ops = await db.outbox.orderBy('seq').toArray();
  return ops.map((op) => ({
    ...op,
    client_created_at: asUtcIso(op.client_created_at),
    client_updated_at: asUtcIso(op.client_updated_at),
  }));
}

/** The bare match an entry needs, when that match is itself queued (SPEC-FINAL 6.4). */
const neededMatch = (op: Operation, matches: ReadonlyMap<string, Operation>) => {
  const id = op.entity === 'scouting_entry' ? op.payload.match_id : undefined;
  return typeof id === 'string' ? matches.get(id) : undefined;
};

/**
 * Consecutive batches of at most `max` operations (SPEC-FINAL 9.8: the 200 cap), where **a bare
 * match travels with its entries**: a queued match (6.4) goes into the batch of the first entry
 * that names it, and is repeated in every later batch holding another entry that names it, so a
 * tablet that scans only one batch never holds an entry without its match. Each batch is in
 * `seq` order (a match is queued before its entry, so it comes first). An entry never splits from
 * its match: when the pair does not fit, the batch ends before it rather than run over `max`. A
 * repeat is harmless: the same op_id pushed again is a no-op on the server (syncPush's
 * `applied_operations` ledger answers `noop` with the canonical match id) and the receiver's
 * outbox keeps one operation per row. A queued match that no entry names travels where it stands.
 */
export function splitIntoBatches(
  ops: readonly Operation[],
  max = QR_BATCH_MAX_OPERATIONS,
): Operation[][] {
  const matches = new Map(ops.filter((op) => op.entity === 'match').map((op) => [op.row_id, op]));
  const named = new Set<string>();
  for (const op of ops) {
    const match = neededMatch(op, matches);
    if (match) named.add(match.row_id);
  }
  const batches: Operation[][] = [];
  let batch: Operation[] = [];
  let carried = new Set<string>();
  const close = () => {
    if (batch.length > 0) batches.push(batch.sort((a, b) => a.seq - b.seq));
    batch = [];
    carried = new Set();
  };
  for (const op of ops) {
    // A named match goes with the entries that name it, not where it stands in the queue.
    if (op.entity === 'match' && named.has(op.row_id)) continue;
    const match = neededMatch(op, matches);
    const unit = () => (match && !carried.has(match.row_id) ? [match, op] : [op]);
    if (batch.length + unit().length > max) close();
    for (const item of unit()) {
      batch.push(item);
      if (item.entity === 'match') carried.add(item.row_id);
    }
  }
  close();
  return batches;
}

/** "12 entries · 1 super entry · 2 other records": what a batch holds, bare matches left out. */
export function holdsLine(ops: readonly Operation[]): string {
  let entries = 0;
  let supers = 0;
  let others = 0;
  for (const op of ops) {
    if (op.entity === 'match') continue;
    if (op.entity !== 'scouting_entry') others += 1;
    else if (op.payload.form_kind === 'super') supers += 1;
    else entries += 1;
  }
  const parts = [
    entries > 0 && plural(entries, 'entry', 'entries'),
    supers > 0 && plural(supers, 'super entry', 'super entries'),
    others > 0 && plural(others, 'other record'),
  ].filter((part): part is string => part !== false);
  return parts.join(' · ');
}

const isRecord = (op: Operation) => op.entity !== 'match';

/** "Q28–Q39" (or "Q28"): the batch's match entries, from the cached matches. */
async function matchRange(ops: readonly Operation[]): Promise<string | null> {
  const ids = new Set<string>();
  for (const op of ops) {
    const id = op.entity === 'scouting_entry' ? op.payload.match_id : undefined;
    if (typeof id === 'string') ids.add(id);
  }
  if (ids.size === 0) return null;
  const matches = await Promise.all([...ids].map((id) => db.rows.get(['matches', id])));
  const known = matches.filter((m) => m !== undefined);
  if (known.length === 0) return null;
  const type = String(known[0]!.match_type);
  if (known.some((m) => String(m.match_type) !== type)) return null;
  const numbers = known.map((m) => Number(m.number)).sort((a, b) => a - b);
  const first = matchLabel({ match_type: type, number: numbers[0]! });
  const last = matchLabel({ match_type: type, number: numbers[numbers.length - 1]! });
  return first === last ? first : `${first}–${last}`;
}

/**
 * Reads the outbox ONCE and encodes it: batches of at most 200 operations, each through its own
 * `encodeBatch` call, so each has its own batch id (SPEC-FINAL 9.8). The page never reads again
 * while it is open — a record saved meanwhile waits for the next send (20-qr-send final).
 */
export async function planQrSend(): Promise<QrSendPlan> {
  const read_at = new Date().toISOString();
  const ops = await readQrOutbox();
  const batches: QrBatch[] = [];
  for (const batch of splitIntoBatches(ops)) {
    batches.push({
      frames: encodeBatch(batch),
      row_ids: batch.map((op) => op.row_id),
      records: batch.filter(isRecord).length,
      holds: holdsLine(batch),
      matches: await matchRange(batch),
    });
  }
  return { batches, records: ops.filter(isRecord).length, read_at };
}

/** "205 records · 2 batches", or one batch's own line. */
export function planLine(plan: QrSendPlan): string {
  if (plan.batches.length === 1) return plan.batches[0]!.holds;
  return `${plural(plan.records, 'record')} · ${formatCount(plan.batches.length)} batches`;
}

/**
 * "shown by QR hh:mm" (SPEC-FINAL 9.10): stamps `qr_shown_at` on each row's sync state, and
 * nothing else — never `sync_state`, `acked_at`, `origin` or `rejection`; a scan is not an ack.
 * A row with no sync state is left alone (`modify` touches only the rows it finds).
 */
export async function markShownByQr(rowIds: readonly string[], at: string): Promise<void> {
  if (rowIds.length === 0) return;
  await db.syncState
    .where('row_id')
    .anyOf([...rowIds])
    .modify((state) => {
      state.qr_shown_at = at;
    });
  notifyChanged('outbox');
}
