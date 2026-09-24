import { useEffect, useState } from 'react';
import { Link, matchPath, Navigate, Outlet, useLocation } from 'react-router-dom';
import { needsSignIn, session } from '@/auth/session';
import { useSession } from '@/auth/useSession';
import { clientConfig } from '@/config';
import { apiClient } from '@/data/api';
import { beginSync, endSync } from '@/data/connection';
import { getMeta, setMeta } from '@/data/db';
import { cachedHydration, hydrate, syncNow, type HydrationState } from '@/data/sync';
import { ConnectionIndicator } from './ConnectionIndicator';
import type { ShellContext } from './shellContext';

/** The one route that keeps working after the session expires (task 1.15). */
const ENTRY_ROUTE = '/entry/:matchId/:teamId';

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
  const current = useSession();
  const location = useLocation();
  const onEntryRoute = matchPath(ENTRY_ROUTE, location.pathname) !== null;
  // Hydration needs a session: a pull without a token can only answer 401.
  const hasSession = current !== undefined && current !== null;

  useEffect(() => {
    if (!hasSession) return;
    const api = apiClient(clientConfig());
    let stopped = false;

    async function run(first: boolean) {
      // Read fresh each time: the token can expire (or be refreshed) between runs.
      const token = await session.token();
      if (!token) {
        // Expired (or, in 1.16, an offline sign-in): never contact the server without a
        // token — settle the first hydration from what the device already holds.
        if (first) {
          const cached = await cachedHydration(eventId);
          if (!stopped) setState(cached);
        }
        return;
      }
      beginSync();
      try {
        const id = await deviceId();
        if (first) {
          const settled = await hydrate({ api, eventId, deviceId: id });
          if (!stopped) setState(settled);
        } else await syncNow({ api, eventId, deviceId: id });
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
  }, [eventId, hasSession]);

  if (current === undefined) return null; // IndexedDB is being read; a few milliseconds
  if (current === null) return <Navigate to="/login" replace />;
  // An expired session sends every route to sign-in — except an entry in progress, which
  // carries on (task 1.15). The entry route cannot work while blocked, so it goes too.
  if (needsSignIn(current) && (!onEntryRoute || state === 'blocked')) {
    return <Navigate to="/login" replace />;
  }
  if (current.token && current.user.must_change_password && !onEntryRoute) {
    return <Navigate to="/change-password" replace />;
  }
  const context: ShellContext = { user: current.user, expired: current.expired };

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
      {current.expired ? (
        // Persistent and non-modal: the scout finishes the entry first (task 1.15).
        <p role="status" className="border-b-2 border-[var(--warning)] p-2 text-sm">
          Sign in again to sync — this entry is saved on this device
        </p>
      ) : (
        state === 'cached' && (
          <p className="border-b border-[var(--border)] p-2 text-sm text-[var(--text-muted)]">
            Working from data already on this device. Your entries are safe here and will sync when
            a connection returns.
          </p>
        )
      )}
      <Outlet context={context} />
      <footer className="flex flex-wrap items-center justify-center gap-x-4 p-2 text-xs text-[var(--text-muted)]">
        <span>
          Signed in as{' '}
          <span dir="auto" className="font-medium text-[var(--text)]">
            {current.user.full_name}
          </span>
        </span>
        <span className="tap-row flex">
          {!current.expired && (
            <Link className="tap-target inline-flex items-center px-2" to="/change-password">
              Change password
            </Link>
          )}
          <button type="button" className="tap-target px-2" onClick={() => void session.signOut()}>
            Sign out
          </button>
        </span>
        <span>version {clientConfig().appVersion}</span>
      </footer>
    </div>
  );
}
