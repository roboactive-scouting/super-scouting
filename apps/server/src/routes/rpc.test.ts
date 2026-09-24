import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError, type Caller } from '@frc/shared';
import { loadServerConfig } from '../config.js';
import { issueToken, verifyToken } from '../auth/token.js';
import { tokenAt } from '../test/tokens.js';
import { makeFakeContext, type FakeContext } from '../test/fake-context.js';
import { REGISTRY, type RegistryEntry } from './registry.js';
import { rpcRoutes } from './rpc.js';

describe('the use-case registry (SPEC-FINAL 16.4)', () => {
  it('gives every entry an input schema, an output schema and a description', () => {
    for (const [name, entry] of Object.entries(REGISTRY)) {
      expect(entry.input, name).toBeInstanceOf(z.ZodType);
      expect(entry.output, name).toBeInstanceOf(z.ZodType);
      expect(entry.description.length, name).toBeGreaterThan(20);
      expect(['query', 'command'], name).toContain(entry.kind);
    }
  });

  it('rejects a service caller from every command, without exception', async () => {
    const service = { kind: 'service', label: 'mcp' } as const;
    for (const [name, entry] of Object.entries(REGISTRY)) {
      if (entry.kind !== 'command') continue;
      if (entry.unauthenticated) continue; // login and refreshToken produce a caller
      await expect(
        Promise.resolve(entry.handler(service, {} as never, {} as never, {} as never)),
        name,
      ).rejects.toMatchObject({ code: 'forbidden' });
    }
  });

  it('marks exactly login and refreshToken as unauthenticated', () => {
    const open = Object.entries(REGISTRY)
      .filter(([, e]) => e.unauthenticated)
      .map(([n]) => n);
    expect(open.sort()).toEqual(['login', 'refreshToken']);
  });

  it('holds exactly the entries registered so far', () => {
    expect(Object.keys(REGISTRY).sort()).toEqual(['login', 'refreshToken']);
  });
});

// A test-only authenticated entry, mounted through the real rpcRoutes and the real
// callerFor: with only login and refreshToken registered, nothing else can prove the
// bearer check on an RPC route.
const config = loadServerConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
  ALLOWED_ORIGIN: 'https://client.example.com',
});
const otherConfig = { ...config, authJwtSecret: 'a-different-secret-also-32-characters-long' };

let seen: Caller[] = [];
const whoami: RegistryEntry = {
  kind: 'query',
  description: 'Test only: echoes the caller the HTTP edge built from the bearer token.',
  input: z.object({ echo: z.string() }),
  output: z.object({ userId: z.string(), role: z.string(), echo: z.string() }),
  handler: async (caller, input: { echo: string }) => {
    seen.push(caller);
    if (caller.kind !== 'user') throw new AppError('forbidden', 'users only');
    return { userId: caller.userId, role: caller.role, echo: input.echo };
  },
};

let ctx: FakeContext;
beforeEach(() => {
  seen = [];
  ctx = makeFakeContext();
  ctx.users.set('u-off', { id: 'u-off', role: 'scouter', disabled_at: '2026-01-01T00:00:00.000Z' });
});

const call = (headers: Record<string, string>, body: unknown = { echo: 'hi' }) =>
  rpcRoutes(ctx, config, { whoami }).request('/api/whoami', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const lead = { id: 'u-lead', username: 'lead', role: 'lead' as const };

describe('an authenticated RPC route', () => {
  it('answers 200 with the caller built from a valid bearer', async () => {
    const res = await call({ authorization: `Bearer ${await issueToken(lead, config)}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'u-lead', role: 'lead', echo: 'hi' });
    expect(res.headers.get('x-refreshed-token')).toBeNull();
  });

  it('answers 401 with no Authorization header, and never reaches the handler', async () => {
    const res = await call({});
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
    expect(seen).toEqual([]);
  });

  it('answers 401 for a token signed with a different secret', async () => {
    const res = await call({ authorization: `Bearer ${await issueToken(lead, otherConfig)}` });
    expect(res.status).toBe(401);
    expect(seen).toEqual([]);
  });

  it('answers 401 for an expired token', async () => {
    const token = await tokenAt(lead, config, { issuedDaysAgo: 31, expiresInDays: -1 });
    const res = await call({ authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
    expect(seen).toEqual([]);
  });

  it('answers 401 for a disabled user', async () => {
    const token = await issueToken({ id: 'u-off', username: 'off', role: 'scouter' }, config);
    expect((await call({ authorization: `Bearer ${token}` })).status).toBe(401);
  });

  it('authenticates before it validates: a bad body with no token is 401, not 400', async () => {
    expect((await call({}, { nope: 1 })).status).toBe(401);
    const token = await issueToken(lead, config);
    const res = await call({ authorization: `Bearer ${token}` }, { nope: 1 });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'invalid' } });
  });

  it('sets X-Refreshed-Token, which verifies, on a bearer older than seven days', async () => {
    const token = await tokenAt(lead, config, { issuedDaysAgo: 8, expiresInDays: 22 });
    const res = await call({ authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    const fresh = res.headers.get('x-refreshed-token');
    expect(await verifyToken(fresh as string, config)).toMatchObject({ sub: 'u-lead' });
  });

  it('answers 500, not 401, when the user lookup fails', async () => {
    ctx.store.getUser = async () => {
      throw new Error('connection refused');
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await call({ authorization: `Bearer ${await issueToken(lead, config)}` });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: 'invalid', message: 'that did not work' } });
    expect(seen).toEqual([]);
    logged.mockRestore();
  });
});
