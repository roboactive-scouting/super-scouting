import { useEffect, useState } from 'react';
import { connectionState, type ConnectionState } from '@/data/connection';
import { unackedCount } from '@/data/outbox';

const TOKEN: Record<ConnectionState, string> = {
  online: 'var(--sync-online)',
  syncing: 'var(--sync-syncing)',
  offline: 'var(--sync-offline)',
};

/**
 * SPEC-FINAL 9.10: a primary UI element, not a footnote. It names the state in words
 * plus the unsynced count — "offline · 4 unsynced".
 */
export function ConnectionIndicator() {
  const [state, setState] = useState<ConnectionState>(connectionState());
  const [unsynced, setUnsynced] = useState(0);

  useEffect(() => {
    const tick = () => {
      setState(connectionState());
      void unackedCount().then(setUnsynced);
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

  return (
    <span
      role="status"
      className="tap-target inline-flex items-center gap-2 px-3 text-sm"
      style={{ color: TOKEN[state] }}
    >
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: TOKEN[state] }} />
      {unsynced > 0 ? `${state} · ${unsynced} unsynced` : state}
    </span>
  );
}
