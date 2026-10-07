import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { enqueue } from '@/data/outbox';
import {
  needsSignIn,
  onSessionExpired,
  session,
  syncSessionAcrossTabs,
  type Session,
  type SessionChannel,
} from './session';

const user = {
  id: 'u-1',
  username: 'alice',
  full_name: 'Alice',
  role: 'lead' as const,
  must_change_password: false,
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('session (SPEC-FINAL 7.5)', () => {
  it('stores the token in IndexedDB, not in localStorage', async () => {
    await session.signIn(user, 'token-abc');
    expect(await session.token()).toBe('token-abc');
    expect(globalThis.localStorage?.getItem('token')).toBeFalsy();
  });

  it('survives a reload', async () => {
    await session.signIn(user, 'token-abc');
    db.close();
    await db.open();
    expect((await session.current())?.user.id).toBe('u-1');
  });

  it('replaces the token when a refreshed one arrives', async () => {
    await session.signIn(user, 'token-abc');
    await session.replaceToken('token-def');
    expect(await session.token()).toBe('token-def');
    expect((await session.current())?.user.id).toBe('u-1');
  });

  it('signOut clears the token but never the dataset or the outbox', async () => {
    await session.signIn(user, 'token-abc');
    await db.rows.put({ entity: 'scouting_entries', id: 'e-1', event_id: 'ev-1' });
    await enqueue({
      op_id: 'o-1',
      entity: 'scouting_entry',
      row_id: 'e-1',
      action: 'create',
      base_version: null,
      payload: {},
      author_user_id: 'u-1',
      client_created_at: '2026-11-14T09:00:00.000Z',
      client_updated_at: '2026-11-14T09:00:00.000Z',
      seq: 1,
    });

    await session.signOut();

    expect(await session.token()).toBeNull();
    expect(await db.rows.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);
  });

  it('notifies subscribers on sign-in and sign-out', async () => {
    const seen: (string | null)[] = [];
    const stop = session.subscribe((s) => seen.push(s?.user.id ?? null));
    await session.signIn(user, 't');
    await session.signOut();
    stop();
    expect(seen).toContain('u-1');
    expect(seen).toContain(null);
  });
});

describe('session.expire — a 401 on an authenticated call', () => {
  it('drops the token, keeps the user, and marks the session as needing sign-in', async () => {
    await session.signIn(user, 'token-abc');
    await session.expire();
    const now = await session.current();
    expect(now?.token).toBeNull();
    expect(now?.user).toEqual(user);
    expect(now?.expired).toBe(true);
    expect(needsSignIn(now ?? null)).toBe(true);
  });

  it('never clears drafts, the dataset or the outbox', async () => {
    await session.signIn(user, 'token-abc');
    await db.rows.put({ entity: 'scouting_entries', id: 'e-1', event_id: 'ev-1' });
    await db.drafts.put({ key: 'k', row_id: '', payload: { a: 1 }, updated_at: 'x' });
    await db.practiceDrafts.put({ key: 'p', row_id: '', payload: {}, updated_at: 'x' });
    await enqueue({
      op_id: 'o-1',
      entity: 'scouting_entry',
      row_id: 'e-1',
      action: 'create',
      base_version: null,
      payload: {},
      author_user_id: 'u-1',
      client_created_at: '2026-11-14T09:00:00.000Z',
      client_updated_at: '2026-11-14T09:00:00.000Z',
      seq: 1,
    });

    await session.expire();

    expect(await db.rows.count()).toBe(1);
    expect(await db.drafts.count()).toBe(1);
    expect(await db.practiceDrafts.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);
  });

  it('does not expire a newer session than the one whose token was refused', async () => {
    await session.signIn(user, 'old');
    await session.signIn({ ...user, id: 'u-2' }, 'new');
    await session.expire('old');
    expect(await session.token()).toBe('new');
    expect((await session.current())?.expired).toBe(false);
  });

  it('is a no-op with no session', async () => {
    await session.expire();
    expect(await session.current()).toBeNull();
  });

  it('tells the 1.16 hook, and a fresh sign-in clears the expiry', async () => {
    const heard: Session[] = [];
    const stop = onSessionExpired((s) => heard.push(s));
    await session.signIn(user, 'token-abc');
    await session.expire();
    stop();
    expect(heard.map((s) => s.user.id)).toEqual(['u-1']);

    await session.signIn(user, 'token-2');
    expect((await session.current())?.expired).toBe(false);
    expect(needsSignIn((await session.current()) ?? null)).toBe(false);
  });
});

describe('session.expireOffline — a tokenless session that cannot get a token (UF.2)', () => {
  it('expires the named user’s offline session, keeping the user, and says so', async () => {
    const heard: Session[] = [];
    const stop = onSessionExpired((s) => heard.push(s));
    await session.signIn(user, null, true);
    expect(await session.expireOffline('u-1')).toBe(true);
    stop();
    expect(await session.current()).toMatchObject({
      user,
      token: null,
      offline: false,
      expired: true,
    });
    expect(heard).toHaveLength(1);
  });

  it('leaves a session that holds a token alone', async () => {
    await session.signIn(user, 'token-abc');
    expect(await session.expireOffline('u-1')).toBe(false);
    expect(await session.token()).toBe('token-abc');
  });

  it('leaves another user’s session alone', async () => {
    await session.signIn({ ...user, id: 'u-2' }, null, true);
    expect(await session.expireOffline('u-1')).toBe(false);
    expect((await session.current())?.expired).toBe(false);
  });

  it('reports whether expire changed anything', async () => {
    await session.signIn(user, 'token-abc');
    expect(await session.expire('stale')).toBe(false);
    expect(await session.expire('token-abc')).toBe(true);
    expect(await session.expire('token-abc')).toBe(false); // already expired
  });
});

describe('session.replaceToken guards', () => {
  it('never revives an expired session', async () => {
    await session.signIn(user, 'token-abc');
    await session.expire();
    await session.replaceToken('late-refresh');
    expect(await session.token()).toBeNull();
  });

  it('ignores a refresh for a token that is no longer the current one', async () => {
    await session.signIn(user, 'alice-token');
    await session.signIn({ ...user, id: 'u-2' }, 'bob-token');
    await session.replaceToken('alice-refreshed', 'alice-token');
    expect(await session.token()).toBe('bob-token');
  });
});

describe('session.refreshFromCache — the database is authoritative for role (7.5)', () => {
  it('takes role and full name from the cached users row when they differ', async () => {
    await session.signIn({ ...user, role: 'scouter' }, 't');
    await db.rows.put({ entity: 'users', id: 'u-1', role: 'admin', full_name: 'Alice Cohen' });
    await session.refreshFromCache();
    expect((await session.current())?.user).toMatchObject({
      role: 'admin',
      full_name: 'Alice Cohen',
    });
    expect(await session.token()).toBe('t');
  });

  it('leaves the session alone when there is no cached row', async () => {
    await session.signIn(user, 't');
    await session.refreshFromCache();
    expect((await session.current())?.user).toEqual(user);
  });
});

describe('session.updateUser', () => {
  it('merges the username along with the other server-authoritative fields', async () => {
    await session.signIn(user, 'token-abc');
    await session.updateUser({ username: 'alice.cohen', full_name: 'Alice Cohen' });
    expect((await session.current())?.user).toMatchObject({
      username: 'alice.cohen',
      full_name: 'Alice Cohen',
    });
    expect(await session.token()).toBe('token-abc');
  });
});

describe('session.subscribe', () => {
  it('never lets its initial read overwrite a newer change', async () => {
    const seen: (string | null)[] = [];
    const stop = session.subscribe((s) => seen.push(s?.user.id ?? null));
    // Signed in before the subscription's own initial read has resolved.
    await session.signIn(user, 't');
    await new Promise((resolve) => setTimeout(resolve, 20));
    stop();
    expect(seen.at(-1)).toBe('u-1');
  });
});

describe('the session across tabs (UF.2)', () => {
  function fakeChannel() {
    const channel: SessionChannel = { postMessage: vi.fn(), onmessage: null, close: vi.fn() };
    return { channel, disconnect: syncSessionAcrossTabs(() => channel) };
  }

  it('announces every change to the other tabs', async () => {
    const { channel, disconnect } = fakeChannel();
    try {
      await session.signIn(user, 'token-abc');
      await session.replaceToken('token-def');
      await session.expire();
      await session.signIn(user, null, true);
      await session.expireOffline('u-1');
      await session.signOut();
      expect(channel.postMessage).toHaveBeenCalledTimes(6);
      // A call that changes nothing announces nothing.
      await session.expire();
      expect(channel.postMessage).toHaveBeenCalledTimes(6);
    } finally {
      disconnect();
    }
  });

  it('re-reads the session when another tab changes it, and tells this tab’s listeners', async () => {
    const { channel, disconnect } = fakeChannel();
    await session.signIn(user, 'token-abc');
    const seen: (Session | null)[] = [];
    const stop = session.subscribe((s) => seen.push(s));
    try {
      await vi.waitFor(() => expect(seen).toHaveLength(1));
      // Another tab signs out: it writes IndexedDB, which this tab shares.
      await db.meta.put({ key: 'auth.session', value: null });
      channel.onmessage?.(new MessageEvent('message'));
      await vi.waitFor(() => expect(seen.at(-1)).toBeNull());
    } finally {
      stop();
      disconnect();
    }
  });

  it('is a no-op without a BroadcastChannel', async () => {
    const disconnect = syncSessionAcrossTabs(() => null);
    await session.signIn(user, 'token-abc');
    expect(await session.token()).toBe('token-abc');
    disconnect();
  });

  it('closes the channel on disconnect, and announces nothing after', async () => {
    const { channel, disconnect } = fakeChannel();
    disconnect();
    expect(channel.close).toHaveBeenCalled();
    await session.signIn(user, 'token-abc');
    expect(channel.postMessage).not.toHaveBeenCalled();
  });
});
