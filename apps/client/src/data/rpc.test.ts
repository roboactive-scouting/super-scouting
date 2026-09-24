import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/auth/session';
import { db } from './db';
import { call, rpc, RpcError } from './rpc';

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
  });

  it('reports a network failure as status 0, code offline', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(call('login', { username: 'a', password: 'b' })).rejects.toMatchObject({
      status: 0,
      code: 'offline',
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
