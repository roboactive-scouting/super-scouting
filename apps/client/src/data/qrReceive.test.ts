import { beforeEach, describe, expect, it } from 'vitest';
import type { Operation } from '@frc/shared';
import { db } from './db';
import { ackResults, enqueue, pending, syncStateOf } from './outbox';
import {
  discardReceivedQrData,
  dismissQrDisposal,
  qrDisposal,
  readReceivedByQr,
  receivedQrState,
  receiveOperations,
} from './qrReceive';

const foreign = (rowId: string): Operation => ({
  op_id: `o-${rowId}`,
  entity: 'scouting_entry',
  row_id: rowId,
  action: 'create',
  base_version: null,
  payload: {
    event_id: 'ev-1',
    team_id: 't-1',
    match_id: 'm-1',
    form_kind: 'match',
    data: { auto_notes: 2 },
  },
  author_user_id: 'u-other',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: 7,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('QR receive (SPEC-FINAL 9.8)', () => {
  it('writes each operation into the dataset AND the outbox, marked origin qr', async () => {
    await receiveOperations([foreign('e-1')]);
    expect(await db.rows.get(['scouting_entries', 'e-1'])).toBeDefined();
    expect(await pending(10)).toHaveLength(1);
    expect((await syncStateOf('e-1'))!.origin).toBe('qr');
  });

  it('never re-authors a copy', async () => {
    await receiveOperations([foreign('e-1')]);
    const [op] = await pending(10);
    expect(op!.author_user_id).toBe('u-other');
    expect(op!.row_id).toBe('e-1');
    expect(op!.client_created_at).toBe('2026-11-14T09:00:00.000Z');
  });

  it('is idempotent: scanning the same batch twice changes nothing', async () => {
    await receiveOperations([foreign('e-1')]);
    await receiveOperations([foreign('e-1')]);
    expect(await pending(10)).toHaveLength(1);
    expect(await db.rows.where('entity').equals('scouting_entries').count()).toBe(1);
  });

  it('drops the copy from the outbox on ack but keeps the row in the dataset', async () => {
    await receiveOperations([foreign('e-1')]);
    await ackResults([{ op_id: 'o-e-1', status: 'applied', row_id: 'e-1', new_version: 1 }]);
    expect(await pending(10)).toHaveLength(0);
    expect(await db.rows.get(['scouting_entries', 'e-1'])).toBeDefined();
    expect((await syncStateOf('e-1'))!.origin).toBe('local');
  });

  it('never discards a QR copy before its ack, however long that takes', async () => {
    await receiveOperations([foreign('e-1')]);
    const result = await discardReceivedQrData();
    expect(result).toEqual({ discarded: 0, refused: 1 });
    expect(await pending(10)).toHaveLength(1);
  });

  it('discards acked QR copies when asked, and stops rather than partially clearing', async () => {
    await receiveOperations([foreign('e-1'), foreign('e-2')]);
    await ackResults([{ op_id: 'o-e-1', status: 'applied', row_id: 'e-1', new_version: 1 }]);
    const result = await discardReceivedQrData();
    expect(result).toEqual({ discarded: 0, refused: 1 });
    await ackResults([{ op_id: 'o-e-2', status: 'applied', row_id: 'e-2', new_version: 1 }]);
    expect(await discardReceivedQrData()).toEqual({ discarded: 2, refused: 0 });
  });

  it('leaves the device’s own records alone', async () => {
    await db.rows.put({ entity: 'scouting_entries', id: 'mine', event_id: 'ev-1' });
    await db.syncState.put({
      row_id: 'mine',
      sync_state: 'acked',
      acked_at: 'now',
      origin: 'local',
    });
    await receiveOperations([foreign('e-1')]);
    await ackResults([{ op_id: 'o-e-1', status: 'applied', row_id: 'e-1', new_version: 1 }]);
    await discardReceivedQrData();
    expect(await db.rows.get(['scouting_entries', 'mine'])).toBeDefined();
  });
});

describe('QR receive: the guards behind 9.8 (task 1.48)', () => {
  const later = (rowId: string, at: string, opId = `o2-${rowId}`): Operation => ({
    ...foreign(rowId),
    op_id: opId,
    action: 'update',
    base_version: 1,
    client_updated_at: at,
    payload: { ...foreign(rowId).payload, data: { auto_notes: 5 } },
  });

  it('never disposes of a copy before its ack: a refused push keeps it, marked qr, in the outbox', async () => {
    await receiveOperations([foreign('e-1')]);
    await ackResults([
      { op_id: 'o-e-1', status: 'rejected', reason: 'forbidden', detail: 'not allowed' },
    ]);
    expect(await db.outbox.count()).toBe(1);
    expect((await syncStateOf('e-1'))!.origin).toBe('qr');
    expect((await syncStateOf('e-1'))!.received_by_qr).toBe(true);
    expect(await discardReceivedQrData()).toEqual({ discarded: 0, refused: 1 });
  });

  it('keeps the row and its permanent marker after the ack, and counts the disposal for Sync', async () => {
    await receiveOperations([foreign('e-1')], '2026-11-14T09:44:00.000Z');
    await ackResults([{ op_id: 'o-e-1', status: 'applied', row_id: 'e-1', new_version: 1 }]);
    const state = (await syncStateOf('e-1'))!;
    expect(state).toMatchObject({ sync_state: 'acked', origin: 'local', received_by_qr: true });
    expect(state.received_at).toBe('2026-11-14T09:44:00.000Z');
    expect(await db.rows.get(['scouting_entries', 'e-1'])).toMatchObject({
      scouter_id: 'u-other',
      client_created_at: '2026-11-14T09:00:00.000Z',
    });
    expect(await qrDisposal()).toMatchObject({ count: 1 });
    await dismissQrDisposal();
    expect(await qrDisposal()).toBeNull();
  });

  it('a newer copy of the row replaces the older one; an older copy never overwrites a newer', async () => {
    await receiveOperations([foreign('e-1')]);
    await receiveOperations([later('e-1', '2026-11-14T09:05:00.000Z')]);
    let [op] = await pending(10);
    expect(op!.op_id).toBe('o2-e-1');
    // The first batch scanned again, after the newer one: nothing goes back.
    expect(await receiveOperations([foreign('e-1')])).toEqual({ written: 0, unchanged: 1 });
    [op] = await pending(10);
    expect(op!.op_id).toBe('o2-e-1');
    expect((await db.rows.get(['scouting_entries', 'e-1']))!.data).toEqual({ auto_notes: 5 });
  });

  it('an acked copy scanned again is not queued again', async () => {
    await receiveOperations([foreign('e-1')]);
    await ackResults([{ op_id: 'o-e-1', status: 'applied', row_id: 'e-1', new_version: 1 }]);
    expect(await receiveOperations([foreign('e-1')])).toEqual({ written: 0, unchanged: 1 });
    expect(await pending(10)).toHaveLength(0);
  });

  it('refreshes the last-scan time when the same copy is scanned again', async () => {
    await receiveOperations([foreign('e-1')], '2026-11-14T09:40:00.000Z');
    await receiveOperations([foreign('e-1')], '2026-11-14T09:44:00.000Z');
    expect((await syncStateOf('e-1'))!.received_at).toBe('2026-11-14T09:44:00.000Z');
  });

  it('writes a batch in one transaction: a failure part-way writes nothing', async () => {
    const broken = { ...foreign('e-2'), row_id: undefined } as unknown as Operation;
    await expect(receiveOperations([foreign('e-1'), { ...broken, seq: 8 }])).rejects.toThrow();
    expect(await db.outbox.count()).toBe(0);
    expect(await db.rows.count()).toBe(0);
    expect(await db.syncState.count()).toBe(0);
  });

  it('a lead re-saving a received copy keeps its marker, so the escape hatch still finds it', async () => {
    await receiveOperations([foreign('e-1')]);
    await enqueue({
      ...later('e-1', '2026-11-14T09:10:00.000Z', 'o-lead'),
      author_user_id: 'u-lead',
    });
    expect((await syncStateOf('e-1'))!).toMatchObject({ origin: 'local', received_by_qr: true });
  });

  it('never replaces or deletes an operation this device queued itself, however new the copy (9.4)', async () => {
    // Yael's phone shows entry E; its op carries 10:07 (her clock runs ahead).
    const yael = later('e-1', '2026-11-14T10:07:00.000Z', 'o-yael');
    await receiveOperations([yael]);
    // Lead Dana corrects E on the tablet at 10:05 tablet time: her own op, and her row.
    await enqueue({
      ...later('e-1', '2026-11-14T10:05:00.000Z', 'o-dana'),
      author_user_id: 'u-lead',
      payload: { ...foreign('e-1').payload, data: { auto_notes: 9 } },
    });
    await db.rows.put({
      ...(await db.rows.get(['scouting_entries', 'e-1']))!,
      data: { auto_notes: 9 },
      client_updated_at: '2026-11-14T10:05:00.000Z',
    });
    // Yael's phone is shown again before anyone syncs.
    expect(await receiveOperations([yael])).toEqual({ written: 0, unchanged: 1 });
    expect((await pending(10)).map((op) => op.op_id)).toEqual(['o-dana']);
    expect((await db.rows.get(['scouting_entries', 'e-1']))!.data).toEqual({ auto_notes: 9 });
    expect((await syncStateOf('e-1'))!.origin).toBe('local');
  });

  it('a newer copy of a row this device has an unsent edit of leaves that edit alone', async () => {
    await enqueue({ ...foreign('e-1'), op_id: 'o-mine', author_user_id: 'u-me' });
    expect(await receiveOperations([later('e-1', '2026-11-14T09:30:00.000Z', 'o-theirs')])).toEqual(
      { written: 0, unchanged: 1 },
    );
    expect((await pending(10)).map((op) => op.op_id)).toEqual(['o-mine']);
    expect(await db.rows.get(['scouting_entries', 'e-1'])).toBeUndefined();
  });

  it('counts and discards only the received copies whose rows are still here (eviction)', async () => {
    await receiveOperations([foreign('e-1'), foreign('e-2')]);
    await ackResults([
      { op_id: 'o-e-1', status: 'applied', row_id: 'e-1', new_version: 1 },
      { op_id: 'o-e-2', status: 'applied', row_id: 'e-2', new_version: 1 },
    ]);
    // A left event's eviction drops e-2's row; its sync state, with the marker, stays.
    await db.rows.where('[entity+id]').equals(['scouting_entries', 'e-2']).delete();
    expect(await receivedQrState()).toEqual({ held: 0, discardable: 1 });
    expect(await discardReceivedQrData()).toEqual({ discarded: 1, refused: 0 });
    expect(await receivedQrState()).toEqual({ held: 0, discardable: 0 });
    expect(await discardReceivedQrData()).toEqual({ discarded: 0, refused: 0 });
  });

  it('counts the waiting copies by author for Sync, bare matches left out', async () => {
    const match: Operation = {
      ...foreign('m-9'),
      op_id: 'o-m-9',
      entity: 'match',
      payload: { event_id: 'ev-1', match_type: 'qualification', number: 9 },
      seq: 1,
    };
    await receiveOperations([match, foreign('e-1'), { ...foreign('e-2'), author_user_id: 'u-b' }]);
    const received = await readReceivedByQr();
    expect(received.total).toBe(2);
    expect(received.authors.map((a) => [a.author_user_id, a.count]).sort()).toEqual([
      ['u-b', 1],
      ['u-other', 1],
    ]);
    // The bare match is in the dataset as well, and goes ahead of its entry in the outbox.
    expect(await db.rows.get(['matches', 'm-9'])).toMatchObject({ number: 9 });
    expect((await pending(10)).map((op) => op.op_id)).toEqual(['o-m-9', 'o-e-1', 'o-e-2']);
    expect(await receivedQrState()).toEqual({ held: 2, discardable: 0 });
  });
});
