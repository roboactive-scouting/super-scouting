import { beforeEach, describe, expect, it } from 'vitest';
import { cachedLiveSlots, liveSlots } from './cache';
import { db } from './db';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const slot = (id: string, deleted_at?: string | null) => ({
  id,
  match_id: 'm-1',
  alliance: 'red',
  station: 1,
  team_id: 't-1',
  ...(deleted_at === undefined ? {} : { deleted_at }),
});

describe('live match slots (task 1.40, spec 7.5 item 1)', () => {
  it('drops a tombstoned slot and keeps live ones, including rows from before deleted_at existed', () => {
    const rows = [slot('a', null), slot('b', '2026-11-14T10:00:00.000Z'), slot('c')];
    expect(liveSlots(rows).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('reads the cached match_teams rows without their tombstones', async () => {
    await db.rows.bulkPut([
      { entity: 'match_teams', ...slot('a', null) },
      { entity: 'match_teams', ...slot('b', '2026-11-14T10:00:00.000Z') },
      { entity: 'matches', id: 'm-1', event_id: 'ev-1', match_type: 'qualification', number: 1 },
    ]);
    expect((await cachedLiveSlots<{ id: string }>()).map((r) => r.id)).toEqual(['a']);
  });
});
