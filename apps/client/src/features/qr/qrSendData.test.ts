import { beforeEach, describe, expect, it } from 'vitest';
import type { Operation } from '@frc/shared';
import { newCollector, QR_BATCH_MAX_OPERATIONS } from '@frc/shared/qr';
import { db } from '@/data/db';
import { planQrSend, splitIntoBatches } from './qrSendData';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AT = '2026-11-14T09:00:00.000Z';
const AUTHOR = uuid(999_999);

/** A bare match (SPEC-FINAL 6.4) queued at `seq`. */
const match = (n: number, seq: number): Operation => ({
  op_id: uuid(500_000 + n),
  entity: 'match',
  row_id: uuid(600_000 + n),
  action: 'create',
  base_version: null,
  payload: { event_id: 'ev-1', match_type: 'qualification', number: n },
  author_user_id: AUTHOR,
  client_created_at: AT,
  client_updated_at: AT,
  seq,
});

/** An entry queued at `seq`, on match `matchNumber`'s queued bare match, or on a cached one. */
const entry = (seq: number, matchNumber: number | null): Operation => ({
  op_id: uuid(seq),
  entity: 'scouting_entry',
  row_id: uuid(100_000 + seq),
  action: 'create',
  base_version: null,
  payload: {
    event_id: 'ev-1',
    form_kind: 'match',
    team_id: 't-1',
    match_id: matchNumber === null ? 'm-cached' : uuid(600_000 + matchNumber),
  },
  author_user_id: AUTHOR,
  client_created_at: AT,
  client_updated_at: AT,
  seq,
});

/** Every entry in each batch has its queued bare match in that batch, ahead of it. */
function expectMatchesTravelWithEntries(batches: Operation[][], queued: Operation[]) {
  const queuedIds = new Set(queued.filter((op) => op.entity === 'match').map((op) => op.row_id));
  for (const batch of batches) {
    batch.forEach((op, at) => {
      const id = op.payload.match_id;
      if (op.entity !== 'scouting_entry' || typeof id !== 'string' || !queuedIds.has(id)) return;
      const where = batch.findIndex((o) => o.entity === 'match' && o.row_id === id);
      expect(where, `${op.row_id} travels without its match`).toBeGreaterThanOrEqual(0);
      expect(where).toBeLessThan(at);
    });
  }
}

describe('splitIntoBatches: a bare match travels with its entries (SPEC-FINAL 6.4, 9.8)', () => {
  it('puts a match in the batch of the first entry that names it, ahead of it', () => {
    // 1 match, then 3 entries on a cached match, then the entry that names the match.
    const ops = [match(41, 1), entry(2, null), entry(3, null), entry(4, null), entry(5, 41)];
    const batches = splitIntoBatches(ops, 4);
    expect(batches.map((b) => b.map((op) => op.seq))).toEqual([
      [2, 3, 4],
      [1, 5],
    ]);
    expectMatchesTravelWithEntries(batches, ops);
  });

  it('repeats a match in every later batch that holds an entry naming it', () => {
    const ops = [match(41, 1), entry(2, 41), entry(3, null), entry(4, null), entry(5, 41)];
    const batches = splitIntoBatches(ops, 3);
    expect(batches.map((b) => b.map((op) => op.seq))).toEqual([
      [1, 2, 3],
      [1, 4, 5],
    ]);
    // The repeat is the same operation (same op_id): a replay is a no-op on the server.
    expect(batches[1]![0]).toBe(batches[0]![0]);
    expectMatchesTravelWithEntries(batches, ops);
  });

  it('ends a batch early rather than split a pair or run over the cap', () => {
    const ops = [entry(1, null), entry(2, null), match(41, 3), entry(4, 41)];
    const batches = splitIntoBatches(ops, 3);
    expect(batches.map((b) => b.map((op) => op.seq))).toEqual([
      [1, 2],
      [3, 4],
    ]);
    for (const batch of batches) expect(batch.length).toBeLessThanOrEqual(3);
  });

  it('carries a match no entry names where it stands', () => {
    const ops = [entry(1, null), match(41, 2), entry(3, null)];
    expect(splitIntoBatches(ops, 200).map((b) => b.map((op) => op.seq))).toEqual([[1, 2, 3]]);
  });

  it('never loses or adds an entry, and keeps every batch at or under 200', () => {
    const ops: Operation[] = [];
    let seq = 0;
    for (let k = 0; k < 450; k += 1) {
      if (k % 3 === 0) ops.push(match(k, (seq += 1)));
      ops.push(entry((seq += 1), k % 3 === 0 ? k : k % 5 === 0 ? k - (k % 3) : null));
    }
    const batches = splitIntoBatches(ops);
    for (const batch of batches) expect(batch.length).toBeLessThanOrEqual(QR_BATCH_MAX_OPERATIONS);
    const entries = batches.flat().filter((op) => op.entity === 'scouting_entry');
    expect(entries.map((op) => op.seq)).toEqual(
      ops.filter((op) => op.entity === 'scouting_entry').map((op) => op.seq),
    );
    expectMatchesTravelWithEntries(batches, ops);
  });
});

describe('planQrSend: the encoded batches keep each entry with its match', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('a tablet that scans only batch 2 still gets the match its entries name', async () => {
    // Q41 is new on this phone: its bare match is queued first, its first entry right after;
    // 199 entries on cached matches follow, then more entries on Q41, over the 200 cap.
    const ops = [match(41, 1), entry(2, 41)];
    for (let seq = 3; seq <= 201; seq += 1) ops.push(entry(seq, null));
    ops.push(entry(202, 41), entry(203, 41));
    await db.outbox.bulkPut(ops);

    const plan = await planQrSend();
    expect(plan.batches).toHaveLength(2);
    const decoded = plan.batches.map((batch) => {
      const collector = newCollector();
      for (const frame of batch.frames) collector.add(frame);
      return collector.result();
    });
    expect(decoded[0]!.length).toBeLessThanOrEqual(QR_BATCH_MAX_OPERATIONS);
    expect(decoded[1]!.map((op) => op.seq)).toEqual([1, 201, 202, 203]);
    expectMatchesTravelWithEntries(decoded, ops);
    expect(plan.batches[1]!.records).toBe(3);
    expect(plan.records).toBe(202);
  });
});
