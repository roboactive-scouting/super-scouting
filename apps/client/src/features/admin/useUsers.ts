import { useCallback, useEffect, useState } from 'react';
import { LIST_USERS_MAX_LIMIT, type PublicUser } from '@frc/shared';
import { adminRpc, type Rpc } from '@/data/rpc';
import { adminErrorLine, unreachable } from './adminMessages';

/**
 * The most accounts the admin page will page through. The team has about 11; this bound
 * exists so a runaway cursor cannot loop forever, and the page says when it is reached.
 */
export const MAX_LISTED_USERS = 1000;

/** Entries this season per scouter id; `null` when no season is active. */
export type EntryCounts = ReadonlyMap<string, number> | null;

export type UsersLoad =
  | { status: 'loading' }
  | { status: 'ready'; users: PublicUser[]; truncated: boolean; counts: EntryCounts }
  | { status: 'unreachable' }
  | { status: 'failed'; line: string };

type Page<T> = { items: T[]; next_cursor: string | null };

/**
 * Every account the server lists (disabled ones too), following `next_cursor` page by page.
 * Always from the server, never from the offline cache: the cache holds password hashes and
 * may be stale, and this page shows the server's current truth.
 */
export async function listAllUsers(rpc: Rpc): Promise<{ users: PublicUser[]; truncated: boolean }> {
  const users: PublicUser[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = (await rpc.call('listUsers', {
      include_disabled: true,
      limit: LIST_USERS_MAX_LIMIT,
      ...(cursor ? { cursor } : {}),
    })) as Page<PublicUser>;
    users.push(...page.items);
    if (!page.next_cursor) return { users, truncated: false };
    if (users.length >= MAX_LISTED_USERS) {
      return { users: users.slice(0, MAX_LISTED_USERS), truncated: true };
    }
    cursor = page.next_cursor;
  }
}

/** Entries per person in the active season (RB.13), or `null` with no active season. */
export async function entriesThisSeason(rpc: Rpc): Promise<EntryCounts> {
  const context = (await rpc.call('getActiveContext', {})) as { active_season_id: string | null };
  if (!context.active_season_id) return null;
  const out = (await rpc.call('countEntriesByScouter', {
    season_id: context.active_season_id,
  })) as { items: { scouter_id: string; count: number }[] };
  return new Map(out.items.map((i) => [i.scouter_id, i.count]));
}

/**
 * The Users page's data, loaded once per visit: every account and the season's entry
 * counts, side by side. `put` folds in what a write returned, with no re-fetch.
 */
export function useUsers(rpc: Rpc = adminRpc) {
  const [load, setLoad] = useState<UsersLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    // A failing count is not a failing page: the column shows "–", as with no season.
    Promise.all([listAllUsers(rpc), entriesThisSeason(rpc).catch(() => null)]).then(
      ([list, counts]) => {
        if (live) setLoad({ status: 'ready', ...list, counts });
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
  }, [rpc, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  /** The server's answer to a write replaces the row, or adds it. */
  const put = useCallback(
    (user: PublicUser) =>
      setLoad((prev) => {
        if (prev.status !== 'ready') return prev;
        const at = prev.users.findIndex((u) => u.id === user.id);
        const users =
          at === -1 ? [...prev.users, user] : prev.users.map((u, i) => (i === at ? user : u));
        return { ...prev, users };
      }),
    [],
  );

  return { load, reload, put };
}
