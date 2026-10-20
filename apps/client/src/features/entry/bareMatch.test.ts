import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { ensureMatchLocally } from './bareMatch';
import { practiceMode } from './practice';

const q50 = {
  eventId: 'ev-1',
  matchType: 'qualification',
  number: 50,
  author: { id: 'u-1' },
};

const matchRows = async () =>
  (await db.rows.where('entity').equals('matches').toArray()).filter(
    (m) => m.event_id === 'ev-1' && m.match_type === 'qualification' && m.number === 50,
  );

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await practiceMode.exit();
});

/*
 * UF.22: a phone held two Q50 match rows, both made on the device. ensureMatchLocally trusted
 * the caller's `existing` — a snapshot the Scout page read earlier — so any caller whose snapshot
 * was older than the device made a second match for the same (event, type, number).
 */
describe('ensureMatchLocally: one match per (event, type, number) on a device (UF.22)', () => {
  it('a caller whose snapshot predates the match gets the match the device holds, not a second one', async () => {
    const first = await ensureMatchLocally(undefined, q50);
    // A second start from a screen that read the matches before `first` was written.
    const second = await ensureMatchLocally(undefined, q50);
    expect(second).toBe(first);
    expect(await matchRows()).toHaveLength(1);
    expect((await pending(10)).filter((op) => op.entity === 'match')).toHaveLength(1);
  });

  it('two starts at the same moment make one match', async () => {
    const [a, b] = await Promise.all([
      ensureMatchLocally(undefined, q50),
      ensureMatchLocally(undefined, q50),
    ]);
    expect(a).toBe(b);
    expect(await matchRows()).toHaveLength(1);
    expect(await pending(10)).toHaveLength(1);
  });

  it('a match pulled from the server is used as it is', async () => {
    await db.rows.put({
      entity: 'matches',
      id: 'm-server',
      event_id: 'ev-1',
      match_type: 'qualification',
      number: 50,
    });
    expect(await ensureMatchLocally(undefined, q50)).toBe('m-server');
    expect(await pending(10)).toHaveLength(0);
  });

  it('only the same event, type and number count', async () => {
    await db.rows.bulkPut([
      { entity: 'matches', id: 'm-ev2', event_id: 'ev-2', match_type: 'qualification', number: 50 },
      { entity: 'matches', id: 'm-p50', event_id: 'ev-1', match_type: 'practice', number: 50 },
      { entity: 'matches', id: 'm-q51', event_id: 'ev-1', match_type: 'qualification', number: 51 },
    ]);
    const id = await ensureMatchLocally(undefined, q50);
    expect(['m-ev2', 'm-p50', 'm-q51']).not.toContain(id);
    expect(await matchRows()).toHaveLength(1);
  });

  it('with two copies already on the device it makes no third: the one the caller named, else the older', async () => {
    await db.rows.bulkPut([
      {
        entity: 'matches',
        id: 'm-b',
        event_id: 'ev-1',
        match_type: 'qualification',
        number: 50,
        updated_at: '2026-10-20T10:05:00.000Z',
      },
      {
        entity: 'matches',
        id: 'm-a',
        event_id: 'ev-1',
        match_type: 'qualification',
        number: 50,
        updated_at: '2026-10-20T10:00:00.000Z',
      },
    ]);
    expect(await ensureMatchLocally({ id: 'm-b' }, q50)).toBe('m-b');
    expect(await ensureMatchLocally(undefined, q50)).toBe('m-a');
    expect(await matchRows()).toHaveLength(2);
    expect(await pending(10)).toHaveLength(0);
  });

  it('a stale `existing` whose row has gone (moved to the canonical id) is not trusted', async () => {
    await db.rows.put({
      entity: 'matches',
      id: 'm-canonical',
      event_id: 'ev-1',
      match_type: 'qualification',
      number: 50,
    });
    expect(await ensureMatchLocally({ id: 'm-remapped-away' }, q50)).toBe('m-canonical');
  });

  it('practice still never creates a match, but uses one the device holds', async () => {
    practiceMode.enter();
    await expect(ensureMatchLocally(undefined, q50)).rejects.toThrow(/practice/);
    await db.rows.put({
      entity: 'matches',
      id: 'm-held',
      event_id: 'ev-1',
      match_type: 'qualification',
      number: 50,
    });
    expect(await ensureMatchLocally(undefined, q50)).toBe('m-held');
    expect(await pending(10)).toHaveLength(0);
  });
});
