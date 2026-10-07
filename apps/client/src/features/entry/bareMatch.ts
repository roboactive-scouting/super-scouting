import { notifyChanged } from '@/data/changes';
import { db } from '@/data/db';
import { enqueue, nextSeq } from '@/data/outbox';

/**
 * SPEC-FINAL 6.4: a system action, not an admin capability. When the typed match is not on
 * this device it creates the minimal row — event, type, number, nothing else — rides the
 * outbox, and works offline. Returns the match id, new or existing.
 */
export async function ensureMatchLocally(
  existing: { id: string } | undefined,
  match: { eventId: string; matchType: string; number: number; author: { id: string } },
): Promise<string> {
  if (existing) return existing.id;
  const rowId = crypto.randomUUID();
  const at = new Date().toISOString();
  const payload = { event_id: match.eventId, match_type: match.matchType, number: match.number };
  await enqueue({
    op_id: crypto.randomUUID(),
    entity: 'match',
    row_id: rowId,
    action: 'create',
    base_version: null,
    payload,
    author_user_id: match.author.id,
    client_created_at: at,
    client_updated_at: at,
    seq: await nextSeq(),
  });
  // Optimistic local write, so the picker and the entry screen see it at once.
  await db.rows.put({ id: rowId, ...payload, entity: 'matches', version: 1, updated_at: at });
  notifyChanged('rows');
  return rowId;
}
