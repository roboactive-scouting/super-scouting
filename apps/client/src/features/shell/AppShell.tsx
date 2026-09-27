import { useEffect, useState } from 'react';
import { Link, matchPath, Navigate, Outlet, useLocation, useMatches } from 'react-router-dom';
import { DISABLED, OFFLINE_SIGNED_IN_LINE, SERVER_UNREACHABLE_LINE } from '@/auth/messages';
import { PASSWORD_CHANGED_LINE, ReconnectPrompt } from '@/auth/ReconnectPrompt';
import { exchangePendingCredential, installReconnect, reconnectPrompt } from '@/auth/reconnect';
import { needsSignIn, session } from '@/auth/session';
import { useSession } from '@/auth/useSession';
import { clientConfig } from '@/config';
import { apiClient } from '@/data/api';
import { beginSync, endSync } from '@/data/connection';
import { getMeta, setMeta } from '@/data/db';
import {
  activeEvent,
  cachedActiveEventId,
  cachedHydration,
  syncNow,
  type HydrationState,
} from '@/data/sync';
import { canManageUsers } from '@/features/admin/AdminOnly';
import { ConnectionIndicator } from './ConnectionIndicator';
import { NoCompetition } from './NoCompetition';
import { needsNoHydration, type ShellContext } from './shellContext';

/**
 * Where the shell stands with the event (task 1.17b). `resolving` is the moment before the
 * cache has been read — and, on a device that holds no loaded event, the one
 * `getActiveContext` call. `no-event` is the server's answer that nothing is set up.
 */
type GateState = 'resolving' | 'loading' | HydrationState | 'no-event';
type Gate = { state: GateState; eventId: string | null };

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

/** `navigator.onLine`, re-read when the browser says it changed. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** What a gated route shows in place of the page until the event is loaded. */
function HydrationGate({ state, online }: { state: GateState; online: boolean }) {
  // The cache is being read: a few milliseconds, or one getActiveContext call. Saying
  // "loading" here would be wrong for a hydrated device and for an empty install alike.
  if (state === 'resolving') return null;

  if (state === 'no-event') return <NoCompetition />;

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

  // 'blocked': this device has never loaded the event and got no answer. Only a device
  // that says it is offline is told it needs a connection; an online one is told the
  // server did not answer, so nobody goes hunting for Wi-Fi that will not help.
  return (
    <div className="p-8 text-center">
      <h1 className="text-lg font-semibold">This device has not loaded the competition yet</h1>
      {online ? (
        <p className="text-[var(--text-muted)]">{SERVER_UNREACHABLE_LINE}</p>
      ) : (
        <p className="text-[var(--text-muted)]">
          An internet connection is required once, to load the event and its form. After that the
          app works with no network at all.
        </p>
      )}
    </div>
  );
}

