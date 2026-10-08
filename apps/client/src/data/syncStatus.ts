import { useOnline } from '@/lib/useOnline';
import { connectionState } from './connection';
import { db, getMeta } from './db';
import { LAST_FAILURE, type SyncFailure } from './syncFailure';
import { useDeviceQuery } from './useDeviceQuery';

/** What the shell, Home and Switch scouter show about sending (SPEC-FINAL 9.10). Counts records, not bare matches. */
export async function readSyncStatus() {
  const ops = await db.outbox.filter((op) => op.entity !== 'match').toArray();
  const byAuthor: Record<string, number> = {};
  for (const op of ops) byAuthor[op.author_user_id] = (byAuthor[op.author_user_id] ?? 0) + 1;
  return {
    waiting: ops.length,
    byAuthor,
    lastSyncAt: await getMeta<string | null>('sync.last_success_at', null),
    lastFailure: await getMeta<SyncFailure | null>(LAST_FAILURE, null),
  };
}
export function useSyncStatus() {
  const status = useDeviceQuery(readSyncStatus, [], ['outbox', 'meta']);
  const online = useOnline();
  return {
    waiting: status?.waiting ?? 0,
    byAuthor: status?.byAuthor ?? {},
    lastSyncAt: status?.lastSyncAt ?? null,
    lastFailure: status?.lastFailure ?? null,
    online,
    syncing: connectionState() === 'syncing',
  };
}
