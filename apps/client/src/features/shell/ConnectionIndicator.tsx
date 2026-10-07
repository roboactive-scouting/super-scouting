import { useSyncStatus } from '@/data/syncStatus';
import { cn } from '@/lib/utils';

type ConnectionState = 'online' | 'syncing' | 'offline';

const TOKEN: Record<ConnectionState, string> = {
  online: 'var(--sync-online)',
  syncing: 'var(--sync-syncing)',
  offline: 'var(--sync-offline)',
};

/**
 * SPEC-FINAL 9.10: the state in words plus the unsynced count — "offline · 4 unsynced". The
 * count is of records, not of queued operations: an entry for a brand-new match is one, not
 * two. Event-driven through useSyncStatus (redesign RB.6): it re-reads on a change, never
 * polls. The shell itself now shows SyncPill; this stays until RB.18 retires it.
 */
export function ConnectionIndicator({ compact = false }: { compact?: boolean } = {}) {
  const { online, syncing, waiting } = useSyncStatus();
  const state: ConnectionState = !online ? 'offline' : syncing ? 'syncing' : 'online';
  const text = waiting > 0 ? `${state} · ${waiting} unsynced` : state;
  return (
    <span
      role="status"
      title={compact ? text : undefined}
      className={cn(
        'tap-target inline-flex items-center gap-2 rounded-lg px-3 text-sm font-medium',
        compact && 'justify-center px-0',
      )}
      style={{ color: TOKEN[state] }}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: TOKEN[state] }}
      />
      {compact ? <span className="sr-only">{text}</span> : text}
    </span>
  );
}
