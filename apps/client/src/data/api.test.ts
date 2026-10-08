import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PULL_ENTITY_KEYS, type PullResponse } from '@frc/shared';
import { pendingCredential } from '@/auth/pendingCredential';
import { session } from '@/auth/session';
import { lastTokenLoss } from '@/auth/tokenLoss';
import { ApiError, apiClient } from './api';
import { db } from './db';
import { enqueue, pending } from './outbox';
import { syncNow } from './sync';

// The reconnect exchange (UF.2) logs in through rpc.ts, which reads the config itself.
vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

const config = { apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' };
const user = {
  id: 'u-1',
  username: 'alice',
  full_name: 'Alice',
  role: 'scouter' as const,
  must_change_password: false,
};
const DEVICE = '00000000-0000-4000-8000-0000000000dd';

const emptyEntities = Object.fromEntries(
  PULL_ENTITY_KEYS.map((k) => [k, []]),
) as unknown as PullResponse['entities'];

const op = (rowId: string, seq: number) => ({
  op_id: `op-${rowId}`,
  entity: 'scouting_entry' as const,
  row_id: rowId,
  action: 'create' as const,
  base_version: null,
  payload: { event_id: 'ev-1', data: {} },
  author_user_id: 'u-1',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq,
});

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

function sentHeaders(call = 0): Headers {
  const init = fetchMock.mock.calls[call]?.[1];
  return new Headers(init?.headers);
}

const okPull = () =>
  json(200, { watermark: 'w', next_cursor: null, complete: true, entities: emptyEntities });

describe('the sync API client and the bearer token (SPEC-FINAL 7.5)', () => {
  it('sends Authorization: Bearer <token> when a session exists', async () => {
    await session.signIn(user, 'token-abc');
    fetchMock.mockResolvedValueOnce(okPull());
    await apiClient(config).pull({ event_id: 'ev-1' });
    expect(sentHeaders().get('authorization')).toBe('Bearer token-abc');
  });

  it('sends no Authorization header at all when there is no session', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'x' } }),
    );
    await expect(apiClient(config).pull({ event_id: 'ev-1' })).rejects.toBeInstanceOf(ApiError);
    expect(sentHeaders().has('authorization')).toBe(false);
  });

  it('stores an X-Refreshed-Token it receives', async () => {
    await session.signIn(user, 'token-abc');
    const replace = vi.spyOn(session, 'replaceToken');
    fetchMock.mockResolvedValueOnce(
      json(
        200,
        { watermark: 'w', next_cursor: null, complete: true, entities: emptyEntities },
        { 'X-Refreshed-Token': 'token-new' },
      ),
    );
    await apiClient(config).pull({ event_id: 'ev-1' });
    expect(replace).toHaveBeenCalledWith('token-new', 'token-abc');
    expect(await session.token()).toBe('token-new');
  });

  it('expires the session on a 401 and still throws', async () => {
    await session.signIn(user, 'token-abc');
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'sign in again' } }),
    );
    await expect(apiClient(config).pull({ event_id: 'ev-1' })).rejects.toMatchObject({
      status: 401,
      code: 'unauthenticated',
    });
    const now = await session.current();
    expect(now?.expired).toBe(true);
    expect(now?.token).toBeNull();
    expect(now?.user.id).toBe('u-1');
    expect(await lastTokenLoss()).toMatchObject({ reason: '401', path: '/sync/pull' });
  });

  it('keeps the session and the token on a 403 — never signs out', async () => {
    await session.signIn(user, 'token-abc');
    const expire = vi.spyOn(session, 'expire');
    fetchMock.mockResolvedValueOnce(json(403, { error: { code: 'forbidden', message: 'no' } }));
    await expect(apiClient(config).pull({ event_id: 'ev-1' })).rejects.toMatchObject({
      status: 403,
    });
    expect(expire).not.toHaveBeenCalled();
    expect(await session.token()).toBe('token-abc');
    expect((await session.current())?.expired).toBe(false);
  });

  it('keeps the token on a 500', async () => {
    await session.signIn(user, 'token-abc');
    fetchMock.mockResolvedValueOnce(
      json(500, { error: { code: 'invalid', message: 'that did not work' } }),
    );
    await expect(apiClient(config).pull({ event_id: 'ev-1' })).rejects.toMatchObject({
      status: 500,
    });
    expect(await session.token()).toBe('token-abc');
  });
});

