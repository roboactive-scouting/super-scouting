import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { issueToken, verifyToken } from './auth/token.js';
import { mountedRoutes } from './composition.js';
import { loadServerConfig } from './config.js';
import { loginLimiter } from './core/commands/login.js';
import type { StoredFullUser } from './core/context.js';
import { makeFakeContext, type FakeContext } from './test/fake-context.js';
import { tokenAt } from './test/tokens.js';

const config = loadServerConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
  ALLOWED_ORIGIN: 'https://client.example.com',
  NODE_ENV: 'development',
});

const app = (over: Partial<Parameters<typeof createApp>[0]> = {}) =>
  createApp({ config, pingDatabase: async () => undefined, ...over });

describe('GET /health', () => {
  it('returns ok when the database read succeeds', async () => {
    const res = await app().request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'ok', commit: null });
  });

  it('returns 503 and names the failure when the database read fails', async () => {
    const res = await app({
      pingDatabase: async () => {
        throw new Error('relation "app_settings" does not exist');
      },
    }).request('/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'error', database: 'error', commit: null });
  });

  it('reports the deployed commit when VERCEL_GIT_COMMIT_SHA is set, ok and 503 alike', async () => {
    const withCommit = { ...config, commitSha: 'deadbeef' };
    const ok = await app({ config: withCommit }).request('/health');
    expect(await ok.json()).toMatchObject({ commit: 'deadbeef' });

    const failing = await app({
      config: withCommit,
      pingDatabase: async () => {
        throw new Error('down');
      },
    }).request('/health');
    expect(await failing.json()).toMatchObject({ commit: 'deadbeef' });
  });
});

