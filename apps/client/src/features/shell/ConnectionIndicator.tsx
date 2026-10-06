import { useEffect, useState } from 'react';
import { connectionState, type ConnectionState } from '@/data/connection';
import { unsyncedCount } from '@/data/outbox';
import { cn } from '@/lib/utils';

const TOKEN: Record<ConnectionState, string> = {
  online: 'var(--sync-online)',
  syncing: 'var(--sync-syncing)',
  offline: 'var(--sync-offline)',
};

/**
 * SPEC-FINAL 9.10: a primary UI element, not a footnote. It names the state in words
 * plus the unsynced count — "offline · 4 unsynced". The count is of records, not of
 * queued operations: an entry for a brand-new match is one, not two.
 */
export function ConnectionIndicator({ compact = false }: { compact?: boolean } = {}) {
  const [state, setState] = useState<ConnectionState>(connectionState());
  const [unsynced, setUnsynced] = useState(0);

  useEffect(() => {
    const tick = () => {
      setState(connectionState());
      void unsyncedCount().then(setUnsynced);
    };
    tick();
    const timer = setInterval(tick, 2000);
    window.addEventListener('online', tick);
    window.addEventListener('offline', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', tick);
      window.removeEventListener('offline', tick);
    };
  }, []);

  const text = unsynced > 0 ? `${state} · ${unsynced} unsynced` : state;
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
