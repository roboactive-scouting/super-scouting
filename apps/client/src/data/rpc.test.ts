import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pendingCredential } from '@/auth/pendingCredential';
import { session } from '@/auth/session';
import { lastTokenLoss } from '@/auth/tokenLoss';
import { db } from './db';
import { ADMIN_CALL_TIMEOUT_MS, adminRpc, call, rpc, RpcError } from './rpc';

vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

const user = {
  id: '00000000-0000-4000-8000-000000000006',
  username: 'alice',
  full_name: 'Alice',
  role: 'scouter' as const,
  must_change_password: false,
};

const publicUser = { ...user, disabled_at: null, created_at: '2026-01-01T00:00:00.000Z' };

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  await db.delete();
  await db.open();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const headersOf = (i = 0) => new Headers(fetchMock.mock.calls[i]?.[1]?.headers);

describe('the RPC client (SPEC-FINAL 16.1, 7.5)', () => {
  it('posts to /api/<name> with the bearer on an authenticated route', async () => {
    await session.signIn(user, 'token-abc');
    fetchMock.mockResolvedValueOnce(json(200, publicUser));
    await call('changeOwnPassword', { current_password: 'a', new_password: 'longenough' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/api/changeOwnPassword');
    expect(headersOf().get('authorization')).toBe('Bearer token-abc');
  });

  it('sends no Authorization header with no session', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'x' } }),
    );
    await expect(rpc.call('listUsers', {})).rejects.toBeInstanceOf(RpcError);
    expect(headersOf().has('authorization')).toBe(false);
  });

  it('stores an X-Refreshed-Token it receives', async () => {
    await session.signIn(user, 'token-abc');
    fetchMock.mockResolvedValueOnce(json(200, publicUser, { 'X-Refreshed-Token': 'token-new' }));
    await call('changeOwnPassword', { current_password: 'a', new_password: 'longenough' });
    expect(await session.token()).toBe('token-new');
  });

  it('expires the session on a 401 from an authenticated route, and throws', async () => {
    await session.signIn(user, 'token-abc');
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'sign in again' } }),
    );
    await expect(
      call('changeOwnPassword', { current_password: 'a', new_password: 'longenough' }),
    ).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
    expect((await session.current())?.expired).toBe(true);
    expect((await session.current())?.user.id).toBe(user.id);
  });

  it('does NOT expire on a 401 from login — that is a wrong password', async () => {
    await session.signIn(user, 'token-abc');
    const expire = vi.spyOn(session, 'expire');
    fetchMock.mockResolvedValueOnce(
      json(401, {
        error: { code: 'unauthenticated', message: 'that username and password do not match' },
      }),
    );
    await expect(call('login', { username: 'alice', password: 'nope' })).rejects.toMatchObject({
      status: 401,
    });
    expect(expire).not.toHaveBeenCalled();
    expect(await session.token()).toBe('token-abc');
  });

  it('does NOT expire on a 401 from refreshToken either', async () => {
    await session.signIn(user, 'token-abc');
    const expire = vi.spyOn(session, 'expire');
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'x' } }),
    );
    await expect(call('refreshToken', { token: 'token-abc' })).rejects.toBeInstanceOf(RpcError);
    expect(expire).not.toHaveBeenCalled();
  });

  it('keeps the session and the token on a 403', async () => {
    await session.signIn(user, 'token-abc');
    const expire = vi.spyOn(session, 'expire');
    fetchMock.mockResolvedValueOnce(
      json(403, { error: { code: 'forbidden', message: 'not permitted: manage_users' } }),
    );
    await expect(rpc.call('listUsers', {})).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
    expect(expire).not.toHaveBeenCalled();
    expect(await session.token()).toBe('token-abc');
    expect((await session.current())?.expired).toBe(false);
  });

  it('reports a network failure as status 0, code offline', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(call('login', { username: 'a', password: 'b' })).rejects.toMatchObject({
      status: 0,
      code: 'offline',
    });
  });

  it('abandons a request that outlives its deadline as status 0, code timeout', async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    await expect(
      call('login', { username: 'a', password: 'b' }, { timeoutMs: 20 }),
    ).rejects.toMatchObject({ status: 0, code: 'timeout', answered: false });
    expect(signal?.aborted).toBe(true);
  });

  it('sets no deadline and no signal unless asked to', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { token: 't', user }));
    await call('login', { username: 'a', password: 'b' });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeUndefined();
  });

  it('marks an error in our own shape as answered, and anything else as not', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'no match' } }),
    );
    await expect(call('login', { username: 'a', password: 'b' })).rejects.toMatchObject({
      status: 401,
      answered: true,
    });
    fetchMock.mockResolvedValueOnce(new Response('<html>portal</html>', { status: 401 }));
    await expect(call('login', { username: 'a', password: 'b' })).rejects.toMatchObject({
      status: 401,
      answered: false,
    });
    fetchMock.mockResolvedValueOnce(
      new Response('<html>portal</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(call('login', { username: 'a', password: 'b' })).rejects.toMatchObject({
      status: 500,
      answered: false,
    });
  });

  it('refuses an input the shared schema rejects, before any request', async () => {
    await expect(
      call('changeOwnPassword', { current_password: 'a', new_password: 'short' }),
    ).rejects.toMatchObject({ code: 'invalid', message: 'use at least 8 characters' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses the output with the shared schema, stripping unknown fields', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { token: 't', user: { ...user, password_hash: 'secret' } }),
    );
    const out = await call('login', { username: 'alice', password: 'pw' });
    expect(out.user).toEqual(user);
  });
});

