import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { ensureToken } from './ensureToken';
import { pendingCredential } from './pendingCredential';
import { session } from './session';
import { lastTokenLoss } from './tokenLoss';

vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

const alice = {
  id: '00000000-0000-4000-8000-00000000a11c',
  username: 'alice',
  full_name: 'Alice',
  role: 'admin' as const,
  must_change_password: false,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();
let online = true;

beforeEach(async () => {
  await db.delete();
  await db.open();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  // An offline sign-in: no token, the password held in memory (SPEC-FINAL 7.5).
  await session.signIn(alice, null, true);
  pendingCredential.set({ username: 'alice', password: 'correct horse' });
});

afterEach(() => {
  pendingCredential.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ensureToken — no silent tokenless session on an online device (UF.2)', () => {
  it('exchanges the held password and returns the new token', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { token: 'tok-1', user: alice }));
    expect(await ensureToken()).toBe('tok-1');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api.test/api/login');
    expect(await session.current()).toMatchObject({ token: 'tok-1', offline: false });
    expect(await lastTokenLoss()).toBeNull();
  });

  it('shares one exchange between concurrent callers', async () => {
    fetchMock.mockResolvedValue(json(200, { token: 'tok-1', user: alice }));
    const tokens = await Promise.all([ensureToken(), ensureToken(), ensureToken()]);
    expect(tokens).toEqual(['tok-1', 'tok-1', 'tok-1']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('with no password held, on start or before a call: does nothing (venue Wi-Fi lies)', async () => {
    pendingCredential.clear();
    expect(await ensureToken({ path: 'listUsers' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await session.current()).toMatchObject({ token: null, offline: true, expired: false });
    expect(await lastTokenLoss()).toBeNull();
  });

  it('with no password held, after our server answered 401: expires and records why', async () => {
    pendingCredential.clear();
    expect(await ensureToken({ path: 'listUsers', serverAnswered401: true })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await session.current()).toMatchObject({ user: alice, token: null, expired: true });
    expect(await lastTokenLoss()).toMatchObject({ reason: '401', path: 'listUsers' });
  });

  it('a refused password, with no 401 from a call yet: forgets it, records it, keeps the session', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'x' } }),
    );
    expect(await ensureToken()).toBeNull();
    expect(pendingCredential.get()).toBeNull();
    expect(await session.current()).toMatchObject({ offline: true, expired: false });
    expect(await lastTokenLoss()).toMatchObject({ reason: 'reconnect-failed', path: 'login' });
  });

  it('a refused password after our server answered 401: expires the session', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'x' } }),
    );
    expect(await ensureToken({ path: '/sync/pull', serverAnswered401: true })).toBeNull();
    expect((await session.current())?.expired).toBe(true);
    expect(await lastTokenLoss()).toMatchObject({ reason: '401', path: '/sync/pull' });
  });

  it('a disabled account after our server answered 401: expires the session', async () => {
    fetchMock.mockResolvedValueOnce(json(403, { error: { code: 'forbidden', message: 'x' } }));
    expect(await ensureToken({ serverAnswered401: true })).toBeNull();
    expect((await session.current())?.expired).toBe(true);
  });

  it('keeps the offline session and the password when the login cannot reach the server', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await ensureToken({ serverAnswered401: true })).toBeNull();
    expect(await session.current()).toMatchObject({ token: null, offline: true, expired: false });
    expect(pendingCredential.get()).not.toBeNull();
    expect(await lastTokenLoss()).toBeNull();
  });

  it('offline: makes no exchange and never expires the session, password held or not', async () => {
    online = false;
    expect(await ensureToken({ serverAnswered401: true })).toBeNull();
    pendingCredential.clear();
    expect(await ensureToken({ serverAnswered401: true })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await session.current()).toMatchObject({ token: null, offline: true, expired: false });
    expect(await lastTokenLoss()).toBeNull();
  });

  it('returns a held token as it is, with no request', async () => {
    await session.signIn(alice, 'tok-live');
    expect(await ensureToken()).toBe('tok-live');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing with no session, or an expired one', async () => {
    await session.expire();
    expect(await ensureToken()).toBeNull();
    await session.signOut();
    expect(await ensureToken()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