describe('an offline sign-in on an online device, on the sync routes (UF.2)', () => {
  const offlineUser = { ...user, id: '00000000-0000-4000-8000-0000000000a1' };
  const unauthenticated = () =>
    json(401, { error: { code: 'unauthenticated', message: 'sign in again' } });
  const urls = () => fetchMock.mock.calls.map(([url]) => String(url));
  let online = true;

  beforeEach(async () => {
    online = true;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    await session.signIn(offlineUser, null, true);
    pendingCredential.set({ username: 'alice', password: 'pw' });
  });

  afterEach(() => pendingCredential.clear());

  it('gets a token before the request, and sends it', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { token: 'tok-new', user: offlineUser }))
      .mockResolvedValueOnce(okPull());
    await apiClient(config).pull({ event_id: 'ev-1' });
    expect(urls()[0]).toBe('https://api.test/api/login');
    expect(sentHeaders(1).get('authorization')).toBe('Bearer tok-new');
  });

  it('with no password held: sends the request; our server’s 401 expires the session', async () => {
    pendingCredential.clear();
    fetchMock.mockResolvedValueOnce(unauthenticated());
    await expect(
      apiClient(config).push({ device_id: DEVICE, operations: [] }),
    ).rejects.toMatchObject({ status: 401 });
    expect(urls()).toEqual(['https://api.test/sync/push']);
    expect(await session.current()).toMatchObject({ token: null, expired: true });
    expect(await lastTokenLoss()).toMatchObject({ reason: '401', path: '/sync/push' });
  });

  it('a 401 that is not our server’s (a portal) never expires the offline session', async () => {
    pendingCredential.clear();
    fetchMock.mockResolvedValueOnce(
      new Response('<html>Sign in to Venue WiFi</html>', {
        status: 401,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(apiClient(config).pull({ event_id: 'ev-1' })).rejects.toMatchObject({
      status: 401,
    });
    expect(await session.current()).toMatchObject({ offline: true, expired: false });
    expect(await lastTokenLoss()).toBeNull();
  });

  it('a 401 sent with no bearer tries the exchange again, and expires when it is refused', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(unauthenticated())
      .mockResolvedValueOnce(unauthenticated());
    await expect(apiClient(config).pull({ event_id: 'ev-1' })).rejects.toMatchObject({
      status: 401,
    });
    expect(urls()).toEqual([
      'https://api.test/api/login',
      'https://api.test/sync/pull?event_id=ev-1',
      'https://api.test/api/login',
    ]);
    expect((await session.current())?.expired).toBe(true);
    expect(await lastTokenLoss()).toMatchObject({ reason: '401', path: '/sync/pull' });
  });

  it('a 403 sent with no bearer never expires anything', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(403, { error: { code: 'forbidden', message: 'no' } }));
    await expect(apiClient(config).pull({ event_id: 'ev-1' })).rejects.toMatchObject({
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await session.current()).toMatchObject({ offline: true, expired: false });
  });

  it('offline: makes no exchange and never expires the session', async () => {
    online = false;
    pendingCredential.clear();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiClient(config).pull({ event_id: 'ev-1' })).rejects.toThrow();
    expect(urls()).toEqual(['https://api.test/sync/pull?event_id=ev-1']);
    expect(await session.current()).toMatchObject({ offline: true, expired: false });
  });
});

