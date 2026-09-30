import { useOutletContext } from 'react-router-dom';
import type { SessionUser } from '@/auth/session';
import type { HydrationState } from '@/data/sync';

/**
 * Where the shell stands with the event (task 1.17b). `resolving` is the moment before the
 * cache has been read — and, on a device that holds no loaded event, the one
 * `getActiveContext` call. `no-event` is the server's answer that nothing is set up.
 */
export type GateState = 'resolving' | 'loading' | HydrationState | 'no-event';

/** What AppShell hands every child route through `<Outlet context>`. */
export type ShellContext = {
  /** The signed-in user — the author of every local operation (SPEC-FINAL 7.5). */
  user: SessionUser;
  /** True once the server has refused the token; only the entry route still renders. */
  expired: boolean;
  /**
   * The event this shell resolved (task 1.17b): from the cached `app_settings`, or from
   * `getActiveContext` on a device that holds none. Null until resolved, and while no
   * competition is set up. A route that reads event data is gated, so it only ever
   * renders with an id — read it with `useActiveEventId()`.
   */
  eventId: string | null;
  /** The gate's state, for a NO_HYDRATION page that says it itself — Home (redesign R.8). */
  gate: GateState;
};

/**
 * The signed-in user, for any route under AppShell. AppShell renders its children only
 * once a session exists, so this is never null there.
 */
export function useSignedInUser(): SessionUser {
  return useOutletContext<ShellContext>().user;
}

/** The whole shell context, for a NO_HYDRATION page that renders every gate state itself. */
export function useShellContext(): ShellContext {
  return useOutletContext<ShellContext>();
}

/**
 * The `handle` of a route under AppShell that reads no event data (task 1.17b):
 * `{ path: 'admin/users', element: …, handle: NO_HYDRATION }`. Such a route renders in
 * every shell state — no competition set up, never loaded, loading.
 *
 * Every other route under the shell is GATED by default: it renders only once this
 * device holds the event. A forgotten mark on a data screen therefore fails loud (the gate
 * shows) rather than silent (a list read once on mount that never fills).
 */
export const NO_HYDRATION = Object.freeze({ hydration: 'not-needed' as const });

/** True when a route's `handle` is the NO_HYDRATION mark. */
export function needsNoHydration(handle: unknown): boolean {
  return (
    typeof handle === 'object' &&
    handle !== null &&
    (handle as { hydration?: unknown }).hydration === NO_HYDRATION.hydration
  );
}

/**
 * The resolved event id, for a gated route under AppShell. The shell renders a gated
 * route only once the event is resolved and loaded, so a null here means the route was
 * marked NO_HYDRATION by mistake — which should fail loudly, not pull for `null`.
 */
export function useActiveEventId(): string {
  const { eventId } = useOutletContext<ShellContext>();
  if (eventId === null) {
    throw new Error('useActiveEventId: this route reads event data but is marked NO_HYDRATION');
  }
  return eventId;
}
