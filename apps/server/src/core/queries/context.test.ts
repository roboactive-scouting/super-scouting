import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { issueToken } from '../../auth/token.js';
import { loadServerConfig } from '../../config.js';
import { rpcRoutes } from '../../routes/rpc.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';
import { getActiveContext } from './context.js';

const CALLERS: Caller[] = [
  { kind: 'user', userId: 'u-scouter', role: 'scouter' },
  { kind: 'user', userId: 'u-lead', role: 'lead' },
  { kind: 'user', userId: 'u-admin', role: 'admin' },
  { kind: 'service', label: 'mcp' },
];
const scouter = CALLERS[0] as Caller;

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
});

describe('getActiveContext (SPEC-FINAL 3.1, 4.1; task 1.17b)', () => {
  it('answers nulls on an empty install, where nothing has set the context yet', async () => {
    expect(await getActiveContext(scouter, {}, ctx)).toEqual({
      active_season_id: null,
      active_event_id: null,
    });
  });

  it('answers the ids the singleton holds', async () => {
    ctx.setActiveContext('se-1', 'ev-1'); // ev-1 is a known event in the fake
    expect(await getActiveContext(scouter, {}, ctx)).toEqual({
      active_season_id: 'se-1',
      active_event_id: 'ev-1',
    });
  });

  it('answers a season with no event yet (a brand-new season)', async () => {
    ctx.setActiveContext('se-1', null);
    expect(await getActiveContext(scouter, {}, ctx)).toEqual({
      active_season_id: 'se-1',
      active_event_id: null,
    });
  });

  it('answers active_event_id null when it names an event that does not exist', async () => {
    ctx.setActiveContext('se-1', 'ev-deleted');
    expect(await getActiveContext(scouter, {}, ctx)).toEqual({
      active_season_id: 'se-1',
      active_event_id: null,
    });
  });

  it('may be called by every role and by a service caller', async () => {
    ctx.setActiveContext('se-1', 'ev-1');
    for (const caller of CALLERS) {
      expect(await getActiveContext(caller, {}, ctx), caller.kind).toEqual({
        active_season_id: 'se-1',
        active_event_id: 'ev-1',
      });
    }
  });

  it('refuses an input field rather than silently ignoring it', async () => {
    await expect(
      getActiveContext(scouter, { event_id: 'ev-1' } as never, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('POST /api/getActiveContext (the real registry and the real bearer check)', () => {
  const config = loadServerConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'k',
    AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
    ALLOWED_ORIGIN: 'https://client.example.com',
  });
  const SEASON = '00000000-0000-4000-8000-000000000001';
  const EVENT = '00000000-0000-4000-8000-000000000002';
  const post = (headers: Record<string, string>) =>
    rpcRoutes(ctx, config).request('/api/getActiveContext', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: '{}',
    });
  const scouterToken = () =>
    issueToken({ id: 'u-scouter', username: 'scouter', role: 'scouter' }, config);

  it('answers a scouter with the context, through the output schema', async () => {
    ctx.knownEvents.add(EVENT);
    ctx.setActiveContext(SEASON, EVENT);
    const res = await post({ authorization: `Bearer ${await scouterToken()}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active_season_id: SEASON, active_event_id: EVENT });
  });

  it('answers nulls on an empty install — a 200, not an error', async () => {
    const res = await post({ authorization: `Bearer ${await scouterToken()}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active_season_id: null, active_event_id: null });
  });

  it('refuses a request with no bearer, like every authenticated route', async () => {
    const res = await post({});
    expect(res.status).toBe(401);
  });
});
