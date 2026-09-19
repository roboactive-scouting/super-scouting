import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

const db = serviceClient();
const seasonId = uuid();
const eventId = uuid();
const teamId = uuid();
const matchId = uuid();

beforeAll(async () => {
  await db.from('seasons').insert({
    id: seasonId,
    year: 1900,
    game_name: 'TEST GAME',
    field_image_path: 'seasons/1900/field.webp',
  });
  await db
    .from('events')
    .insert({ id: eventId, season_id: seasonId, name: 'Test Event', sort_order: 1 });
  await db.from('teams').insert({ id: teamId, number: 999999, name: 'Test Team' });
});

afterAll(async () => {
  await db.from('seasons').delete().eq('id', seasonId);
  await db.from('teams').delete().eq('id', teamId);
});

describe('migration 0001 — the fixed skeleton', () => {
  it('creates every skeleton table', async () => {
    for (const table of [
      'app_settings',
      'seasons',
      'events',
      'teams',
      'event_teams',
      'matches',
      'match_teams',
    ]) {
      const { error } = await db.from(table).select('id').limit(1);
      expect(error, `${table}: ${error?.message}`).toBeNull();
    }
  });

  it('holds exactly one app_settings row, enforced by the boolean primary key', async () => {
    const { data } = await db.from('app_settings').select('id');
    expect(data).toHaveLength(1);
    const { error } = await db.from('app_settings').insert({ id: true });
    expect(error?.code).toBe('23505');
  });

  it('bumps updated_at on UPDATE (SPEC-FINAL 3.10)', async () => {
    const before = await db.from('seasons').select('updated_at').eq('id', seasonId).single();
    await new Promise((r) => setTimeout(r, 1100));
    await db.from('seasons').update({ game_name: 'TEST GAME 2' }).eq('id', seasonId);
    const after = await db.from('seasons').select('updated_at').eq('id', seasonId).single();
    expect(new Date(after.data!.updated_at).getTime()).toBeGreaterThan(
      new Date(before.data!.updated_at).getTime(),
    );
  });

  it('restricts match_type to the three legal values', async () => {
    const bad = await db
      .from('matches')
      .insert({ id: uuid(), event_id: eventId, match_type: 'final', number: 1 });
    expect(bad.error?.code).toBe('23514');
    const good = await db
      .from('matches')
      .insert({ id: matchId, event_id: eventId, match_type: 'qualification', number: 1 });
    expect(good.error).toBeNull();
  });

  it('allows a match with no match_teams rows and fills slots later', async () => {
    const { error } = await db
      .from('match_teams')
      .insert({ id: uuid(), match_id: matchId, alliance: 'red', station: 2, team_id: teamId });
    expect(error).toBeNull();
    const dup = await db
      .from('match_teams')
      .insert({ id: uuid(), match_id: matchId, alliance: 'red', station: 2, team_id: teamId });
    expect(dup.error?.code).toBe('23505');
  });

  it('makes the event roster soft-deletable and unique only among live rows', async () => {
    const first = uuid();
    await db.from('event_teams').insert({ id: first, event_id: eventId, team_id: teamId });
    const dup = await db
      .from('event_teams')
      .insert({ id: uuid(), event_id: eventId, team_id: teamId });
    expect(dup.error?.code).toBe('23505');
    await db.from('event_teams').update({ deleted_at: new Date().toISOString() }).eq('id', first);
    const again = await db
      .from('event_teams')
      .insert({ id: uuid(), event_id: eventId, team_id: teamId });
    expect(again.error).toBeNull();
  });

  it('keeps team numbers globally unique', async () => {
    const dup = await db.from('teams').insert({ id: uuid(), number: 999999, name: 'Clone' });
    expect(dup.error?.code).toBe('23505');
  });
});
