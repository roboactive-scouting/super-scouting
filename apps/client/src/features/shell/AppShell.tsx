import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type TouchEvent,
} from 'react';
import { Link, matchPath, Navigate, Outlet, useLocation, useMatches } from 'react-router-dom';
import { DISABLED, OFFLINE_SIGNED_IN_LINE, SERVER_UNREACHABLE_LINE } from '@/auth/messages';
import { PASSWORD_CHANGED_LINE, ReconnectPrompt } from '@/auth/ReconnectPrompt';
import { exchangePendingCredential, installReconnect, reconnectPrompt } from '@/auth/reconnect';
import { needsSignIn, session } from '@/auth/session';
import { useSession } from '@/auth/useSession';
import { clientConfig } from '@/config';
import { apiClient } from '@/data/api';
import { beginSync, endSync } from '@/data/connection';
import { cachedEventName } from '@/data/cache';
import { getMeta, setMeta } from '@/data/db';
import {
  activeEvent,
  cachedDefaultEventId,
  cachedHydration,
  syncNow,
  type HydrationState,
} from '@/data/sync';
import { canManageEvents, canManageUsers } from '@/features/admin/AdminOnly';
import { sessionOverride, useSessionOverride } from '@/features/context/sessionOverride';
import { useEventName } from '@/features/context/useEventName';
import { useOnline } from '@/lib/useOnline';
import { updateReady } from '@/pwa';
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

/** The context page (task 1.22): it carries its own override banner and version line. */
const CONTEXT_ROUTE = '/context';

/** SPEC-FINAL 10: a background auto-refresh every 45 seconds on data-bearing screens. */
const AUTO_REFRESH_MS = 45_000;

/** SPEC-FINAL 9.3: how far a drag down from the top of the page must go to pull. */
const PULL_TO_REFRESH_PX = 80;

export const UPDATE_READY_LINE = 'An update is ready. It will apply next time you open the app.';

/** SPEC-FINAL 9.3: the notice after a pull answered that the event is gone. */
function goneLine(name: string | null): string {
  return `${name ?? 'The competition this device had loaded'} no longer exists. Its data has been removed from this device.`;
}

async function deviceId(): Promise<string> {
  const existing = await getMeta<string | null>('device.id', null);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  await setMeta('device.id', fresh);
  return fresh;
}

