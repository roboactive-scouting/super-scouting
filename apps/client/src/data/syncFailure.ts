import { SyncTimeoutError } from './api';
import { notifyChanged } from './changes';
import { getMeta, setMeta } from './db';

/** Why the last whole sync failed (UF.13). Cleared by the next one that succeeds. */
export type SyncFailure = { at: string; kind: SyncFailureKind; text: string };
export type SyncFailureKind = 'offline' | 'timeout' | 'refused' | 'server' | 'signin';

export const LAST_FAILURE = 'sync.last_failure';

/**
 * The first issue of a 400's zod message, as `field: what is wrong`, or null. Only the
 * server's own schema text is used; anything else in the body stays unread (SPEC-FINAL 17.8).
 */
function firstIssue(message: string): string | null {
  try {
    const issues = JSON.parse(message) as { path?: unknown; message?: unknown }[];
    const issue = Array.isArray(issues) ? issues[0] : undefined;
    if (!issue || typeof issue.message !== 'string') return null;
    const path = Array.isArray(issue.path) ? issue.path.join('.') : '';
    return path ? `${path}: ${issue.message}` : issue.message;
  } catch {
    return null;
  }
}

/** A failed sync as one plain line (SPEC-FINAL 17.8: never a raw code or server internals). */
export function describeSyncFailure(e: unknown): Pick<SyncFailure, 'kind' | 'text'> {
  if (e instanceof SyncTimeoutError) {
    return { kind: 'timeout', text: "The server didn't answer in time" };
  }
  // An ApiError, or anything shaped like one: the HTTP status says whose side failed.
  const { status, message } = (typeof e === 'object' && e !== null ? e : {}) as {
    status?: unknown;
    message?: unknown;
  };
  if (typeof status === 'number') {
    if (status === 401) return { kind: 'signin', text: 'Your sign-in expired' };
    if (status >= 500) return { kind: 'server', text: 'The server is having trouble' };
    if (status >= 400) {
      const issue = typeof message === 'string' ? firstIssue(message) : null;
      const text = "The server refused this device's data";
      return { kind: 'refused', text: issue ? `${text} — ${issue}` : text };
    }
  }
  return { kind: 'offline', text: 'No connection to the server' };
}

/** Keeping the reason never fails the sync itself: a write that fails is dropped. */
export async function recordSyncFailure(e: unknown): Promise<void> {
  const failure: SyncFailure = { at: new Date().toISOString(), ...describeSyncFailure(e) };
  await setMeta(LAST_FAILURE, failure).then(
    () => notifyChanged('meta'),
    () => undefined,
  );
}

/** After a sync that succeeded. Writes (and re-renders) only when there was a failure. */
export async function clearSyncFailure(): Promise<void> {
  try {
    if ((await getMeta<SyncFailure | null>(LAST_FAILURE, null)) === null) return;
    await setMeta(LAST_FAILURE, null);
    notifyChanged('meta');
  } catch {
    // As above: never fails the sync.
  }
}
