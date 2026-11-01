import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

// Task 1.60 (SPEC-FINAL 3.9): the ON DELETE RESTRICT ordering, against the real dev database.
// A season with two events, four matches and twelve entries; the event goes, then the
// season, and nothing is left behind. And delete_match_cascade (migration
// 20261028090000): a match held only by a SOFT-deleted entry, which a plain delete cannot
// remove (the soft-deleted row still holds the match_id key) and the function can.
// Random ids and afterAll clean-up, like deleteCascade.itest.ts; `pnpm db:clean` sweeps
// anything a crash leaves (it is all outside the seed id space).
const db = serviceClient();
const ids = {
  season: uuid(),
  event1: uuid(),
  event2: uuid(),
  teams: [uuid(), uuid(), uuid(), uuid(), uuid(), uuid()],
  matches: [uuid(), uuid(), uuid(), uuid()], // event1 Q1, Q2; event2 Q1, Q2
  held: uuid(), // event1 Q3: one entry, soft-deleted
  form: uuid(),
  version: uuid(),
  user: uuid(),
  entries: Array.from({ length: 12 }, () => uuid()),
  heldEntry: uuid(),
  slots: [uuid(), uuid()],
};
const allMatches = [...ids.matches, ids.held];
const allEntries = [...ids.entries, ids.heldEntry];

const now = () => new Date().toISOString();

// Three entries per match: red 1, red 2 and blue 1.
const STATION_TEAMS = [0, 1, 3];
const entryRows = ids.entries.map((id, i) => {
  const match = Math.floor(i / 3);
  const team = STATION_TEAMS[i % 3]!;
  return {
    id,
    form_version_id: ids.version,
    form_kind: 'match',
    event_id: match < 2 ? ids.event1 : ids.event2,
    match_id: ids.matches[match],
    team_id: ids.teams[team],
    alliance: team < 3 ? 'red' : 'blue',
    scouter_id: ids.user,
    robot_status: 'played',
    data: {},
    client_created_at: now(),
    client_updated_at: now(),
  };
});

async function must(result: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await result;
  expect(error, error?.message).toBeNull();
}

async function countIn(table: string, column: string, values: string[]): Promise<number> {
  const { count: n, error } = await db
    .from(table)
    .select('*', { count: 'exact', head: true })
    .in(column, values);
  expect(error, error?.message).toBeNull();
  return n ?? 0;
}

beforeAll(async () => {
  await must(
    db
      .from('seasons')
      .insert({ id: ids.season, year: 1911, game_name: 'T', field_image_path: 'p' }),
  );
  await must(
    db.from('events').insert([
      { id: ids.event1, season_id: ids.season, name: 'D1', sort_order: 1 },
      { id: ids.event2, season_id: ids.season, name: 'D2', sort_order: 2 },
    ]),
  );
  await must(
    db.from('teams').insert(ids.teams.map((id, i) => ({ id, number: 999981 + i, name: `D${i}` }))),
  );
  await must(
    db.from('matches').insert([
      { id: ids.matches[0], event_id: ids.event1, match_type: 'qualification', number: 1 },
      { id: ids.matches[1], event_id: ids.event1, match_type: 'qualification', number: 2 },
      { id: ids.matches[2], event_id: ids.event2, match_type: 'qualification', number: 1 },
      { id: ids.matches[3], event_id: ids.event2, match_type: 'qualification', number: 2 },
      { id: ids.held, event_id: ids.event1, match_type: 'qualification', number: 3 },
    ]),
  );
  await must(
    db.from('match_teams').insert([
      {
        id: ids.slots[0],
        match_id: ids.matches[0],
        alliance: 'red',
        station: 1,
        team_id: ids.teams[0],
      },
      { id: ids.slots[1], match_id: ids.held, alliance: 'blue', station: 2, team_id: ids.teams[4] },
    ]),
  );
  await must(
    db.from('forms').insert({ id: ids.form, season_id: ids.season, kind: 'match', name: 'D' }),
  );
  await must(
    db.from('form_versions').insert({ id: ids.version, form_id: ids.form, version_no: 1 }),
  );
  await must(
    db.from('users').insert({
      id: ids.user,
      username: 'itest_deletes',
      full_name: 'D',
      password_hash: 'x',
      role: 'scouter',
    }),
  );
  await must(db.from('scouting_entries').insert(entryRows));
  // The held match's one entry, soft-deleted: the row stays, and so does its match_id key.
  await must(
    db.from('scouting_entries').insert({
      ...entryRows[0],
      id: ids.heldEntry,
      match_id: ids.held,
      team_id: ids.teams[4],
      alliance: 'blue',
      deleted_at: now(),
    }),
  );
});