describe('an offline sign-in on an online device (UF.2)', () => {
  let online = true;
  const unauthenticated = () =>
    json(401, { error: { code: 'unauthenticated', message: 'sign in again' } });
  const urls = () => fetchMock.mock.calls.map(([url]) => String(url));

  beforeEach(async () => {
    online = true;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    await session.signIn(user, null, true);
    pendingCredential.set({ username: 'alice', password: 'pw' });
  });

  afterEach(() => pendingCredential.clear());

  it('gets a token before an authenticated call, and sends the call with it', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { token: 'tok-new', user }))
      .mockResolvedValueOnce(json(200, { items: [] }));
    await rpc.call('listUsers', {});
    expect(urls()).toEqual(['https://api.test/api/login', 'https://api.test/api/listUsers']);
    expect(headersOf(1).get('authorization')).toBe('Bearer tok-new');
  });

  it('with no password held: sends the call; our server’s 401 expires the session', async () => {
    pendingCredential.clear();
    fetchMock.mockResolvedValueOnce(unauthenticated());
    await expect(rpc.call('listUsers', {})).rejects.toMatchObject({ status: 401 });
    expect(urls()).toEqual(['https://api.test/api/listUsers']);
    expect(await session.current()).toMatchObject({ user, token: null, expired: true });
    expect(await lastTokenLoss()).toMatchObject({ reason: '401', path: 'listUsers' });
  });

  it('a 401 that is not our server’s (a portal) never expires the offline session', async () => {
    pendingCredential.clear();
    fetchMock.mockResolvedValueOnce(
      new Response('<html>Sign in to Venue WiFi</html>', {
        status: 401,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(rpc.call('listUsers', {})).rejects.toMatchObject({ status: 401 });
    expect(await session.current()).toMatchObject({ token: null, offline: true, expired: false });
    expect(await lastTokenLoss()).toBeNull();
  });

  it('a 401 sent with no bearer tries the exchange again, and expires when it is refused', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch')) // the first exchange: no answer
      .mockResolvedValueOnce(unauthenticated()) // the call itself, with no bearer
      .mockResolvedValueOnce(unauthenticated()); // the exchange on the 401: refused
    await expect(rpc.call('removeTeamFromEvent', {})).rejects.toMatchObject({ status: 401 });
    expect(urls()).toEqual([
      'https://api.test/api/login',
      'https://api.test/api/removeTeamFromEvent',
      'https://api.test/api/login',
    ]);
    expect(headersOf(1).has('authorization')).toBe(false);
    expect((await session.current())?.expired).toBe(true);
    expect(await lastTokenLoss()).toMatchObject({ reason: '401', path: 'removeTeamFromEvent' });
  });

  it('a 401 sent with no bearer that then gets a token leaves the session signed in', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(unauthenticated())
      .mockResolvedValueOnce(json(200, { token: 'tok-new', user }));
    await expect(rpc.call('listUsers', {})).rejects.toMatchObject({ status: 401 });
    expect(await session.current()).toMatchObject({ token: 'tok-new', expired: false });
    expect(await lastTokenLoss()).toBeNull();
  });

  it('a 403 sent with no bearer never expires anything', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(403, { error: { code: 'forbidden', message: 'no' } }));
    await expect(rpc.call('listUsers', {})).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await session.current()).toMatchObject({ token: null, offline: true, expired: false });
    expect(await lastTokenLoss()).toBeNull();
  });

  it('offline: makes no exchange and never expires the session', async () => {
    online = false;
    pendingCredential.clear();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(rpc.call('listUsers', {})).rejects.toMatchObject({ status: 0 });
    expect(urls()).toEqual(['https://api.test/api/listUsers']);
    expect(await session.current()).toMatchObject({ token: null, offline: true, expired: false });
  });
});

