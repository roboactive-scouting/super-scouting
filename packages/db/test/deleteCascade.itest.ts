import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

// SPEC-FINAL 3.9, task RB.20: delete_event_cascade and delete_season_cascade. An entry on
// a match is the case a plain `delete from events` can trip over (match_id is ON DELETE
// RESTRICT), so the fixture has exactly that.
const db = serviceClient();
const ids = {
  season: uuid(),
  event: uuid(),
  event2: uuid(),
  team: uuid(),
  match: uuid(),
  match2: uuid(),
  form: uuid(),
  version: uuid(),
  user: uuid(),
  entry: uuid(),
  entry2: uuid(),
};

const now = () => new Date().toISOString();

const entry = (id: string, eventId: string, matchId: string) => ({
  id,
  form_version_id: ids.version,
  form_kind: 'match',
  event_id: eventId,
  match_id: matchId,
  team_id: ids.team,
  alliance: 'red',
  scouter_id: ids.user,
  robot_status: 'played',
  data: {},
  client_created_at: now(),
  client_updated_at: now(),
});

async function must(result: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await result;
  expect(error, error?.message).toBeNull();
}

async function count(table: string, column: string, value: string): Promise<number> {
  const { count: n, error } = await db
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value);
  expect(error, error?.message).toBeNull();
  return n ?? 0;
}

beforeAll(async () => {
  await must(
    db
      .from('seasons')
      .insert({ id: ids.season, year: 1905, game_name: 'T', field_image_path: 'p' }),
  );
  await must(
    db.from('events').insert([
      { id: ids.event, season_id: ids.season, name: 'E1', sort_order: 1 },
      { id: ids.event2, season_id: ids.season, name: 'E2', sort_order: 2 },
    ]),
  );
  await must(db.from('teams').insert({ id: ids.team, number: 999996, name: 'T' }));
  await must(
    db.from('matches').insert([
      { id: ids.match, event_id: ids.event, match_type: 'qualification', number: 1 },
      { id: ids.match2, event_id: ids.event2, match_type: 'qualification', number: 1 },
    ]),
  );
  await must(
    db.from('forms').insert({ id: ids.form, season_id: ids.season, kind: 'match', name: 'M' }),
  );
  await must(
    db.from('form_versions').insert({ id: ids.version, form_id: ids.form, version_no: 1 }),
  );
  await must(
    db.from('users').insert({
      id: ids.user,
      username: 'itest_delete_cascade',
      full_name: 'D',
      password_hash: 'x',
      role: 'scouter',
    }),
  );
  await must(
    db
      .from('scouting_entries')
      .insert([entry(ids.entry, ids.event, ids.match), entry(ids.entry2, ids.event2, ids.match2)]),
  );
});

afterAll(async () => {
  // Whatever a failed assertion left behind.
  await db.from('scouting_entries').delete().in('id', [ids.entry, ids.entry2]);
  await db.from('seasons').delete().eq('id', ids.season);
  await db.from('users').delete().eq('id', ids.user);
  await db.from('teams').delete().eq('id', ids.team);
  // The matches' tombstones (migration 20261008090000_match_deletions.sql, UF.1).
  await db.from('match_deletions').delete().in('match_id', [ids.match, ids.match2]);
});

describe('hard cascade deletes (SPEC-FINAL 3.9)', () => {
  it('a plain delete of an event whose match has entries can be refused — the reason for the function', async () => {
    const { error } = await db.from('matches').delete().eq('id', ids.match);
    expect(error?.code).toBe('23503');
  });

  it('delete_event_cascade removes the event, its matches and entries, and keeps the season', async () => {
    await must(db.rpc('delete_event_cascade', { p_event_id: ids.event }));
    expect(await count('events', 'id', ids.event)).toBe(0);
    expect(await count('matches', 'event_id', ids.event)).toBe(0);
    expect(await count('scouting_entries', 'id', ids.entry)).toBe(0);
    expect(await count('seasons', 'id', ids.season)).toBe(1);
    // the other event is untouched
    expect(await count('events', 'id', ids.event2)).toBe(1);
    expect(await count('scouting_entries', 'id', ids.entry2)).toBe(1);
  });

  it('delete_season_cascade removes the season, its events, matches, entries and forms', async () => {
    await must(db.rpc('delete_season_cascade', { p_season_id: ids.season }));
    expect(await count('seasons', 'id', ids.season)).toBe(0);
    expect(await count('events', 'season_id', ids.season)).toBe(0);
    expect(await count('matches', 'id', ids.match2)).toBe(0);
    expect(await count('scouting_entries', 'id', ids.entry2)).toBe(0);
    expect(await count('forms', 'season_id', ids.season)).toBe(0);
    expect(await count('form_versions', 'id', ids.version)).toBe(0);
    // shared rows are not the season's: the team and the scouter stay
    expect(await count('teams', 'id', ids.team)).toBe(1);
    expect(await count('users', 'id', ids.user)).toBe(1);
  });

  it('is a no-op for an id that does not exist', async () => {
    await must(db.rpc('delete_event_cascade', { p_event_id: uuid() }));
    await must(db.rpc('delete_season_cascade', { p_season_id: uuid() }));
  });
});
