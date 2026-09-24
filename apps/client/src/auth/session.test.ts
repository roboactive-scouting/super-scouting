import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { enqueue } from '@/data/outbox';
import { needsSignIn, onSessionExpired, session, type Session } from './session';

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
