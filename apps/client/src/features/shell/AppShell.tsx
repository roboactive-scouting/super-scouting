import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { clientConfig } from '@/config';
import { apiClient } from '@/data/api';
import { beginSync, endSync } from '@/data/connection';
import { getMeta, setMeta } from '@/data/db';
import { hydrate, syncNow, type HydrationState } from '@/data/sync';
import { ConnectionIndicator } from './ConnectionIndicator';

/** SPEC-FINAL 10: a background auto-refresh every 45 seconds on data-bearing screens. */
const AUTO_REFRESH_MS = 45_000;

async function deviceId(): Promise<string> {
  const existing = await getMeta<string | null>('device.id', null);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  await setMeta('device.id', fresh);
  return fresh;
}

export function AppShell({ eventId }: { eventId: string }) {
  const [state, setState] = useState<HydrationState | 'loading'>('loading');

  useEffect(() => {
    const api = apiClient(clientConfig());
    let stopped = false;

    async function run(first: boolean) {
      beginSync();
      try {
        const id = await deviceId();
        if (first) setState(await hydrate({ api, eventId, deviceId: id }));
        else await syncNow({ api, eventId, deviceId: id });
      } finally {
        endSync();
      }
    }

    void run(true);
    const timer = setInterval(() => {
      if (!stopped && navigator.onLine) void run(false);
    }, AUTO_REFRESH_MS);
    const onReconnect = () => void run(false);
    window.addEventListener('online', onReconnect);

    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('online', onReconnect);
    };
  }, [eventId]);

  // The first pull has not finished, so IndexedDB is still empty. Child routes read the
  // cache once on mount and would render an empty match list that never fills itself in,
  // so hold them back until hydration has settled. Deliberately NOT `<Outlet key={state} />`:
  // that remounts children on every state change and would throw away a part-filled form.
  if (state === 'loading') {
    return (
      <div className="p-8 text-center">
        <h1 className="text-lg font-semibold" dir="auto">
          Loading the competition onto this device
        </h1>
        <p className="text-[var(--text-muted)]" dir="auto">
          This happens once, and takes a few seconds. The matches and robots appear as soon as it is
          done.
        </p>
      </div>
    );
  }

  if (state === 'blocked') {
    return (
      <div className="p-8 text-center">
        <h1 className="text-lg font-semibold">This device has not loaded the competition yet</h1>
        <p className="text-[var(--text-muted)]">
          An internet connection is required once, to load the event and its form. After that the
          app works with no network at all.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-[var(--border)] p-2">
        <nav className="tap-row flex">
          <Link className="tap-target px-3 leading-[48px]" to="/">
            Scout
          </Link>
          <Link className="tap-target px-3 leading-[48px]" to="/entries">
            Entries
          </Link>
        </nav>
        <ConnectionIndicator />
      </header>
      {state === 'cached' && (
        <p className="border-b border-[var(--border)] p-2 text-sm text-[var(--text-muted)]">
          Working from data already on this device. Your entries are safe here and will sync when a
          connection returns.
        </p>
      )}
      <Outlet />
      <footer className="p-2 text-center text-xs text-[var(--text-muted)]">
        version {clientConfig().appVersion}
      </footer>
    </div>
  );
}
