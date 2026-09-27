import { useSyncExternalStore } from 'react';
import { session } from '@/auth/session';

let overriddenEventId: string | null = null;
/** The chosen event's name, for the notices that name it. In memory, like the id. */
let overriddenEventName: string | null = null;
const listeners = new Set<(id: string | null) => void>();

/**
 * SPEC-FINAL 6.3: session-only and never persisted, on the server or on the device.
 * Reopening the app returns to the admin default. While an override is in effect the
 * client asks the server for computed results and no new entry may be created.
 */
export const sessionOverride = {
  get: (): string | null => overriddenEventId,
  /** The name the context page passed with `set`, or null. */
  name: (): string | null => overriddenEventName,
  set(eventId: string, eventName?: string): void {
    overriddenEventId = eventId;
    overriddenEventName = eventName ?? null;
    for (const listener of listeners) listener(eventId);
  },
  clear(): void {
    overriddenEventId = null;
    overriddenEventName = null;
    for (const listener of listeners) listener(null);
  },
  subscribe(listener: (id: string | null) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/**
 * The override belongs to the person who chose it (branch review, finding 5). On a shared
 * tablet a sign-out, or Switch scouter handing the device to someone else, clears it, so
 * the next scouter never inherits a paused Scout page and someone else's banner. A new
 * token for the same person (a reconnect, a refresh) or an expiry keeps it.
 */
let lastUserId: string | null | undefined;
session.subscribe((next) => {
  const userId = next?.user.id ?? null;
  if (userId === null || (lastUserId !== undefined && userId !== lastUserId)) {
    if (overriddenEventId !== null) sessionOverride.clear();
  }
  lastUserId = userId;
});

export function entryCreationAllowed(): boolean {
  return overriddenEventId === null;
}

export type SessionOverrideState = { eventId: string; eventName: string | null } | null;

/**
 * The override, re-rendering on every change. `useSyncExternalStore` is the subscribe /
 * unsubscribe-in-an-effect pattern with React's own tearing guard: the nav, the strip and
 * the route guard can never disagree for a frame about whether an override is set.
 */
export function useSessionOverride(): SessionOverrideState {
  const eventId = useSyncExternalStore(sessionOverride.subscribe, sessionOverride.get);
  const eventName = useSyncExternalStore(sessionOverride.subscribe, sessionOverride.name);
  return eventId === null ? null : { eventId, eventName };
}