/** What a gated route shows in place of the page until the event is loaded. */
function HydrationGate({
  state,
  online,
  canSetUp,
}: {
  state: GateState;
  online: boolean;
  canSetUp: boolean;
}) {
  // The cache is being read: a few milliseconds, or one getActiveContext call. Saying
  // "loading" here would be wrong for a hydrated device and for an empty install alike.
  if (state === 'resolving') return null;

  if (state === 'no-event') return <NoCompetition canSetUp={canSetUp} />;

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
  const onContextPage = matchPath(CONTEXT_ROUTE, location.pathname) !== null;
  // Gated by default: only a route marked NO_HYDRATION renders before the event is loaded.
  const gated = !matches.some((m) => needsNoHydration(m.handle));
  // Hydration needs a session: a pull without a token can only answer 401.
  const hasSession = current !== undefined && current !== null;
  /** SPEC-FINAL 6.3: a session-only look at another event (task 1.22). */
  const override = useSessionOverride();
  /** SPEC-FINAL 9.1: set once by main.tsx's one registration; nothing here reloads. */
  const updateIsReady = useSyncExternalStore(updateReady.subscribe, updateReady.get);
  // Re-read on every gate change: the name can arrive with the very pull that loads it.
  const eventName = useEventName(gate.eventId, gate);
  /** SPEC-FINAL 9.3: the event a pull said is gone, named. */
  const [goneNotice, setGoneNotice] = useState<string | null>(null);
  /** True while a changed default waits for the open entry to be left (task 1.22). */
  const [deferred, setDeferred] = useState(false);
  /** The event the shell moved to after the default changed, for the one-line notice. */
  const [switchedTo, setSwitchedTo] = useState<string | null>(null);

  // What the sync loop — which outlives any one render — needs from the latest render.
  const onEntryRouteRef = useRef(onEntryRoute);
  useLayoutEffect(() => {
    onEntryRouteRef.current = onEntryRoute;
  }, [onEntryRoute]);
  /** The loop's own `schedule()`: the one sync path every trigger goes through. */
  const scheduleRef = useRef<(() => void) | null>(null);
  /** A changed default held back because an entry was open when it arrived. */
  const pendingRef = useRef<{ eventId: string | null } | null>(null);

  useEffect(() => {
    if (!hasSession) return;
    const api = apiClient(clientConfig());
    let stopped = false;
    /**
     * The event this shell works on: resolved from the cache or the server at mount, and
     * moved when a later pull brings a different admin default (task 1.22) — at once,
     * unless an entry is open, which finishes against the event it started in.
     */
    let active: string | null = null;
    let state: GateState = 'resolving';
    let cacheRead = false;
    /**
     * The cached default the shell last acted on (`undefined`: no `app_settings` row). A
     * move happens when a sync CHANGES the cached default, so one change is acted on once
     * — and a mismatch the pull did not cause (the server named an event the cache has not
     * caught up with) never sends the shell back and forth.
     */
    let known: string | null | undefined;
    pendingRef.current = null;

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
      const device = await deviceId();
      // An unmounted shell (a sign-out, a route outside it) starts no new sync.
      if (stopped) return;
      const outcome = await syncNow({ api, eventId, deviceId: device });
      if (stopped) return;
      if (outcome?.status === 'ok') {
        settle(eventId, 'fresh');
        return followDefault(eventId);
      }
      if (outcome?.status === 'event-gone') {
        // Named from the cached `events` row, read before anything re-resolves. The wipe
        // removes the rows that carry the event's id, never the event's own row.
        const name = await cachedEventName(eventId);
        if (stopped) return;
        setGoneNotice(goneLine(name));
        // The cached event was deleted or replaced (the pull answered 404): ask the server
        // which event is active now, rather than presenting it as "offline".
        if (!afterGone) return resolve(true);
      }
      settle(eventId, await cachedHydration(eventId));
    }

    /**
     * After a completed sync: did the pull bring a different admin default (task 1.22)?
     * An open entry holds the move back — the form stays mounted on the event it started
     * in, its draft untouched — until the entry route is left.
     */
    async function followDefault(eventId: string): Promise<void> {
      const latest = await cachedDefaultEventId();
      if (stopped || latest === undefined || latest === known) return;
      known = latest;
      if (latest === eventId) {
        pendingRef.current = null;
        setDeferred(false);
        return;
      }
      if (onEntryRouteRef.current) {
        pendingRef.current = { eventId: latest };
        setDeferred(true);
        return;
      }
      await moveTo(latest, true);
    }

    /**
     * Moves the shell to a new default without remounting anything above the page. `null`
     * is the admin setting a season with no event: the cached `app_settings` is the
     * server's own answer, so that is "no competition", and the next run re-asks.
     */
    async function moveTo(next: string | null, withToken: boolean): Promise<void> {
      pendingRef.current = null;
      setDeferred(false);
      // An override of the very event that is now the default is no override at all.
      if (next !== null && sessionOverride.get() === next) sessionOverride.clear();
      if (next === null) return settle(null, 'no-event');
      const loaded = (await cachedHydration(next)) === 'cached';
      if (stopped) return;
      setSwitchedTo(next);
      settle(next, loaded ? 'cached' : navigator.onLine ? 'loading' : 'blocked');
      if (withToken) await sync(next, false);
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
        known = await cachedDefaultEventId();
        const cachedId = known ?? null;
        if (cachedId !== null && (await cachedHydration(cachedId)) === 'cached') {
          settle(cachedId, 'cached');
        }
      }
      // Read fresh each time: the token can expire (or be refreshed) between runs.
      const current = await session.current();
      if (stopped) return;
      const token = current?.token ?? null;
      // A changed default held back by an open entry moves now that the entry is closed.
      const held = pendingRef.current !== null && !onEntryRouteRef.current;
      const heldEventId = pendingRef.current?.eventId ?? null;
      if (!token) {
        // Expired, or an offline sign-in: never contact the server without a token. With
        // no loaded event on the device, there is nothing to work from.
        if (held) await moveTo(heldEventId, false);
        if (state === 'resolving') settle(null, 'blocked');
        // An expired session signs in again on /login; only an offline one reconnects here.
        if (current?.offline && !current.expired) await reconnect();
        return;
      }
      beginSync();
      try {
        // No event yet ('no-event', 'blocked', or a first start with nothing cached): the
        // tick and the `online` event re-run this, so an event an admin sets is picked up.
        if (held) await moveTo(heldEventId, true);
        else if (active === null) await resolve(false);
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
    scheduleRef.current = schedule;

    return () => {
      stopped = true;
      scheduleRef.current = null;
      clearInterval(timer);
      window.removeEventListener('online', schedule);
      unsubscribe();
      uninstall();
    };
  }, [hasSession]);

  // SPEC-FINAL 9.3: a delta pull on SCREEN ENTRY, through the same `schedule()`. The first
  // path is the mount, which the loop above already syncs. Offline there is nothing to
  // pull — unless a changed default is waiting for the entry to be left: that move must
  // not wait for a connection, or new entries would keep going to the old event.
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    const previous = lastPath.current;
    lastPath.current = location.pathname;
    if (previous === null || previous === location.pathname) return;
    if (navigator.onLine || pendingRef.current !== null) scheduleRef.current?.();
  }, [location.pathname]);

  // SPEC-FINAL 9.3: pull-to-refresh — a drag down from the very top of the page, once per
  // gesture, into the same `schedule()`. Nothing is prevented: scrolling stays native.
  const pullFrom = useRef<number | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    pullFrom.current = window.scrollY <= 0 ? (e.touches[0]?.clientY ?? null) : null;
  };
  const onTouchMove = (e: TouchEvent) => {
    const from = pullFrom.current;
    const y = e.touches[0]?.clientY;
    if (from === null || y === undefined || y - from < PULL_TO_REFRESH_PX) return;
    pullFrom.current = null;
    if (navigator.onLine) scheduleRef.current?.();
  };

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
  const workingOn = eventName ?? 'this competition';
  const lookingAt = override?.eventName ?? 'another competition';

  return (
    <div className="min-h-dvh" onTouchStart={onTouchStart} onTouchMove={onTouchMove}>
      <header className="flex flex-wrap items-center justify-between gap-y-2 border-b border-[var(--border)] p-2">
        <nav className="tap-row flex flex-wrap">
          {override ? (
            // SPEC-FINAL 6.3: no new entry while an override is in effect. The routes
            // refuse too; this only stops the nav offering what the route would refuse.
            <span
              aria-disabled="true"
              className="tap-target px-3 leading-[48px] text-[var(--text-muted)]"
            >
              Scout
            </span>
          ) : (
            <Link className="tap-target px-3 leading-[48px]" to="/">
              Scout
            </Link>
          )}
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
          {!current.expired && canManageEvents(current.user) && (
            <Link className="tap-target px-3 leading-[48px]" to="/admin/manage">
              Manage
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
      {override && !onContextPage && (
        // Persistent, on every page but the context page (which carries its own banner).
        <div
          role="status"
          className="tap-row flex flex-wrap items-center gap-x-2 border-b-2 border-[var(--warning)] px-2 text-sm"
        >
          <span dir="auto">You are looking at {lookingAt} only for this session.</span>
          <button
            type="button"
            className="tap-target px-2 font-medium underline"
            onClick={() => sessionOverride.clear()}
          >
            <span dir="auto">Back to {workingOn}</span>
          </button>
        </div>
      )}
      {deferred && onEntryRoute && (
        <p role="status" dir="auto" className="border-b-2 border-[var(--warning)] p-2 text-sm">
          The default competition has changed. Finish this entry — it stays with {workingOn}. This
          device moves to the new one when you leave it.
        </p>
      )}
      {switchedTo !== null && switchedTo === gate.eventId && loaded && (
        <p role="status" dir="auto" className="border-b border-[var(--border)] p-2 text-sm">
          This device now works on {workingOn}, the new default competition.
        </p>
      )}
      {goneNotice && (
        <p role="status" dir="auto" className="border-b-2 border-[var(--warning)] p-2 text-sm">
          {goneNotice}
        </p>
      )}
      {/* Deliberately NOT `<Outlet key={state} />`: that remounts the page on every state
          change and would throw away a part-filled form ('cached' → 'fresh'). */}
      {showPage ? (
        <Outlet context={context} />
      ) : (
        <HydrationGate
          state={gate.state}
          online={online}
          canSetUp={canManageEvents(current.user)}
        />
      )}
      <footer className="flex flex-wrap items-center justify-center gap-x-4 p-2 text-xs text-[var(--text-muted)]">
        {/* SPEC-FINAL 6.3: a link to the page, naming the context — never the switcher. */}
        {gate.eventId !== null && !current.expired && !onContextPage && (
          <Link className="tap-target inline-flex items-center px-2" to={CONTEXT_ROUTE}>
            <span dir="auto">
              {override ? `Looking at ${lookingAt}` : `Working on ${workingOn}`}
            </span>
            &nbsp;· Change
          </Link>
        )}
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
        {/* SPEC-FINAL 9.1: said, never acted on — no reload button, because there is
            nothing safe for it to do mid-match. */}
        {updateIsReady && <span>{UPDATE_READY_LINE}</span>}
        {!onContextPage && <span>version {clientConfig().appVersion}</span>}
      </footer>
    </div>
  );
}
