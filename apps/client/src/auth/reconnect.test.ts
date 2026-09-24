import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { RpcError } from '@/data/rpc';
import { offlineLogin, OfflineLoginError } from './offlineLogin';
import { pendingCredential } from './pendingCredential';
import {
  exchangePendingCredential,
  installReconnect,
  reconnectPrompt,
  signInAgain,
} from './reconnect';
import { session } from './session';

vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

const ALICE_ID = '00000000-0000-4000-8000-00000000a11c';
const alice = {
  id: ALICE_ID,
  username: 'alice',
  full_name: 'Alice',
  role: 'scouter' as const,
  must_change_password: false,
};
const hash = bcrypt.hashSync('correct horse', 10);

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
  reconnectPrompt.reset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  await db.rows.put({
    entity: 'users',
    id: ALICE_ID,
    username: 'alice',
    full_name: 'Alice',
    role: 'scouter',
    password_hash: hash,
    disabled_at: null,
  });
  await offlineLogin('alice', 'correct horse');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the reconnect exchange (SPEC-FINAL 7.5)', () => {
  it('exchanges the in-memory password for a real token, then forgets it', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { token: 'tok-1', user: alice }));
    expect(await exchangePendingCredential()).toBe('exchanged');
    const current = await session.current();
    expect(current?.token).toBe('tok-1');
    expect(current?.offline).toBe(false);
    expect(pendingCredential.get()).toBeNull();
    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      username: string;
      password: string;
    };
    expect(sent).toEqual({ username: 'alice', password: 'correct horse' });
  });

  it('takes must_change_password from the login response once it has a token', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { token: 'tok-1', user: { ...alice, must_change_password: true } }),
    );
    await exchangePendingCredential();
    expect((await session.current())?.user.must_change_password).toBe(true);
  });

  it('keeps the password for the next attempt when the server cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await exchangePendingCredential()).toBe('unreachable');
    expect(pendingCredential.get()?.password).toBe('correct horse');
    expect((await session.current())?.token).toBeNull();
  });

  it('keeps the password on a captive portal page', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>portal</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    expect(await exchangePendingCredential()).toBe('unreachable');
    expect(pendingCredential.get()).not.toBeNull();
  });

  it('keeps the password on a 429 and tries again later', async () => {
    fetchMock.mockResolvedValueOnce(json(429, { error: { code: 'rate-limited', message: 'x' } }));
    expect(await exchangePendingCredential()).toBe('unreachable');
    expect(pendingCredential.get()).not.toBeNull();
  });

  it('forgets the password on a definitive 401 (it was changed since) and keeps the session', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'no match' } }),
    );
    expect(await exchangePendingCredential()).toBe('refused');
    expect(pendingCredential.get()).toBeNull();
    const current = await session.current();
    expect(current?.user.id).toBe(ALICE_ID);
    expect(current?.token).toBeNull();
  });

  it('forgets the password on a 403 (disabled since)', async () => {
    fetchMock.mockResolvedValueOnce(json(403, { error: { code: 'forbidden', message: 'x' } }));
    expect(await exchangePendingCredential()).toBe('disabled');
    expect(pendingCredential.get()).toBeNull();
  });

  it('reports no-credential when the app was closed since the offline sign-in', async () => {
    pendingCredential.clear();
    expect(await exchangePendingCredential()).toBe('no-credential');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when the session already holds a token', async () => {
    await session.signIn(alice, 'tok-live');
    expect(await exchangePendingCredential()).toBe('not-needed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends one login however many triggers fire at once', async () => {
    fetchMock.mockResolvedValue(json(200, { token: 'tok-1', user: alice }));
    const outcomes = await Promise.all([
      exchangePendingCredential(),
      exchangePendingCredential(),
      exchangePendingCredential(),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual(['exchanged', 'exchanged', 'exchanged']);
  });

  it('never overwrites a session that changed hands while the login was in flight', async () => {
    let answer!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const exchange = exchangePendingCredential();
    const bob = { ...alice, id: '00000000-0000-4000-8000-000000000b0b', username: 'bob' };
    await session.signIn(bob, 'tok-bob');
    answer(json(200, { token: 'tok-alice', user: alice }));
    expect(await exchange).toBe('not-needed');
    expect((await session.current())?.user.id).toBe(bob.id);
    expect(await session.token()).toBe('tok-bob');
  });

  it('exchanges on a session expiry too, once installed', async () => {
    const uninstall = installReconnect();
    try {
      // A token-holding session whose token dies while a password is still held.
      await session.signIn(alice, 'tok-old');
      pendingCredential.set({ username: 'alice', password: 'correct horse' });
      fetchMock.mockResolvedValueOnce(json(200, { token: 'tok-new', user: alice }));
      await session.expire('tok-old');
      await vi.waitFor(async () => expect(await session.token()).toBe('tok-new'));
      expect((await session.current())?.expired).toBe(false);
    } finally {
      uninstall();
    }
  });
});

describe('the one-field password prompt', () => {
  it('shows once per app session', () => {
    expect(reconnectPrompt.claim()).toBe(true);
    expect(reconnectPrompt.claim()).toBe(false);
  });

  it('signs in online with the signed-in user and the typed password', async () => {
    pendingCredential.clear();
    fetchMock.mockResolvedValueOnce(json(200, { token: 'tok-1', user: alice }));
    expect(await signInAgain('correct horse')).toBe('exchanged');
    expect(await session.token()).toBe('tok-1');
    expect(pendingCredential.get()).toBeNull();
  });

  it('refuses a wrong password with the server answer, never falling back', async () => {
    pendingCredential.clear();
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'no match' } }),
    );
    await expect(signInAgain('correct horse')).rejects.toBeInstanceOf(RpcError);
    expect(pendingCredential.get()).toBeNull();
  });

  it('holds a password the cached hash accepts when the server is still out of reach', async () => {
    pendingCredential.clear();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await signInAgain('correct horse')).toBe('held');
    expect(pendingCredential.get()?.password).toBe('correct horse');
    expect((await session.current())?.user.id).toBe(ALICE_ID);
  });

  it('refuses a wrong password against the cached hash when out of reach', async () => {
    pendingCredential.clear();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(signInAgain('wrong')).rejects.toBeInstanceOf(OfflineLoginError);
    expect(pendingCredential.get()).toBeNull();
  });
});
