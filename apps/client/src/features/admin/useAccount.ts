import { useCallback, useEffect, useState } from 'react';
import { LIST_USERS_MAX_LIMIT, type PublicUser } from '@frc/shared';
import type { Rpc } from '@/data/rpc';
import { adminErrorLine, unreachable } from './adminMessages';

export type AccountLoad =
  | { status: 'loading' }
  | { status: 'ready'; user: PublicUser | null }
  | { status: 'unreachable' }
  | { status: 'failed'; line: string };

type Page = { items: PublicUser[]; next_cursor: string | null };

/** Pages through `listUsers` (disabled accounts included) until the account is found. */
async function findAccount(rpc: Rpc, id: string): Promise<PublicUser | null> {
  let cursor: string | undefined;
  for (;;) {
    const page = (await rpc.call('listUsers', {
      include_disabled: true,
      limit: LIST_USERS_MAX_LIMIT,
      ...(cursor ? { cursor } : {}),
    })) as Page;
    const found = page.items.find((u) => u.id === id);
    if (found) return found;
    if (!page.next_cursor) return null;
    cursor = page.next_cursor;
  }
}

/**
 * One account, from the server (never the offline cache, which holds password hashes and
 * may be stale). Fetched once per visit; `put` folds in what a write answered.
 */
export function useAccount(rpc: Rpc, id: string) {
  const [load, setLoad] = useState<AccountLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    findAccount(rpc, id).then(
      (user) => {
        if (live) setLoad({ status: 'ready', user });
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
  }, [rpc, id, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const put = useCallback((user: PublicUser) => setLoad({ status: 'ready', user }), []);
  return { load, reload, put };
}
