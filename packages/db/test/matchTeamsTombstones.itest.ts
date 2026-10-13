import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

// Task 1.40, spec §7.5 item 1: migration 20261012090000_match_teams_deleted_at.sql. A cleared
// slot is a tombstone whose updated_at moves (so the delta pull carries it); filling the same
// slot again revives that row, because the unique (match, alliance, station) refuses a second.
const db = serviceClient();
const ids = {
  season: uuid(),
  event: uuid(),
  match: uuid(),
  teamA: uuid(),
  teamB: uuid(),
  red1: uuid(),
  red2: uuid(),
};

async function must(result: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await result;
  expect(error, error?.message).toBeNull();
}

async function slot(id: string) {
  const { data, error } = await db
    .from('match_teams')
    .select('id, team_id, deleted_at, updated_at')
    .eq('id', id)
    .single();
  expect(error, error?.message).toBeNull();
  return data as { id: string; team_id: string; deleted_at: string | null; updated_at: string };
}

beforeAll(async () => {
  await must(
    db
      .from('seasons')
      .insert({ id: ids.season, year: 1908, game_name: 'T', field_image_path: 'p' }),
  );
  await must(
    db.from('events').insert({ id: ids.event, season_id: ids.season, name: 'E', sort_order: 1 }),
  );
  await must(
    db.from('teams').insert([
      { id: ids.teamA, number: 999991, name: 'A' },
      { id: ids.teamB, number: 999992, name: 'B' },
    ]),
  );
  await must(
    db
      .from('matches')
      .insert({ id: ids.match, event_id: ids.event, match_type: 'qualification', number: 1 }),
  );
  await must(
    db.from('match_teams').insert([
      { id: ids.red1, match_id: ids.match, alliance: 'red', station: 1, team_id: ids.teamA },
      { id: ids.red2, match_id: ids.match, alliance: 'red', station: 2, team_id: ids.teamB },
    ]),
  );
});

afterAll(async () => {
  // The season cascades to the event, its match and the match's slots; the match leaves a
  // match_deletions tombstone of its own, which must not outlive the test either.
  await db.from('seasons').delete().eq('id', ids.season);
  await db.from('match_deletions').delete().eq('match_id', ids.match);
  await db.from('teams').delete().in('id', [ids.teamA, ids.teamB]);
});

describe('match_teams tombstones (task 1.40)', () => {
  it('a slot starts live', async () => {
    expect((await slot(ids.red1)).deleted_at).toBeNull();
  });

  it('a cleared slot is a tombstone whose updated_at moves, so the delta pull carries it', async () => {
    const before = await slot(ids.red1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await must(
      db.from('match_teams').update({ deleted_at: new Date().toISOString() }).eq('id', ids.red1),
    );
    const after = await slot(ids.red1);
    expect(after.deleted_at).not.toBeNull();
    expect(Date.parse(after.updated_at)).toBeGreaterThan(Date.parse(before.updated_at));
    // The delta pull's own read: rows of the match whose updated_at is past `since`.
    const { data, error } = await db
      .from('match_teams')
      .select('id, deleted_at')
      .eq('match_id', ids.match)
      .gt('updated_at', before.updated_at);
    expect(error, error?.message).toBeNull();
    expect(data).toEqual([{ id: ids.red1, deleted_at: after.deleted_at }]);
  });

  it('a live read that filters deleted_at leaves the tombstone out', async () => {
    const { data, error } = await db
      .from('match_teams')
      .select('id')
      .eq('match_id', ids.match)
      .is('deleted_at', null);
    expect(error, error?.message).toBeNull();
    expect((data ?? []).map((r) => r.id)).toEqual([ids.red2]);
  });

  it('refuses a second row for the tombstoned slot, so a refill must revive it', async () => {
    const second = await db
      .from('match_teams')
      .insert({ id: uuid(), match_id: ids.match, alliance: 'red', station: 1, team_id: ids.teamB });
    expect(second.error?.code).toBe('23505');
  });

  it('revives the tombstoned row in place with its new team', async () => {
    await must(
      db.from('match_teams').update({ deleted_at: null, team_id: ids.teamB }).eq('id', ids.red1),
    );
    expect(await slot(ids.red1)).toMatchObject({ team_id: ids.teamB, deleted_at: null });
  });
});
