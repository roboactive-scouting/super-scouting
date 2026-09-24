import { useCallback, useEffect, useState } from 'react';
import { LIST_USERS_MAX_LIMIT, type PublicUser } from '@frc/shared';
import { call } from '@/data/rpc';
import { adminErrorLine, unreachable } from './adminMessages';

/**
 * The most accounts the admin page will page through. The team has about 11; this bound
 * exists so a runaway cursor cannot loop forever, and the page says when it is reached.
 */
export const MAX_LISTED_USERS = 1000;

export type UsersLoad =
  | { status: 'loading' }
  | { status: 'ready'; users: PublicUser[]; truncated: boolean }
  | { status: 'unreachable' }
  | { status: 'failed'; line: string };

/**
 * Every account the server lists, following `next_cursor` page by page. Always from the
 * server, never from the offline cache: the cache holds password hashes and may be stale,
 * and this page shows the server's current truth.
 */
export async function listAllUsers(
  includeDisabled: boolean,
): Promise<{ users: PublicUser[]; truncated: boolean }> {
  const users: PublicUser[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await call('listUsers', {
      include_disabled: includeDisabled,
      limit: LIST_USERS_MAX_LIMIT,
      ...(cursor ? { cursor } : {}),
    });
    users.push(...page.items);
    if (!page.next_cursor) return { users, truncated: false };
    if (users.length >= MAX_LISTED_USERS) {
      return { users: users.slice(0, MAX_LISTED_USERS), truncated: true };
    }
    cursor = page.next_cursor;
  }
}

const byUsername = (a: PublicUser, b: PublicUser) =>
  a.username < b.username ? -1 : a.username > b.username ? 1 : 0;

/** The user list for the admin pages, with `put` to fold in what a write returned. */
export function useUsers(includeDisabled: boolean) {
  const [load, setLoad] = useState<UsersLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    listAllUsers(includeDisabled).then(
      (result) => {
        if (live) setLoad({ status: 'ready', ...result });
      },
      (e: unknown) => {
        if (!live) return;
        setLoad(
          unreachable(e)
            ? { status: 'unreachable' }
            : { status: 'failed', line: adminErrorLine(e) },
        );
      },
    );
    return () => {
      live = false;
    };
  }, [includeDisabled, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  /** The server's answer to a write replaces the row (or adds it), in username order. */
  const put = useCallback(
    (user: PublicUser) =>
      setLoad((prev) => {
        if (prev.status !== 'ready') return prev;
        const others = prev.users.filter((u) => u.id !== user.id);
        const keep = includeDisabled || user.disabled_at === null;
        return { ...prev, users: (keep ? [...others, user] : others).sort(byUsername) };
      }),
    [includeDisabled],
  );

  return { load, reload, put };
}
