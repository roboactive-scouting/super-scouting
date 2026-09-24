import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { session } from './session';
import {
  isDefinitive,
  LOGIN_TIMEOUT_MS,
  NO_CACHED_ACCOUNTS_LINE,
  offlineLogin,
  OfflineLoginError,
  signInWithFallback,
} from './offlineLogin';
import { pendingCredential } from './pendingCredential';
import { RpcError } from '@/data/rpc';

vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

const ALICE_ID = '00000000-0000-4000-8000-00000000a11c';
const aliceHash = bcrypt.hashSync('correct horse', 10);
const bobHash = bcrypt.hashSync('other pass', 10);

const aliceOnline = {
  id: ALICE_ID,
  username: 'alice',
  full_name: 'Alice',
  role: 'lead' as const,
  must_change_password: false,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  await db.delete();
  await db.open();
  pendingCredential.clear();
  localStorage.clear();
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  await db.rows.bulkPut([
    {
      entity: 'users',
      id: ALICE_ID,
      username: 'alice',
      full_name: 'Alice',
      role: 'lead',
      must_change_password: true,
      password_hash: aliceHash,
      disabled_at: null,
    },
    {
      entity: 'users',
      id: 'u-2',
      username: 'bob',
      full_name: 'Bob',
      role: 'scouter',
      must_change_password: false,
      password_hash: bobHash,
      disabled_at: '2026-01-01T00:00:00.000Z',
    },
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Every Dexie table, localStorage and sessionStorage, as one string. */
async function everyStore(): Promise<string> {
  const tables: Record<string, unknown> = {};
  for (const table of db.tables) tables[table.name] = await table.toArray();
  const local: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)!;
    local[key] = localStorage.getItem(key);
  }
  const perTab: Record<string, string | null> = {};
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i)!;
    perTab[key] = sessionStorage.getItem(key);
  }
  return JSON.stringify({ tables, local, perTab });
}

describe('offline login (SPEC-FINAL 7.5)', () => {
  it('verifies the password against the cached hash and signs in with no token', async () => {
    await offlineLogin('alice', 'correct horse');
    const current = await session.current();
    expect(current?.user.id).toBe(ALICE_ID);
    expect(current?.token).toBeNull();
    expect(current?.offline).toBe(true);
  });

  it('takes the role and full name from the cached row', async () => {
    const user = await offlineLogin('alice', 'correct horse');
    expect(user).toMatchObject({ role: 'lead', full_name: 'Alice', username: 'alice' });
  });

  it('does not let must_change_password block offline use', async () => {
    const user = await offlineLogin('alice', 'correct horse');
    expect(user.must_change_password).toBe(false);
  });

  it('refuses a wrong password', async () => {
    await expect(offlineLogin('alice', 'nope')).rejects.toThrow(
      'That username and password do not match.',
    );
    expect(await session.current()).toBeNull();
    expect(pendingCredential.get()).toBeNull();
  });

  it('gives an unknown username the same message as a wrong password', async () => {
    await expect(offlineLogin('mallory', 'correct horse')).rejects.toThrow(
      'That username and password do not match.',
    );
    expect(await session.current()).toBeNull();
  });

  it('refuses a disabled user, even with the right password', async () => {
    await expect(offlineLogin('bob', 'other pass')).rejects.toThrow(/disabled/i);
    expect(await session.current()).toBeNull();
    expect(pendingCredential.get()).toBeNull();
  });

  it('says so plainly on a device that has never loaded the accounts', async () => {
    await db.rows.clear();
    await expect(offlineLogin('alice', 'correct horse')).rejects.toThrow(NO_CACHED_ACCOUNTS_LINE);
    expect(NO_CACHED_ACCOUNTS_LINE).toBe(
      "This device has not loaded the team's accounts yet. Connect to the internet once to sign in.",
    );
  });

  it('never puts the password in an error message', async () => {
    const error = await offlineLogin('alice', 'a-very-secret-guess').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OfflineLoginError);
    expect(String((error as Error).message)).not.toContain('a-very-secret-guess');
    expect(JSON.stringify(error)).not.toContain('a-very-secret-guess');
  });

  it('holds the password in memory only, never in any storage', async () => {
    await offlineLogin('alice', 'correct horse');
    expect(pendingCredential.get()).toEqual({ username: 'alice', password: 'correct horse' });
    const dump = await everyStore();
    expect(dump).toContain(ALICE_ID); // the dump really does cover the session store
    expect(dump).not.toContain('correct horse');
  });

  it('forgets the password once it has been exchanged for a token', async () => {
    await offlineLogin('alice', 'correct horse');
    pendingCredential.clear();
    expect(pendingCredential.get()).toBeNull();
  });

  it('matches the username trimmed and case-insensitively, like the server', async () => {
    await offlineLogin('  ALICE ', 'correct horse');
    expect((await session.current())?.user.id).toBe(ALICE_ID);
    expect(pendingCredential.get()?.username).toBe('alice');
  });

  it('uses the async compare, never compareSync (a cost-10 hash blocks a phone)', async () => {
    const sync = vi.spyOn(bcrypt, 'compareSync');
    await offlineLogin('alice', 'correct horse');
    expect(sync).not.toHaveBeenCalled();
  });
});

