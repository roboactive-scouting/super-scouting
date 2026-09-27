import { useSyncExternalStore } from 'react';

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
