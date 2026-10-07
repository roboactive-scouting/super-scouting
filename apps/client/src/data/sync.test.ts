import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullResponse, PushRequest, PushResponse } from '@frc/shared';
import { PULL_ENTITY_KEYS } from '@frc/shared';
import { session } from '@/auth/session';
import { apiClient } from './api';
import { onChanged } from './changes';
import { db, getMeta } from './db';
import { enqueue, pending } from './outbox';
import { activeEvent, cachedActiveEventId, cachedDefaultEventId, hydrate, syncNow } from './sync';

vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

const emptyEntities = Object.fromEntries(
  PULL_ENTITY_KEYS.map((k) => [k, []]),
) as unknown as PullResponse['entities'];

const op = (rowId: string) => ({
  op_id: `op-${rowId}`,
  entity: 'scouting_entry' as const,
  row_id: rowId,
  action: 'create' as const,
  base_version: null,
  payload: { event_id: 'ev-1', data: {} },
  author_user_id: 'u-1',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: 1,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('syncNow', () => {
  it('pushes pending operations, then pulls, and prunes what was acked', async () => {
    await enqueue(op('row-1'));
    const push = vi.fn(async (): Promise<PushResponse> => ({
      results: [{ op_id: 'op-row-1', status: 'applied', row_id: 'row-1', new_version: 1 }],
    }));
    const pull = vi.fn(async (): Promise<PullResponse> => ({
      watermark: '2026-11-14T09:00:55.000Z',
      next_cursor: null,
      complete: true,
      entities: {
        ...emptyEntities,
        scouting_entries: [
          { id: 'row-1', event_id: 'ev-1', updated_at: '2026-11-14T09:01:00.000Z' },
        ],
      },
    }));

    const outcome = await syncNow({ api: { push, pull }, eventId: 'ev-1', deviceId: 'd-1' });

    expect(outcome.status).toBe('ok');
    expect(push).toHaveBeenCalledOnce();
    expect(await pending(50)).toHaveLength(0);
    expect(await db.rows.get(['scouting_entries', 'row-1'])).toBeDefined();
    expect(await getMeta('sync.watermark', null)).toBe('2026-11-14T09:00:55.000Z');
  });

  it('sends at most 200 operations per call (SPEC-FINAL 9.3.1)', async () => {
    for (let i = 0; i < 205; i += 1) await enqueue(op(`row-${i}`));
    const push = vi.fn(async (req: { operations: unknown[] }): Promise<PushResponse> => {
      expect(req.operations.length).toBeLessThanOrEqual(200);
      return { results: [] };
    });
    await syncNow({
      api: {
        push,
        pull: async () => ({
          watermark: 'x',
          next_cursor: null,
          complete: true,
          entities: emptyEntities,
        }),
      },
      eventId: 'ev-1',
      deviceId: 'd-1',
    });
    expect(push).toHaveBeenCalled();
  });

  it('keeps everything local when the push fails, and reports offline', async () => {
    await enqueue(op('row-1'));
    const outcome = await syncNow({
      api: {
        push: async () => {
          throw new Error('network');
        },
        pull: async () => {
          throw new Error('network');
        },
      },
      eventId: 'ev-1',
      deviceId: 'd-1',
    });
    expect(outcome.status).toBe('offline');
    expect(await pending(50)).toHaveLength(1);
  });

  it('follows next_cursor until the pull is complete, committing the greatest watermark', async () => {
    const pages: PullResponse[] = [
      {
        watermark: '2026-11-14T09:00:00.000Z',
        next_cursor: 'c1',
        complete: false,
        entities: emptyEntities,
      },
      {
        watermark: '2026-11-14T09:10:00.000Z',
        next_cursor: null,
        complete: true,
        entities: emptyEntities,
      },
    ];
    let call = 0;
    await syncNow({
      api: { push: async () => ({ results: [] }), pull: async () => pages[call++]! },
      eventId: 'ev-1',
      deviceId: 'd-1',
    });
    expect(call).toBe(2);
    expect(await getMeta('sync.watermark', null)).toBe('2026-11-14T09:10:00.000Z');
  });

  it('does not commit a watermark from an incomplete pull', async () => {
    await syncNow({
      api: {
        push: async () => ({ results: [] }),
        pull: async () => ({
          watermark: '2026-11-14T09:00:00.000Z',
          next_cursor: 'c1',
          complete: false,
          entities: emptyEntities,
        }),
      },
      eventId: 'ev-1',
      deviceId: 'd-1',
      maxPages: 1,
    });
    expect(await getMeta('sync.watermark', null)).toBeNull();
  });

  it('wipes the event cache when the server says the event is gone (SPEC-FINAL 9.3)', async () => {
    await db.rows.put({ entity: 'scouting_entries', id: 'row-1', event_id: 'ev-1' });
    const outcome = await syncNow({
      api: {
        push: async () => ({ results: [] }),
        pull: async () => {
          throw Object.assign(new Error('gone'), { code: 'not-found' });
        },
      },
      eventId: 'ev-1',
      deviceId: 'd-1',
    });
    expect(outcome.status).toBe('event-gone');
    expect(await db.rows.where('event_id').equals('ev-1').count()).toBe(0);
  });
});

describe('syncNow through the real transport and its deadline (phase 1C follow-up)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports offline, not stuck, when a push never answers — every operation stays queued', async () => {
    await enqueue(op('row-1'));
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const api = apiClient(
      { apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' },
      session,
      20,
    );

    const outcome = await syncNow({ api, eventId: 'ev-1', deviceId: 'd-1' });

    expect(outcome.status).toBe('offline');
    expect(await pending(50)).toHaveLength(1);
  });
});

describe('syncNow and the watermark across events (task 1.22)', () => {
  it('pulls a different event from scratch, then deltas it from its own watermark', async () => {
    const pull = vi.fn(
      async (_req: { event_id: string; since?: string }): Promise<PullResponse> => ({
        watermark: `w-${pull.mock.calls.length}`,
        next_cursor: null,
        complete: true,
        entities: emptyEntities,
      }),
    );
    const api = { push: async () => ({ results: [] }), pull };

    await syncNow({ api, eventId: 'ev-A', deviceId: 'd-1' });
    await syncNow({ api, eventId: 'ev-A', deviceId: 'd-1' });
    expect(pull.mock.calls[1]![0]).toMatchObject({ event_id: 'ev-A', since: 'w-1' });

    // The default moved: A's watermark would skip every older row of B.
    await syncNow({ api, eventId: 'ev-B', deviceId: 'd-1' });
    expect(pull.mock.calls[2]![0]).toEqual({ event_id: 'ev-B' });
    expect(await getMeta('sync.hydrated_event_id', null)).toBe('ev-B');

    await syncNow({ api, eventId: 'ev-B', deviceId: 'd-1' });
    expect(pull.mock.calls[3]![0]).toMatchObject({ event_id: 'ev-B', since: 'w-3' });
  });

  it('keeps pulling a new event from scratch until one of its pulls completes', async () => {
    const pull = vi.fn(async (req: { event_id: string; since?: string }) => ({
      watermark: 'w-A',
      next_cursor: req.event_id === 'ev-B' ? 'c1' : null,
      complete: req.event_id !== 'ev-B',
      entities: emptyEntities,
    }));
    const api = { push: async () => ({ results: [] }), pull };
    await syncNow({ api, eventId: 'ev-A', deviceId: 'd-1' });
    await syncNow({ api, eventId: 'ev-B', deviceId: 'd-1', maxPages: 1 });
    await syncNow({ api, eventId: 'ev-B', deviceId: 'd-1', maxPages: 1 });
    expect(pull.mock.calls[2]![0]).toEqual({ event_id: 'ev-B' });
  });
});

describe('syncNow and parked rejections (SPEC-FINAL 9.3.1)', () => {
  const okPull = async (): Promise<PullResponse> => ({
    watermark: 'w',
    next_cursor: null,
    complete: true,
    entities: emptyEntities,
  });
  const run = (api: { push: (r: PushRequest) => Promise<PushResponse> }) =>
    syncNow({ api: { push: api.push, pull: okPull }, eventId: 'ev-1', deviceId: 'd-1' });

  it.each(['forbidden', 'edit-window-expired'] as const)(
    'does not re-send a %s rejection on the next sync',
    async (reason) => {
      await enqueue(op('row-1'));
      const push = vi.fn(async (): Promise<PushResponse> => ({
        results: [{ op_id: 'op-row-1', status: 'rejected', reason }],
      }));
      await run({ push });
      await run({ push });
      expect(push).toHaveBeenCalledTimes(1);
      expect(await db.outbox.count()).toBe(1);
    },
  );

  it('re-sends a transient server failure on the next sync', async () => {
    await enqueue(op('row-1'));
    const push = vi.fn(async (): Promise<PushResponse> => ({
      results: [
        {
          op_id: 'op-row-1',
          status: 'rejected',
          reason: 'invalid',
          detail: 'unexpected server error',
        },
      ],
    }));
    await run({ push });
    await run({ push });
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('sends each op at most once per sync, so a transient failure cannot loop', async () => {
    for (let i = 0; i < 3; i += 1) await enqueue({ ...op(`row-${i}`), seq: i + 1 });
    const push = vi.fn(async (req: PushRequest): Promise<PushResponse> => ({
      results: req.operations.map((o) => ({
        op_id: o.op_id,
        status: 'rejected' as const,
        reason: 'invalid' as const,
        detail: 'unexpected server error',
      })),
    }));
    await run({ push });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('does not let 200+ parked ops at the front block a fresh op behind them', async () => {
    for (let i = 0; i < 250; i += 1) await enqueue({ ...op(`dead-${i}`), seq: i + 1 });
    // The first sync parks every one of them.
    await run({
      push: async (req) => ({
        results: req.operations.map((o) => ({
          op_id: o.op_id,
          status: 'rejected' as const,
          reason: 'forbidden' as const,
        })),
      }),
    });
    expect(await pending(500)).toHaveLength(0);

    await enqueue({ ...op('fresh'), seq: 1000 });
    const push = vi.fn(async (req: PushRequest): Promise<PushResponse> => ({
      results: req.operations.map((o) => ({
        op_id: o.op_id,
        status: 'applied' as const,
        row_id: o.row_id,
        new_version: 1,
      })),
    }));
    await run({ push });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![0].operations.map((o) => o.op_id)).toEqual(['op-fresh']);
    expect(await db.outbox.count()).toBe(250); // every parked op is still kept
  });
});

describe('syncNow and the session user (SPEC-FINAL 7.5: the database is authoritative)', () => {
  it("refreshes the signed-in user's role and name from the pulled users row", async () => {
    await session.signIn(
      { id: 'u-1', username: 'a', full_name: 'A', role: 'lead', must_change_password: false },
      't',
    );
    await syncNow({
      api: {
        push: async () => ({ results: [] }),
        pull: async () => ({
          watermark: 'w',
          next_cursor: null,
          complete: true,
          entities: {
            ...emptyEntities,
            users: [{ id: 'u-1', role: 'scouter', full_name: 'A Cohen' }],
          },
        }),
      },
      eventId: 'ev-1',
      deviceId: 'd-1',
    });
    expect((await session.current())?.user).toMatchObject({
      role: 'scouter',
      full_name: 'A Cohen',
    });
    expect(await session.token()).toBe('t');
  });
});

describe('hydrate', () => {
  const workingApi = {
    push: async () => ({ results: [] }),
    pull: async () => ({
      watermark: 'w',
      next_cursor: null,
      complete: true,
      entities: emptyEntities,
    }),
  };

  it('reports fresh when the pull succeeds', async () => {
    expect(await hydrate({ api: workingApi, eventId: 'ev-1', deviceId: 'd-1' })).toBe('fresh');
  });

  it('reports cached when the pull fails but this event has hydrated before', async () => {
    await hydrate({ api: workingApi, eventId: 'ev-1', deviceId: 'd-1' });
    const failing = {
      push: workingApi.push,
      pull: async () => {
        throw new Error('offline');
      },
    };
    expect(await hydrate({ api: failing, eventId: 'ev-1', deviceId: 'd-1' })).toBe('cached');
  });

  it('reports blocked when the pull fails and nothing has ever been hydrated', async () => {
    const failing = {
      push: workingApi.push,
      pull: async () => {
        throw new Error('offline');
      },
    };
    expect(await hydrate({ api: failing, eventId: 'ev-1', deviceId: 'd-1' })).toBe('blocked');
  });

  it('reports blocked after a PARTIAL first pull, not cached', async () => {
    // rows landed, but the pull never reached complete: true
    const partial = {
      push: workingApi.push,
      pull: async () => ({
        watermark: 'w',
        next_cursor: 'c1',
        complete: false,
        entities: { ...emptyEntities, form_fields: [{ id: 'f-1', key: 'x' }] },
      }),
    };
    await syncNow({ api: partial, eventId: 'ev-1', deviceId: 'd-1', maxPages: 1 });
    expect(await db.rows.count()).toBeGreaterThan(0);

    const failing = {
      push: workingApi.push,
      pull: async () => {
        throw new Error('offline');
      },
    };
    expect(await hydrate({ api: failing, eventId: 'ev-1', deviceId: 'd-1' })).toBe('blocked');
  });

  it('reports blocked when the hydrated event is a different one', async () => {
    await hydrate({ api: workingApi, eventId: 'ev-1', deviceId: 'd-1' });
    const failing = {
      push: workingApi.push,
      pull: async () => {
        throw new Error('offline');
      },
    };
    expect(await hydrate({ api: failing, eventId: 'ev-2', deviceId: 'd-1' })).toBe('blocked');
  });
});

describe('the active event (task 1.17b)', () => {
  const EVENT = '00000000-0000-4000-8000-0000000000e1';
  const SEASON = '00000000-0000-4000-8000-000000000051';
  const answer = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the cached app_settings row, or null on a device that has none', async () => {
    expect(await cachedActiveEventId()).toBeNull();
    await db.rows.put({
      entity: 'app_settings',
      id: 'true',
      active_season_id: SEASON,
      active_event_id: EVENT,
    });
    expect(await cachedActiveEventId()).toBe(EVENT);
  });

  it('tells a device with no app_settings row apart from an admin who set no event', async () => {
    expect(await cachedDefaultEventId()).toBeUndefined();
    await db.rows.put({
      entity: 'app_settings',
      id: 'true',
      active_season_id: SEASON,
      active_event_id: null,
    });
    expect(await cachedDefaultEventId()).toBeNull();
    await db.rows.put({
      entity: 'app_settings',
      id: 'true',
      active_season_id: SEASON,
      active_event_id: EVENT,
    });
    expect(await cachedDefaultEventId()).toBe(EVENT);
  });

  it('asks the server with getActiveContext, and names the event it answers', async () => {
    await session.signIn(
      { id: 'u-1', username: 'a', full_name: 'A', role: 'scouter', must_change_password: false },
      'tok-1',
    );
    const fetchMock = vi.fn<typeof fetch>(async () =>
      answer({ active_season_id: SEASON, active_event_id: EVENT }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await activeEvent()).toEqual({ status: 'event', eventId: EVENT });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api.test/api/getActiveContext');
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      'Bearer tok-1',
    );
  });

  it('tells "no competition is set up" apart from "no answer"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => answer({ active_season_id: null, active_event_id: null })),
    );
    expect(await activeEvent()).toEqual({ status: 'no-event' });

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(await activeEvent()).toEqual({ status: 'unreachable' });
  });

  it('never reads an answer in a shape it does not know (a portal page) as "no event"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        async () =>
          new Response('<html>venue wifi</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    );
    expect(await activeEvent()).toEqual({ status: 'unreachable' });
  });
});

describe('syncNow change notifications', () => {
  it('announces rows only when a pull applied some', async () => {
    const seen: string[] = [];
    const off = onChanged((k) => seen.push(k));
    const empty = vi.fn(async (): Promise<PullResponse> => ({
      watermark: '2026-11-14T09:00:55.000Z',
      next_cursor: null,
      complete: true,
      entities: emptyEntities,
    }));
    await syncNow({ api: { push: vi.fn(), pull: empty }, eventId: 'ev-1', deviceId: 'd-1' });
    expect(seen).not.toContain('rows');
    const some = vi.fn(async (): Promise<PullResponse> => ({
      watermark: '2026-11-14T09:01:55.000Z',
      next_cursor: null,
      complete: true,
      entities: {
        ...emptyEntities,
        scouting_entries: [
          { id: 'row-9', event_id: 'ev-1', updated_at: '2026-11-14T09:01:00.000Z' },
        ],
      },
    }));
    await syncNow({ api: { push: vi.fn(), pull: some }, eventId: 'ev-1', deviceId: 'd-1' });
    off();
    expect(seen).toContain('rows');
  });
});
