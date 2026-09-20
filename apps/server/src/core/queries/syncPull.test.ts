import { beforeEach, describe, expect, it } from 'vitest';
import { PULL_ENTITY_KEYS, type Caller } from '@frc/shared';
import { syncPull } from './syncPull.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

const scouter: Caller = { kind: 'user', userId: 'u-scouter', role: 'scouter' };
const EVENT = 'ev-1';

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.pullRows.set('scouting_entries', [
    { id: 'e-1', event_id: EVENT, updated_at: '2026-11-14T09:00:00.000Z', deleted_at: null },
    { id: 'e-2', event_id: EVENT, updated_at: '2026-11-14T09:00:30.000Z', deleted_at: null },
    {
      id: 'e-3',
      event_id: EVENT,
      updated_at: '2026-11-14T09:01:00.000Z',
      deleted_at: '2026-11-14T09:01:00.000Z',
    },
  ]);
  ctx.pullRows.set('teams', [{ id: 't-1', number: 2096, updated_at: '2026-11-13T08:00:00.000Z' }]);
});

describe('syncPull', () => {
  it('returns all 24 entity keys, even the empty ones', async () => {
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(Object.keys(res.entities).sort()).toEqual([...PULL_ENTITY_KEYS].sort());
  });

  it('returns the whole dataset on a first pull and marks it complete', async () => {
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(res.entities.scouting_entries).toHaveLength(3);
    expect(res.complete).toBe(true);
    expect(res.next_cursor).toBeNull();
  });

  it('returns tombstones as ordinary rows carrying deleted_at', async () => {
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    const tombstone = res.entities.scouting_entries.find((r) => r.id === 'e-3');
    expect(tombstone?.deleted_at).toBe('2026-11-14T09:01:00.000Z');
  });

  it('returns only rows newer than `since` on a delta pull', async () => {
    const res = await syncPull(
      scouter,
      { event_id: EVENT, since: '2026-11-14T09:00:15.000Z' },
      ctx,
    );
    expect(res.entities.scouting_entries.map((r) => r.id)).toEqual(['e-2', 'e-3']);
    expect(res.entities.teams).toHaveLength(0);
  });

  it('rewinds the watermark five seconds behind the newest row it returned', async () => {
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(res.watermark).toBe('2026-11-14T09:00:55.000Z');
  });

  it('pages a large first pull and reports complete only on the last page', async () => {
    ctx.pullRows.set(
      'scouting_entries',
      Array.from({ length: 2500 }, (_, i) => ({
        id: `e-${i}`,
        event_id: EVENT,
        updated_at: new Date(Date.UTC(2026, 10, 14, 9, 0, 0) + i * 1000).toISOString(),
        deleted_at: null,
      })),
    );
    const first = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(first.complete).toBe(false);
    expect(first.next_cursor).not.toBeNull();
    expect(first.entities.scouting_entries.length).toBeLessThanOrEqual(2000);

    const second = await syncPull(scouter, { event_id: EVENT, cursor: first.next_cursor! }, ctx);
    expect(second.complete).toBe(true);
    expect(second.next_cursor).toBeNull();
    const ids = new Set([
      ...first.entities.scouting_entries.map((r) => r.id),
      ...second.entities.scouting_entries.map((r) => r.id),
    ]);
    expect(ids.size).toBe(2500);
  });

  it('caches every user row including the password hash, for offline login (SPEC-FINAL 7.5, 9.2)', async () => {
    ctx.pullRows.set('users', [
      {
        id: 'u-1',
        username: 'a',
        full_name: 'A',
        role: 'scouter',
        password_hash: '$2a$10$x',
        disabled_at: null,
        updated_at: '2026-11-13T08:00:00.000Z',
      },
    ]);
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(res.entities.users[0]).toHaveProperty('password_hash');
  });

  it('a service caller may call it — syncPull is a query', async () => {
    const res = await syncPull({ kind: 'service', label: 'mcp' }, { event_id: EVENT }, ctx);
    expect(res.complete).toBe(true);
  });

  it('reports not-found when the event no longer exists, so the client can wipe its cache', async () => {
    ctx.knownEvents.clear();
    await expect(syncPull(scouter, { event_id: EVENT }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
