import { notifyChanged } from './changes';

export type ConnectionState = 'online' | 'syncing' | 'offline';

/**
 * How far the running sync's push has got (SPEC-FINAL 9.10, the Sync page's "Sent · 2 of 5"):
 * `total` records it set out to send (bare matches are not records), `sent` of them acked so
 * far, and `acked` their row ids, so the page ticks those rows off. Null when no sync runs.
 */
export type SyncProgress = { sent: number; total: number; acked: readonly string[] };

let syncing = 0;
let progress: SyncProgress | null = null;

export function beginSync(): void {
  syncing += 1;
  notifyChanged('meta');
}

export function endSync(): void {
  syncing = Math.max(0, syncing - 1);
  if (syncing === 0) progress = null;
  notifyChanged('meta');
}

/** SPEC-FINAL 9.10: three states, named in words, never a silent icon. */
export function connectionState(): ConnectionState {
  if (syncing > 0) return 'syncing';
  return navigator.onLine ? 'online' : 'offline';
}

/** The running sync's progress, or null (syncNow's `onProgress` feeds it through AppShell). */
export function syncProgress(): SyncProgress | null {
  return syncing > 0 ? progress : null;
}

export function setSyncProgress(next: SyncProgress | null): void {
  progress = next;
  notifyChanged('meta');
}
