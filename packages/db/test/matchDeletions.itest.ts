import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

// UF.1, SPEC-FINAL 9.3 (v1.18): migration 20261008090000_match_deletions.sql. A hard-deleted
// match leaves a tombstone the delta pull reads; a match created again under the same id
// (the client's rebuild, 9.7) clears it; an event delete's cascade leaves one per match.
const db = serviceClient();
const ids = {
  season: uuid(),
  event: uuid(),
  event2: uuid(),
  match: uuid(),
  match2: uuid(),
  match3: uuid(),
};
const allMatches = [ids.match, ids.match2, ids.match3];

async function must(result: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await result;
  expect(error, error?.message).toBeNull();
}

async function tombstone(matchId: string) {
  const { data, error } = await db
    .from('match_deletions')
    .select('match_id, event_id, deleted_at')
    .eq('match_id', matchId)
    .maybeSingle();
  expect(error, error?.message).toBeNull();
  return data as { match_id: string; event_id: string; deleted_at: string } | null;
}

const match = (id: string, eventId: string, number: number) => ({
  id,
  event_id: eventId,
  match_type: 'qualification',
  number,
});

beforeAll(async () => {
  await must(
    db
      .from('seasons')
      .insert({ id: ids.season, year: 1906, game_name: 'T', field_image_path: 'p' }),
  );
  await must(
    db.from('events').insert([
      { id: ids.event, season_id: ids.season, name: 'E1', sort_order: 1 },
      { id: ids.event2, season_id: ids.season, name: 'E2', sort_order: 2 },
    ]),
  );
  await must(
    db
      .from('matches')
      .insert([
        match(ids.match, ids.event, 1),
        match(ids.match2, ids.event2, 1),
        match(ids.match3, ids.event2, 2),
      ]),
  );
});

afterAll(async () => {
  await db.from('seasons').delete().eq('id', ids.season);
  // The cascade above writes tombstones of its own; none of them may outlive the test.
  await db.from('match_deletions').delete().in('match_id', allMatches);
});

describe('match_deletions (UF.1)', () => {
  it('starts empty for a live match', async () => {
    expect(await tombstone(ids.match)).toBeNull();
  });

  it('a match delete leaves a tombstone naming its event, stamped now', async () => {
    const before = Date.now();
    await must(db.from('matches').delete().eq('id', ids.match));
    const row = await tombstone(ids.match);
    expect(row?.event_id).toBe(ids.event);
    // The database clock, not this machine's: allow for skew either way.
    expect(Math.abs(new Date(row!.deleted_at).getTime() - before)).toBeLessThan(120_000);
  });

  it('the delta read finds it by event and deleted_at', async () => {
    const { data, error } = await db
      .from('match_deletions')
      .select('match_id')
      .eq('event_id', ids.event)
      .gt('deleted_at', '2000-01-01T00:00:00.000Z');
    expect(error, error?.message).toBeNull();
    expect((data ?? []).map((r) => r.match_id)).toEqual([ids.match]);
  });

  it('a match created again under the same id clears its tombstone', async () => {
    await must(db.from('matches').insert(match(ids.match, ids.event, 1)));
    expect(await tombstone(ids.match)).toBeNull();
  });

  it('a match deleted, rebuilt and deleted again holds one tombstone', async () => {
    await must(db.from('matches').delete().eq('id', ids.match));
    await must(db.from('matches').insert(match(ids.match, ids.event, 1)));
    await must(db.from('matches').delete().eq('id', ids.match));
    expect((await tombstone(ids.match))?.event_id).toBe(ids.event);
  });

  it('an event delete leaves a tombstone for each of its matches', async () => {
    await must(db.rpc('delete_event_cascade', { p_event_id: ids.event2 }));
    expect((await tombstone(ids.match2))?.event_id).toBe(ids.event2);
    expect((await tombstone(ids.match3))?.event_id).toBe(ids.event2);
  });
});