describe('the token-loss diagnostic on a real 401 (UF.2)', () => {
  it('records a 401 that expires a session, with the route', async () => {
    await session.signIn(user, 'token-abc');
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'sign in again' } }),
    );
    await expect(rpc.call('getUser', {})).rejects.toMatchObject({ status: 401 });
    expect((await session.current())?.expired).toBe(true);
    expect(await lastTokenLoss()).toMatchObject({ reason: '401', path: 'getUser' });
  });

  it('records nothing for a 401 to a token that is no longer the current one', async () => {
    await session.signIn(user, 'token-abc');
    let answer!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const pending = rpc.call('getUser', {}).catch((e: unknown) => e);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await session.signIn(user, 'token-fresh');
    answer(json(401, { error: { code: 'unauthenticated', message: 'sign in again' } }));
    await pending;
    expect(await session.token()).toBe('token-fresh');
    expect(await lastTokenLoss()).toBeNull();
  });

  it('records nothing on a 403', async () => {
    await session.signIn(user, 'token-abc');
    fetchMock.mockResolvedValueOnce(json(403, { error: { code: 'forbidden', message: 'no' } }));
    await expect(rpc.call('listUsers', {})).rejects.toMatchObject({ status: 403 });
    expect(await lastTokenLoss()).toBeNull();
  });
});

describe('the admin pages’ default rpc (manage page fix)', () => {
  it('bounds every call to ADMIN_CALL_TIMEOUT_MS', async () => {
    const transport = vi.spyOn(rpc, 'call').mockResolvedValue({ items: [], next_cursor: null });
    await adminRpc.call('listSeasons', {});
    expect(ADMIN_CALL_TIMEOUT_MS).toBe(15_000);
    expect(transport).toHaveBeenCalledWith('listSeasons', {}, { timeoutMs: 15_000 });
  });

  it('still validates the input before any request, as call() does', async () => {
    await expect(adminRpc.call('listEvents', { season_id: 'nope' })).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an unanswered request as unreachable, so a panel shows its connection state', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(() => new Promise(() => {}));
      const outcome = adminRpc.call('listSeasons', {}).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(ADMIN_CALL_TIMEOUT_MS + 1);
      expect(await outcome).toMatchObject({ code: 'timeout', status: 0, answered: false });
    } finally {
      vi.useRealTimers();
    }
  });
});
