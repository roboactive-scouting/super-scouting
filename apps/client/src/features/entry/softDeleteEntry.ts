import { notifyChanged } from '@/data/changes';
import { db } from '@/data/db';
import { asUtcIso, enqueue, nextSeq } from '@/data/outbox';

/** The device does not hold the entry: the delete goes to the server instead (`deleteEntry`). */
export const NOT_ON_DEVICE = 'This entry is not on this device.';

/**
 * A lead's or admin's soft delete of one entry this device holds (SPEC-FINAL 3.9, 9.4; task
 * 1.61): a `delete` operation through the outbox like any other change, so it works offline,
 * and the device's copy marked deleted at once (it leaves every list, statistic and ranking
 * here before it syncs). The server applies the same rule as its online `deleteEntry`
 * (`softDeletedRow`, task 1.60). `enqueue` refuses a scouter's delete before anything is
 * written (`DeleteNotAllowedError`), and a delete of an entry still waiting to be created
 * removes both operations, since the row never reached the server.
 */
export async function softDeleteEntry(rowId: string, authorUserId: string): Promise<void> {
  const row = await db.rows.get(['scouting_entries', rowId]);
  if (!row || row.deleted_at != null) throw new Error(NOT_ON_DEVICE);
  const now = new Date().toISOString();
  // A pulled row's timestamp is Postgres's `…+00:00`, which the push protocol refuses.
  const createdAt = row.client_created_at == null ? now : asUtcIso(String(row.client_created_at));
  await enqueue({
    op_id: crypto.randomUUID(),
    entity: 'scouting_entry',
    row_id: rowId,
    action: 'delete',
    base_version: Number(row.version ?? 1),
    payload: {},
    author_user_id: authorUserId,
    client_created_at: createdAt,
    client_updated_at: now,
    seq: await nextSeq(),
  });
  await db.rows.put({ ...row, deleted_at: now, updated_at: now, client_updated_at: now });
  notifyChanged('rows');
}
