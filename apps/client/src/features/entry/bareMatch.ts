import { notifyChanged } from '@/data/changes';
import { cachedRows } from '@/data/cache';
import { db } from '@/data/db';
import { enqueue, nextSeq } from '@/data/outbox';
import { practiceMode } from './practice';

type MatchKey = { eventId: string; matchType: string; number: number };

type MatchLike = {
  id: string;
  event_id?: unknown;
  match_type?: unknown;
  number?: unknown;
  updated_at?: unknown;
};

/**
 * The rows for (event, type, number), oldest first. Normally one; two on a device that made a
 * duplicate before UF.22 (they merge on the server when both push: the second is answered with
 * the first's id and remapped, SPEC-FINAL 6.4). The Scout page and ensureMatchLocally both pick
 * the first, so they agree on which copy a new entry goes to.
 */
export function copiesOf<T extends MatchLike>(rows: readonly T[], key: MatchKey): T[] {
  return rows
    .filter(
      (m) =>
        m.event_id === key.eventId && m.match_type === key.matchType && m.number === key.number,
    )
    .sort(
      (a, b) =>
        `${a.updated_at ?? ''}`.localeCompare(`${b.updated_at ?? ''}`) || a.id.localeCompare(b.id),
    );
}

/**
 * SPEC-FINAL 6.4: a system action, not an admin capability. When the typed match is not on
 * this device it creates the minimal row — event, type, number, nothing else — rides the
 * outbox, and works offline. Returns the match id, new or existing. Never creates one in
 * practice (8.5: practice writes nothing).
 *
 * UF.22: the device, not the caller, decides whether the match exists. `existing` is the
 * caller's snapshot (the Scout page's last read), which can be older than the device — a tap
 * that lands while the page is leaving, another tab of the app — so the lookup is read again
 * inside one read-write transaction with the create: two starts at once queue behind each
 * other and the second finds the first's row. `existing` only says which copy to keep when the
 * device already holds two.
 */
export async function ensureMatchLocally(
  existing: { id: string } | undefined,
  match: MatchKey & { author: { id: string } },
): Promise<string> {
  const created = await db.transaction(
    'rw',
    [db.rows, db.outbox, db.syncState, db.meta],
    async () => {
      const held = copiesOf(await cachedRows<MatchLike>('matches'), match);
      const named = existing && held.find((m) => m.id === existing.id);
      const found = named ?? held[0];
      if (found) return { id: found.id, isNew: false };
      if (practiceMode.active()) {
        throw new Error('practice uses a match this device already holds');
      }
      const rowId = crypto.randomUUID();
      const at = new Date().toISOString();
      const payload = {
        event_id: match.eventId,
        match_type: match.matchType,
        number: match.number,
      };
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
      return { id: rowId, isNew: true };
    },
  );
  if (created.isNew) notifyChanged('rows');
  return created.id;
}
