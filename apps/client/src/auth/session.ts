import type { Role } from '@frc/shared';
import { db, type MetaRecord } from '@/data/db';

export type SessionUser = {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  must_change_password: boolean;
};

/**
 * `token: null` has two meanings, told apart by the flags:
 * - `expired: true` — the server answered 401 to this token. The user is KEPT, so the
 *   entries made meanwhile stay attributed to them, and the app asks them to sign in.
 * - `offline: true` — an offline sign-in (task 1.16): no token was ever minted.
 */
export type Session = {
  user: SessionUser;
  token: string | null;
  offline: boolean;
  expired: boolean;
};

const KEY = 'auth.session';
const listeners = new Set<(session: Session | null) => void>();
const expiredListeners = new Set<(session: Session) => void>();

/** No session at all, or one whose token the server has refused. */
export function needsSignIn(current: Session | null): boolean {
  return current === null || current.expired;
}

async function read(): Promise<Session | null> {
  const record = await db.meta.get(KEY);
  const value = record?.value as Partial<Session> | null | undefined;
  if (!value?.user) return null;
  return {
    user: value.user,
    token: value.token ?? null,
    offline: value.offline ?? false,
    expired: value.expired ?? false,
  };
}

/** Bumped on every change, so a slow initial read never overwrites a newer value. */
let generation = 0;

function notify(next: Session | null): void {
  generation += 1;
  for (const listener of listeners) listener(next);
}

/**
 * Read-modify-write in one IndexedDB transaction, so a refreshed token arriving on one
 * request cannot interleave with a 401 or a sign-in arriving on another.
 */
async function update(
  change: (current: Session | null) => Session | null | undefined,
): Promise<{ before: Session | null; after: Session | null } | null> {
  const box: { result?: { before: Session | null; after: Session | null } } = {};
  await db.transaction('rw', db.meta, async () => {
    const before = await read();
    const after = change(before);
    if (after === undefined) return; // no change
    const record: MetaRecord = { key: KEY, value: after };
    await db.meta.put(record);
    box.result = { before, after };
  });
  if (box.result) notify(box.result.after);
  return box.result ?? null;
}

export const session = {
  current: read,

  async token(): Promise<string | null> {
    return (await read())?.token ?? null;
  },

  async signIn(user: SessionUser, token: string | null, offline = false): Promise<void> {
    await update(() => ({ user, token, offline, expired: false }));
  },

  /**
   * Stores an `X-Refreshed-Token` (SPEC-FINAL 7.5). `sentWith` is the bearer the
   * request carried: if the session has changed hands since (a sign-out and a different
   * scouter's sign-in on a shared device), the late refresh belongs to the previous
   * user and is ignored. It never revives an expired session.
   */
  async replaceToken(token: string, sentWith?: string | null): Promise<void> {
    await update((current) => {
      if (!current || current.expired || current.token === null) return undefined;
      if (sentWith !== undefined && sentWith !== current.token) return undefined;
      return { ...current, token, offline: false };
    });
  },

  /**
   * A 401 on an authenticated call. Drops the token, KEEPS the user and marks the session
   * as needing sign-in. Never touches drafts, the dataset or the outbox: an entry in
   * progress carries on, and everything queued syncs after the next sign-in.
   * `sentWith` as for replaceToken: a 401 for a token that is no longer current (the
   * user has already signed in again) changes nothing.
   */
  async expire(sentWith?: string | null): Promise<void> {
    const result = await update((current) => {
      if (!current || current.expired) return undefined;
      if (sentWith != null && sentWith !== current.token) return undefined;
      return { ...current, token: null, offline: false, expired: true };
    });
    const after = result?.after;
    if (after) for (const listener of expiredListeners) listener(after);
  },

  /** Merges server-authoritative fields into the signed-in user (role, name, flags). */
  async updateUser(
    patch: Partial<Pick<SessionUser, 'full_name' | 'role' | 'must_change_password'>>,
  ): Promise<void> {
    await update((current) =>
      current ? { ...current, user: { ...current.user, ...patch } } : undefined,
    );
  },

  /**
   * The database is authoritative for role (SPEC-FINAL 7.5), on the client too: after a
   * pull, the cached `users` row wins over whatever the login response said.
   */
  async refreshFromCache(): Promise<void> {
    const current = await read();
    if (!current) return;
    const row = (await db.rows.get(['users', current.user.id])) as
      { role?: Role; full_name?: string } | undefined;
    if (!row) return;
    const role = row.role ?? current.user.role;
    const fullName = row.full_name ?? current.user.full_name;
    if (role === current.user.role && fullName === current.user.full_name) return;
    await update((now) =>
      now && now.user.id === current.user.id
        ? { ...now, user: { ...now.user, role, full_name: fullName } }
        : undefined,
    );
  },

  /**
   * SPEC-FINAL 7.5: logout clears the token and the session-scoped draft state. It does
   * NOT clear the offline dataset or the outbox — a scouter's unsynced work is not
   * something a sign-out may destroy.
   */
  async signOut(): Promise<void> {
    await db.practiceDrafts.clear();
    await update(() => null);
  },

  subscribe(listener: (session: Session | null) => void): () => void {
    listeners.add(listener);
    const at = generation;
    void read().then((s) => {
      if (listeners.has(listener) && generation === at) listener(s);
    });
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * THE TASK 1.16 SEAM. Fired once each time a session expires (a 401 on an authenticated
 * call). Task 1.16 holds the password of an offline sign-in in memory only (SPEC-FINAL
 * 7.5) and registers here to exchange it for a real token — `rpc.call('login', …)` then
 * `session.signIn(user, token)`. Nothing registers in 1.15: no token is minted and no
 * login is retried automatically.
 */
export function onSessionExpired(listener: (session: Session) => void): () => void {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
}
