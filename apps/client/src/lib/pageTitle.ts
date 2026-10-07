import { useEffect, useSyncExternalStore } from 'react';
import { useMatches } from 'react-router-dom';

/**
 * What a route says about itself in its `handle` (merged with NO_HYDRATION, never in place
 * of it). `title` names the page in the phone top bar and ends the desktop crumb;
 * `phoneTitle` is the phone's name where the phone does a different job there (Manage →
 * Matches); `crumb` is the desktop crumb's lead-in, e.g. `['Admin']` → "Admin / Users".
 */
export type PageHandle = { title?: string; phoneTitle?: string; crumb?: readonly string[] };

type Owned = { title: string; owner: object };
let current: Owned | null = null;
const listeners = new Set<() => void>();

function set(next: Owned | null) {
  current = next;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A page names itself in the top bar ("Q38 · 5951"), over its route's `handle.title`.
 * `null` hands the name back to the route. Cleared when the page unmounts.
 */
export function usePageTitle(title: string | null): void {
  useEffect(() => {
    if (title === null) return;
    const owner = {};
    set({ title, owner });
    return () => {
      if (current?.owner === owner) set(null);
    };
  }, [title]);
}

type OwnedCrumb = { parts: readonly string[]; owner: object };
let currentCrumb: OwnedCrumb | null = null;
const crumbListeners = new Set<() => void>();

function setCrumb(next: OwnedCrumb | null) {
  currentCrumb = next;
  for (const listener of [...crumbListeners]) listener();
}

function subscribeCrumb(listener: () => void) {
  crumbListeners.add(listener);
  return () => crumbListeners.delete(listener);
}

/**
 * A page sets the DESKTOP crumb itself ("2026 / **District #3 · Tel Aviv**": parts joined
 * with " / ", the last in bold ink). `null` hands the crumb back to the route's handle.
 * Cleared when the page unmounts. The phone top bar's title is not affected.
 */
export function usePageCrumb(parts: string[] | null): void {
  const key = parts === null ? null : JSON.stringify(parts);
  useEffect(() => {
    if (key === null) return;
    const owner = {};
    setCrumb({ parts: JSON.parse(key) as string[], owner });
    return () => {
      if (currentCrumb?.owner === owner) setCrumb(null);
    };
  }, [key]);
}

function handleOf(value: unknown): PageHandle {
  return typeof value === 'object' && value !== null ? (value as PageHandle) : {};
}

/** The deepest route that names itself. */
function useRouteHandle(): PageHandle {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = handleOf(matches[i]!.handle);
    if (handle.title !== undefined) return handle;
  }
  return {};
}

/**
 * The current page's name: what the page set with usePageTitle, else its route's handle.
 * `phone` reads the phone's name (`phoneTitle`) where the route gives one.
 */
export function useCurrentTitle(phone = true): string {
  const own = useSyncExternalStore(subscribe, () => current);
  const handle = useRouteHandle();
  if (own) return own.title;
  return (phone ? handle.phoneTitle : undefined) ?? handle.title ?? '';
}

/**
 * The desktop top bar's crumb: the route's lead-in, then the page's name. A lead-in that ends
 * with the name itself (the user detail page before it names the user) is not said twice.
 */
export function useCrumb(): { trail: readonly string[]; current: string } {
  const handle = useRouteHandle();
  const ownCrumb = useSyncExternalStore(subscribeCrumb, () => currentCrumb);
  const current = useCurrentTitle(false);
  if (ownCrumb && ownCrumb.parts.length > 0) {
    return { trail: ownCrumb.parts.slice(0, -1), current: ownCrumb.parts.at(-1)! };
  }
  const trail = handle.crumb ?? [];
  return { trail: trail.at(-1) === current ? trail.slice(0, -1) : trail, current };
}