describe('which login outcomes fall back to the cached hash', () => {
  it('treats 400, 401, 403 and 429 from our server as final', () => {
    for (const status of [400, 401, 403, 429]) {
      expect(isDefinitive(new RpcError('x', 'y', status, true))).toBe(true);
    }
  });

  it('treats no connection, 5xx and a response that is not ours as not final', () => {
    expect(isDefinitive(new RpcError('offline', 'y', 0))).toBe(false);
    expect(isDefinitive(new RpcError('timeout', 'y', 0))).toBe(false);
    expect(isDefinitive(new RpcError('internal', 'y', 500, true))).toBe(false);
    expect(isDefinitive(new RpcError('invalid', 'y', 401, false))).toBe(false);
    expect(isDefinitive(new Error('boom'))).toBe(false);
  });

  it('gives up on a login that hangs after 8 seconds', async () => {
    expect(LOGIN_TIMEOUT_MS).toBe(8_000);
    const timers = vi.spyOn(globalThis, 'setTimeout');
    fetchMock.mockResolvedValueOnce(json(200, { token: 'tok-1', user: aliceOnline }));
    await signInWithFallback('alice', 'correct horse');
    expect(timers.mock.calls.some(([, ms]) => ms === LOGIN_TIMEOUT_MS)).toBe(true);
  });

  it('signs in online when the server answers, holding no password', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { token: 'tok-1', user: aliceOnline }));
    pendingCredential.set({ username: 'someone', password: 'stale' });
    const result = await signInWithFallback('alice', 'correct horse');
    expect(result.offline).toBe(false);
    expect(await session.token()).toBe('tok-1');
    expect(pendingCredential.get()).toBeNull();
  });

  it.each([
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a 5xx', () => Promise.resolve(json(503, { error: { code: 'internal', message: 'x' } }))],
    [
      'a captive portal answering 200 HTML',
      () =>
        Promise.resolve(
          new Response('<html>Sign in to Venue WiFi</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
        ),
    ],
    [
      'a portal answering 401 HTML',
      () =>
        Promise.resolve(
          new Response('<html>no</html>', {
            status: 401,
            headers: { 'content-type': 'text/html' },
          }),
        ),
    ],
  ])('falls back to the cached hash on %s', async (_name, answer) => {
    fetchMock.mockImplementationOnce(answer);
    const result = await signInWithFallback('alice', 'correct horse');
    expect(result.offline).toBe(true);
    const current = await session.current();
    expect(current?.user.id).toBe(ALICE_ID);
    expect(current?.token).toBeNull();
    expect(pendingCredential.get()?.password).toBe('correct horse');
  });

  it('falls back when the login hangs past its deadline, and aborts the request', async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {}); // never answers
    });
    const result = await signInWithFallback('alice', 'correct horse', { timeoutMs: 30 });
    expect(result.offline).toBe(true);
    expect(signal?.aborted).toBe(true);
  });

  it.each([
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    [429, 'rate-limited'],
    [400, 'invalid'],
  ])(
    'never falls back on a definitive %i, even when the cached hash matches',
    async (status, code) => {
      fetchMock.mockResolvedValueOnce(json(status, { error: { code, message: 'no' } }));
      const error = await signInWithFallback('alice', 'correct horse').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RpcError);
      expect((error as RpcError).status).toBe(status);
      expect(await session.current()).toBeNull();
      expect(pendingCredential.get()).toBeNull();
    },
  );

  it('says the server is in trouble, not "connect", on our 5xx with nothing cached', async () => {
    await db.rows.clear();
    fetchMock.mockResolvedValueOnce(json(503, { error: { code: 'internal', message: 'x' } }));
    const error = await signInWithFallback('alice', 'correct horse').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RpcError);
    expect((error as RpcError).status).toBe(503);
  });

  it('refuses a wrong password on the fallback path too', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(signInWithFallback('alice', 'wrong')).rejects.toBeInstanceOf(OfflineLoginError);
    expect(await session.current()).toBeNull();
  });

  it('refuses a disabled user on the fallback path too', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(signInWithFallback('bob', 'other pass')).rejects.toThrow(/disabled/i);
    expect(await session.current()).toBeNull();
  });
});