describe('CORS', () => {
  it('allows exactly the configured client origin', async () => {
    const res = await app().request('/health', {
      headers: { Origin: 'https://client.example.com' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://client.example.com');
  });

  it('does not allow another origin', async () => {
    const res = await app().request('/health', { headers: { Origin: 'https://evil.example.com' } });
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example.com');
  });
});

describe('mounted routes', () => {
  it('mounts everything passed in deps.routes', async () => {
    const extra = new Hono();
    extra.get('/extra', (c) => c.json({ ok: true }));
    const res = await app({ routes: [extra] }).request('/extra');
    expect(res.status).toBe(200);
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404, never HTML', async () => {
    const res = await app().request('/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

// The deployed wiring (composition.mountedRoutes) over the in-memory store: the same
// callerFor, syncRoutes and rpcRoutes the function serves, with no network.
const EVENT = '00000000-0000-4000-8000-0000000000e1';
const LEAD = { id: 'u-lead', username: 'lead', role: 'lead' as const };
const otherConfig = { ...config, authJwtSecret: 'a-different-secret-also-32-characters-long' };

let ctx: FakeContext;
beforeEach(() => {
  loginLimiter.reset();
  ctx = makeFakeContext();
  ctx.knownEvents.add(EVENT);
  ctx.users.set('u-off', { id: 'u-off', role: 'scouter', disabled_at: '2026-01-01T00:00:00.000Z' });
});

const wired = () => app({ routes: mountedRoutes(ctx, config) });
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const SYNC_ROUTES = [
  {
    name: 'GET /sync/pull',
    send: (headers: Record<string, string>) =>
      wired().request(`/sync/pull?event_id=${EVENT}`, { headers }),
  },
  {
    name: 'POST /sync/push',
    send: (headers: Record<string, string>) =>
      wired().request('/sync/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ device_id: '00000000-0000-4000-8000-0000000000d1', operations: [] }),
      }),
  },
];

describe.each(SYNC_ROUTES)('$name requires a bearer token (SPEC-FINAL 7.5)', ({ send }) => {
  it('answers 401 with no Authorization header', async () => {
    const res = await send({});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'unauthenticated', message: 'sign in again' },
    });
  });

  it('answers 401 for a token signed with a different secret', async () => {
    expect((await send(auth(await issueToken(LEAD, otherConfig)))).status).toBe(401);
  });

  it('answers 401 for an expired token', async () => {
    const token = await tokenAt(LEAD, config, { issuedDaysAgo: 31, expiresInDays: -1 });
    expect((await send(auth(token))).status).toBe(401);
  });

  it('answers 401 for a disabled user', async () => {
    const token = await issueToken({ id: 'u-off', username: 'off', role: 'scouter' }, config);
    expect((await send(auth(token))).status).toBe(401);
  });

  it('answers 200 for a valid token, with no refreshed token', async () => {
    const res = await send(auth(await issueToken(LEAD, config)));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-refreshed-token')).toBeNull();
  });

  it('answers 200 with an X-Refreshed-Token that verifies, for a token over seven days old', async () => {
    const token = await tokenAt(LEAD, config, { issuedDaysAgo: 8, expiresInDays: 22 });
    const res = await send(auth(token));
    expect(res.status).toBe(200);
    const fresh = res.headers.get('x-refreshed-token');
    expect(fresh).toBeTruthy();
    const claims = await verifyToken(fresh as string, config);
    expect(claims).toMatchObject({ sub: 'u-lead', role: 'lead' });
    expect(claims.iat).toBeGreaterThan(Math.floor(Date.now() / 1000) - 60);
  });

  it('exposes X-Refreshed-Token to the cross-origin client', async () => {
    const token = await tokenAt(LEAD, config, { issuedDaysAgo: 8, expiresInDays: 22 });
    const res = await send({ ...auth(token), origin: 'https://client.example.com' });
    expect(res.headers.get('access-control-expose-headers')).toContain('X-Refreshed-Token');
  });

  it('answers 500, not 401, when the user lookup fails', async () => {
    ctx.store.getUser = async () => {
      throw new Error('connection refused');
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await send(auth(await issueToken(LEAD, config)))).status).toBe(500);
    logged.mockRestore();
  });
});

describe('the sync routes answer every failure as JSON, never plain text', () => {
  it('answers a pull for an unknown event with the mapped status and the AppError body', async () => {
    const missing = '00000000-0000-4000-8000-0000000000e9';
    const res = await wired().request(`/sync/pull?event_id=${missing}`, {
      headers: auth(await issueToken(LEAD, config)),
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({
      error: {
        code: 'not-found',
        message: 'that event no longer exists',
        details: { event_id: missing },
      },
    });
  });

  it('answers a JSON 500 when the store throws, logging neither the token nor the body', async () => {
    ctx.store.getUser = async () => {
      throw new Error('connection refused');
    };
    const token = await issueToken(LEAD, config);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await wired().request(`/sync/pull?event_id=${EVENT}`, { headers: auth(token) });
    const printed = logged.mock.calls.flat().map(String).join(' ');
    logged.mockRestore();

    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({
      error: { code: 'invalid', message: 'that did not work' },
    });
    expect(printed).toContain('GET /sync/pull failed');
    expect(printed).not.toContain(token);
    expect(printed).not.toContain(EVENT);
  });
});

describe('POST /sync/push authenticates before it parses', () => {
  it('answers 401, not 400, to a malformed body with no token', async () => {
    const res = await wired().request('/sync/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"not":"a push"}',
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/login and /api/refreshToken over HTTP (SPEC-FINAL 7.5)', () => {
  const ALICE_ID = '00000000-0000-4000-8000-0000000000a1';
  beforeEach(async () => {
    const alice: StoredFullUser = {
      id: ALICE_ID,
      username: 'alice',
      full_name: 'Alice',
      role: 'lead',
      password_hash: await hashPassword('correct horse'),
      must_change_password: false,
      disabled_at: null,
      created_at: '2026-11-01T00:00:00.000Z',
    };
    ctx.usersByName.set('alice', alice);
    ctx.usersById.set(ALICE_ID, alice);
  });

  const post = (path: string, body: unknown) =>
    wired().request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('answers 200 with a token and the user for the right password, needing no bearer', async () => {
    const res = await post('/api/login', { username: 'alice', password: 'correct horse' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: Record<string, unknown> };
    expect(body.user).toEqual({
      id: ALICE_ID,
      username: 'alice',
      full_name: 'Alice',
      role: 'lead',
      must_change_password: false,
    });
    expect((await verifyToken(body.token, config)).sub).toBe(ALICE_ID);
  });

  it('answers 401 for the wrong password', async () => {
    const res = await post('/api/login', { username: 'alice', password: 'nope' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'unauthenticated', message: 'that username and password do not match' },
    });
  });

  it('answers 429 once the username is rate-limited', async () => {
    for (let i = 0; i < 10; i += 1) await post('/api/login', { username: 'alice', password: 'x' });
    const res = await post('/api/login', { username: 'alice', password: 'correct horse' });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: 'rate-limited' } });
  });

  it('answers 400 for a body that is not a login', async () => {
    expect((await post('/api/login', { username: 'alice' })).status).toBe(400);
  });

  it('refreshes with no bearer, from the token in the body, and refuses a bad one', async () => {
    const login = (await (
      await post('/api/login', { username: 'alice', password: 'correct horse' })
    ).json()) as { token: string };
    const res = await post('/api/refreshToken', { token: login.token });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ user: { id: ALICE_ID } });
    expect((await post('/api/refreshToken', { token: 'nonsense' })).status).toBe(401);
  });
});

describe('POST /api/createUser over HTTP (SPEC-FINAL 7.2, 7.3)', () => {
  const ADMIN = { id: 'u-admin', username: 'admin', role: 'admin' as const };
  const body = {
    username: 'Dana',
    full_name: 'Dana Levi',
    role: 'scouter',
    password: 'firstpass1',
  };
  const create = (headers: Record<string, string>) =>
    wired().request('/api/createUser', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  it('answers 403 forbidden to a lead with a valid bearer, and creates nothing', async () => {
    const res = await create(auth(await issueToken(LEAD, config)));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'forbidden' } });
    expect(ctx.usersByName.get('dana')).toBeUndefined();
  });

  it('answers 401 with no bearer', async () => {
    const res = await create({});
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
    expect(ctx.usersByName.get('dana')).toBeUndefined();
  });

  it('answers 200 to an admin, with the new user and no password_hash', async () => {
    const res = await create(auth(await issueToken(ADMIN, config)));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('password_hash');
    expect(text).not.toContain('$2');
    expect(JSON.parse(text)).toMatchObject({ username: 'dana', full_name: 'Dana Levi' });
    expect(ctx.usersByName.get('dana')).toBeDefined();
  });

  it('answers 409 conflict to an admin for a name that is taken in another case', async () => {
    const token = await issueToken(ADMIN, config);
    expect((await create(auth(token))).status).toBe(200);
    const res = await wired().request('/api/createUser', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(token) },
      body: JSON.stringify({ ...body, username: 'DANA' }),
    });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/changeOwnPassword over HTTP', () => {
  it('answers 400 invalid, never 401, to a valid bearer with a wrong current password', async () => {
    const scouter = ctx.usersById.get('u-scouter') as StoredFullUser;
    ctx.usersById.set('u-scouter', { ...scouter, password_hash: await hashPassword('rightpass1') });
    const token = await issueToken(
      { id: 'u-scouter', username: 'scouter', role: 'scouter' },
      config,
    );
    const res = await wired().request('/api/changeOwnPassword', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(token) },
      body: JSON.stringify({ current_password: 'wrongpass1', new_password: 'evennewer1' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'invalid' } });
  });
});