afterAll(async () => {
  // Whatever a failed assertion left behind.
  await db.from('scouting_entries').delete().in('id', allEntries);
  await db.from('seasons').delete().eq('id', ids.season);
  await db.from('users').delete().eq('id', ids.user);
  await db.from('teams').delete().in('id', ids.teams);
  // The tombstones the delete triggers write (UF.1; task 1.40).
  await db.from('match_deletions').delete().in('match_id', allMatches);
  await db.from('form_deletions').delete().in('row_id', [ids.form, ids.version]);
});

describe('task 1.60 deletes against the real database (SPEC-FINAL 3.9)', () => {
  it('starts from two events, four matches and twelve entries (and the held match)', async () => {
    expect(await countIn('events', 'season_id', [ids.season])).toBe(2);
    expect(await countIn('matches', 'id', ids.matches)).toBe(4);
    expect(await countIn('scouting_entries', 'id', ids.entries)).toBe(12);
  });

  it('a soft-deleted entry still holds its match: a plain delete is refused (23503)', async () => {
    const { error } = await db.from('matches').delete().eq('id', ids.held);
    expect(error?.code).toBe('23503');
    expect(await countIn('matches', 'id', [ids.held])).toBe(1);
  });

  it('delete_match_cascade removes the match with its soft-deleted entry, its slot, and tombstones it', async () => {
    const { data, error } = await db.rpc('delete_match_cascade', { p_match_id: ids.held });
    expect(error, error?.message).toBeNull();
    expect(data).toBe(1);
    expect(await countIn('matches', 'id', [ids.held])).toBe(0);
    expect(await countIn('scouting_entries', 'id', [ids.heldEntry])).toBe(0);
    expect(await countIn('match_teams', 'id', [ids.slots[1]!])).toBe(0);
    expect(await countIn('match_deletions', 'match_id', [ids.held])).toBe(1);
    // nothing else went
    expect(await countIn('scouting_entries', 'id', ids.entries)).toBe(12);
    expect(await countIn('matches', 'id', ids.matches)).toBe(4);
  });

  it('delete_match_cascade is a no-op answering 0 for a match that does not exist', async () => {
    const { data, error } = await db.rpc('delete_match_cascade', { p_match_id: uuid() });
    expect(error, error?.message).toBeNull();
    expect(data).toBe(0);
  });

  it('the event goes with its two matches and six entries; the other event is untouched', async () => {
    await must(db.rpc('delete_event_cascade', { p_event_id: ids.event1 }));
    expect(await countIn('events', 'id', [ids.event1])).toBe(0);
    expect(await countIn('matches', 'event_id', [ids.event1])).toBe(0);
    expect(await countIn('scouting_entries', 'event_id', [ids.event1])).toBe(0);
    expect(await countIn('match_teams', 'match_id', ids.matches.slice(0, 2))).toBe(0);
    expect(await countIn('events', 'id', [ids.event2])).toBe(1);
    expect(await countIn('matches', 'event_id', [ids.event2])).toBe(2);
    expect(await countIn('scouting_entries', 'id', ids.entries)).toBe(6);
    expect(await countIn('seasons', 'id', [ids.season])).toBe(1);
  });

  it('then the season goes, and nothing it held is left behind', async () => {
    await must(db.rpc('delete_season_cascade', { p_season_id: ids.season }));
    expect(await countIn('seasons', 'id', [ids.season])).toBe(0);
    // no orphans, looked up by every key they could hang from
    expect(await countIn('events', 'season_id', [ids.season])).toBe(0);
    expect(await countIn('matches', 'event_id', [ids.event1, ids.event2])).toBe(0);
    expect(await countIn('matches', 'id', allMatches)).toBe(0);
    expect(await countIn('match_teams', 'match_id', allMatches)).toBe(0);
    expect(await countIn('scouting_entries', 'event_id', [ids.event1, ids.event2])).toBe(0);
    expect(await countIn('scouting_entries', 'id', allEntries)).toBe(0);
    expect(await countIn('scouting_entries', 'form_version_id', [ids.version])).toBe(0);
    expect(await countIn('forms', 'season_id', [ids.season])).toBe(0);
    expect(await countIn('form_versions', 'id', [ids.version])).toBe(0);
    // every match that went is tombstoned for the delta pull
    expect(await countIn('match_deletions', 'match_id', allMatches)).toBe(5);
    // shared rows are not the season's: the teams and the scouter stay
    expect(await countIn('teams', 'id', ids.teams)).toBe(6);
    expect(await countIn('users', 'id', [ids.user])).toBe(1);
  });
});