export function AppShell() {
  const [gate, setGate] = useState<Gate>({ state: 'resolving', eventId: null });
  /** The one-field password prompt (task 1.16); `key` remounts it for a new reason. */
  const [prompt, setPrompt] = useState<{ key: number; error: string | null } | null>(null);
  const online = useOnline();
  const current = useSession();
  const location = useLocation();
  const matches = useMatches();
  const onEntryRoute = matchPath(ENTRY_ROUTE, location.pathname) !== null;
  // Gated by default: only a route marked NO_HYDRATION renders before the event is loaded.
  const gated = !matches.some((m) => needsNoHydration(m.handle));
  // Hydration needs a session: a pull without a token can only answer 401.
  const hasSession = current !== undefined && current !== null;

  useEffect(() => {
    if (!hasSession) return;
    const api = apiClient(clientConfig());
    let stopped = false;
    /**
     * The event this shell works on, resolved once per mount from the cache or the server.
     * A different `app_settings.active_event_id` arriving in a later pull takes effect at
     * the next shell mount, not mid-session: switching the active event under an open
     * session (and a part-filled form) is phase 1C's problem.
     */
    let active: string | null = null;
    let state: GateState = 'resolving';
    let cacheRead = false;

    const settle = (eventId: string | null, next: GateState) => {
      if (stopped) return;
      // A background sync that fails never demotes a fresh screen to the cached-data
      // notice: the connection indicator already says the device is offline.
      if (eventId === active && state === 'fresh' && next === 'cached') return;
      active = eventId;
      state = next;
      setGate({ state: next, eventId });
    };

    /** Push, then pull, for the resolved event. `afterGone` allows one re-resolve only. */
    async function sync(eventId: string, afterGone: boolean): Promise<void> {
      const outcome = await syncNow({ api, eventId, deviceId: await deviceId() });
      if (stopped) return;
      if (outcome?.status === 'ok') return settle(eventId, 'fresh');
      // The cached event was deleted or replaced (the pull answered 404): ask the server
      // which event is active now, rather than presenting it as "offline".
      if (outcome?.status === 'event-gone' && !afterGone) return resolve(true);
      settle(eventId, await cachedHydration(eventId));
    }

    /** Asks the server which event is active: the pull cannot say without an event id. */
    async function resolve(afterGone: boolean): Promise<void> {
      // Once the server has said "no competition", a failed re-ask keeps that answer.
      const unanswered: GateState = state === 'no-event' ? 'no-event' : 'blocked';
      if (!navigator.onLine) return settle(null, unanswered);
      const answer = await activeEvent();
      if (stopped) return;
      if (answer.status === 'no-event') return settle(null, 'no-event');
      if (answer.status === 'unreachable') return settle(null, unanswered);
      const eventId = answer.eventId;
      // The loading screen is only for a device that has never loaded this event.
      settle(eventId, (await cachedHydration(eventId)) === 'cached' ? 'cached' : 'loading');
      await sync(eventId, afterGone);
    }

    /**
     * An offline sign-in holds no token (SPEC-FINAL 7.5). Each time the shell would sync,
     * it first tries to exchange the password held in memory for one. With none held (the
     * app was closed since), it asks for the password once.
     */
    async function reconnect() {
      if (!navigator.onLine) return;
      const outcome = await exchangePendingCredential();
      if (stopped) return;
      const show = (error: string | null) => setPrompt({ key: Date.now(), error });
      if (outcome === 'no-credential' && reconnectPrompt.claim()) show(null);
      else if (outcome === 'refused') show(PASSWORD_CHANGED_LINE);
      else if (outcome === 'disabled') show(DISABLED);
    }

    async function run() {
      // Cached-first: a device that completed a pull of the cached active event renders at
      // once, in 'cached', and syncs in the background. No network wait, online or not.
      if (!cacheRead) {
        cacheRead = true;
        const cachedId = await cachedActiveEventId();
        if (cachedId !== null && (await cachedHydration(cachedId)) === 'cached') {
          settle(cachedId, 'cached');
        }
      }
      // Read fresh each time: the token can expire (or be refreshed) between runs.
      const current = await session.current();
      const token = current?.token ?? null;
      if (!token) {
        // Expired, or an offline sign-in: never contact the server without a token. With
        // no loaded event on the device, there is nothing to work from.
        if (state === 'resolving') settle(null, 'blocked');
        // An expired session signs in again on /login; only an offline one reconnects here.
        if (current?.offline && !current.expired) await reconnect();
        return;
      }
      beginSync();
      try {
        // No event yet ('no-event', 'blocked', or a first start with nothing cached): the
        // tick and the `online` event re-run this, so an event an admin sets is picked up.
        if (active === null) await resolve(false);
        else await sync(active, false);
      } finally {
        endSync();
      }
    }

    // One run at a time: a tick, the `online` event and a fresh token can coincide.
    let queue: Promise<void> = Promise.resolve();
    const schedule = () => {
      queue = queue.then(() => (stopped ? undefined : run())).catch(() => {});
    };

    schedule();
    const timer = setInterval(() => {
      if (!stopped && navigator.onLine) schedule();
    }, AUTO_REFRESH_MS);
    window.addEventListener('online', schedule);

    // A token arriving in place (the reconnect exchange, a switch to an online scouter)
    // syncs at once rather than on the next 45 s tick, so a device that was working from
    // its cache says so no longer.
    let lastToken: string | null | undefined;
    const unsubscribe = session.subscribe((next) => {
      const token = next?.token ?? null;
      if (lastToken === null && token !== null) schedule();
      lastToken = token;
    });
    const uninstall = installReconnect();

    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('online', schedule);
      unsubscribe();
      uninstall();
    };
  }, [hasSession]);

  if (current === undefined) return null; // IndexedDB is being read; a few milliseconds
  if (current === null) return <Navigate to="/login" replace />;
  // An expired session sends every route to sign-in — except an entry in progress, which
  // carries on (task 1.15). The entry route cannot work without the event, so it goes too.
  const noEvent = gate.state === 'blocked' || gate.state === 'no-event';
  if (needsSignIn(current) && (!onEntryRoute || noEvent)) {
    return <Navigate to="/login" replace />;
  }
  if (current.token && current.user.must_change_password && !onEntryRoute) {
    return <Navigate to="/change-password" replace />;
  }
  const context: ShellContext = {
    user: current.user,
    expired: current.expired,
    eventId: gate.eventId,
  };
  /** Signed in against the cached hashes, no token yet (task 1.16). */
  const offlineSession = current.offline && current.token === null && !current.expired;
  // A gated route renders only once the event is on the device. Before that, IndexedDB is
  // empty, and a child route reads the cache once on mount: it would render an empty
  // match list that never fills itself in. The gate takes the Outlet's place INSIDE the
  // layout, so the header (and the Users link) stays reachable.
  const loaded = gate.state === 'cached' || gate.state === 'fresh';
  const showPage = !gated || loaded;

  return (
    <div className="min-h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-y-2 border-b border-[var(--border)] p-2">
        <nav className="tap-row flex flex-wrap">
          <Link className="tap-target px-3 leading-[48px]" to="/">
            Scout
          </Link>
          <Link className="tap-target px-3 leading-[48px]" to="/entries">
            Entries
          </Link>
          {!current.expired && (
            <Link className="tap-target px-3 leading-[48px]" to="/switch-scouter">
              Switch scouter
            </Link>
          )}
          {!current.expired && canManageUsers(current.user) && (
            <Link className="tap-target px-3 leading-[48px]" to="/admin/users">
              Users
            </Link>
          )}
        </nav>
        <ConnectionIndicator />
      </header>
      {offlineSession && prompt && (
        <ReconnectPrompt
          key={prompt.key}
          name={current.user.full_name}
          error={prompt.error}
          onClose={() => setPrompt(null)}
        />
      )}
      {current.expired ? (
        // Persistent and non-modal: the scout finishes the entry first (task 1.15).
        <p role="status" className="border-b-2 border-[var(--warning)] p-2 text-sm">
          Sign in again to sync — this entry is saved on this device
        </p>
      ) : offlineSession ? (
        <p role="status" dir="auto" className="border-b border-[var(--border)] p-2 text-sm">
          {OFFLINE_SIGNED_IN_LINE}
        </p>
      ) : (
        gate.state === 'cached' && (
          <p className="border-b border-[var(--border)] p-2 text-sm text-[var(--text-muted)]">
            Working from data already on this device. Your entries are safe here and will sync when
            a connection returns.
          </p>
        )
      )}
      {/* Deliberately NOT `<Outlet key={state} />`: that remounts the page on every state
          change and would throw away a part-filled form ('cached' → 'fresh'). */}
      {showPage ? (
        <Outlet context={context} />
      ) : (
        <HydrationGate state={gate.state} online={online} />
      )}
      <footer className="flex flex-wrap items-center justify-center gap-x-4 p-2 text-xs text-[var(--text-muted)]">
        <span>
          Signed in as{' '}
          <span dir="auto" className="font-medium text-[var(--text)]">
            {current.user.full_name}
          </span>
        </span>
        <span className="tap-row flex">
          {current.token !== null && (
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