describe('the sync request deadline (phase 1C follow-up)', () => {
  it('aborts a fetch that never settles and rejects with a plain Error, not an ApiError', async () => {
    await session.signIn(user, 'token-abc');
    const expire = vi.spyOn(session, 'expire');
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });

    const pull = apiClient(config, session, 20).pull({ event_id: 'ev-1' });

    await expect(pull).rejects.toThrow('the server did not answer in time');
    await expect(pull).rejects.not.toBeInstanceOf(ApiError);
    expect(signal?.aborted).toBe(true);
    // A deadline is not a 401: the session must stay exactly as it was.
    expect(expire).not.toHaveBeenCalled();
    expect(await session.token()).toBe('token-abc');
  });

  it('carries a signal on an ordinary call too, from the default deadline', async () => {
    fetchMock.mockResolvedValueOnce(okPull());
    await apiClient(config).pull({ event_id: 'ev-1' });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('a 401 in the middle of a sync never loses an operation (SPEC-FINAL 9.4)', () => {
  it('on the first push: expires the session and leaves every op queued, unchanged', async () => {
    await session.signIn(user, 'token-abc');
    for (let i = 1; i <= 3; i += 1) await enqueue(op(`row-${i}`, i));
    const before = (await pending(500)).map((o) => o.op_id);
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'sign in again' } }),
    );

    const outcome = await syncNow({ api: apiClient(config), eventId: 'ev-1', deviceId: DEVICE });

    expect(outcome.status).toBe('unauthenticated');
    expect((await session.current())?.expired).toBe(true);
    const after = (await pending(500)).map((o) => o.op_id);
    expect(after).toHaveLength(3);
    expect(after).toEqual(before);
  });

  it('after one acked batch: keeps that ack and keeps the rest queued', async () => {
    await session.signIn(user, 'token-abc');
    // 201 ops: one full batch of 200, then one more.
    for (let i = 1; i <= 201; i += 1) await enqueue(op(`row-${i}`, i));
    const firstBatch = (await pending(200)).map((o) => o.op_id);
    const rest = (await pending(500)).map((o) => o.op_id).slice(200);

    fetchMock
      .mockResolvedValueOnce(
        json(200, {
          results: firstBatch.map((id) => ({
            op_id: id,
            status: 'applied',
            row_id: id.slice(3),
            new_version: 1,
          })),
        }),
      )
      .mockResolvedValueOnce(
        json(401, { error: { code: 'unauthenticated', message: 'sign in again' } }),
      );

    const outcome = await syncNow({ api: apiClient(config), eventId: 'ev-1', deviceId: DEVICE });

    expect(outcome.status).toBe('unauthenticated');
    expect((await pending(500)).map((o) => o.op_id)).toEqual(rest);
    expect(rest).toHaveLength(1);
    expect((await db.syncState.get('row-1'))?.sync_state).toBe('acked');
    expect((await db.syncState.get('row-201'))?.sync_state).toBe('pending');
  });

  it('resumes with the outbox intact after signing back in', async () => {
    await session.signIn(user, 'token-abc');
    await enqueue(op('row-1', 1));
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'sign in again' } }),
    );
    await syncNow({ api: apiClient(config), eventId: 'ev-1', deviceId: DEVICE });

    // A different user signs in on the shared device; the op keeps its own author.
    await session.signIn({ ...user, id: 'u-2' }, 'token-bob');
    fetchMock
      .mockResolvedValueOnce(
        json(200, {
          results: [{ op_id: 'op-row-1', status: 'applied', row_id: 'row-1', new_version: 1 }],
        }),
      )
      .mockResolvedValueOnce(okPull());
    const outcome = await syncNow({ api: apiClient(config), eventId: 'ev-1', deviceId: DEVICE });

    expect(outcome.status).toBe('ok');
    expect(sentHeaders(1).get('authorization')).toBe('Bearer token-bob');
    const pushed = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      operations: { author_user_id: string }[];
    };
    expect(pushed.operations[0]?.author_user_id).toBe('u-1');
    expect(await pending(10)).toHaveLength(0);
  });
});
