import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

const db = serviceClient();
const ids = {
  season: uuid(),
  event: uuid(),
  team: uuid(),
  user: uuid(),
  alliance: uuid(),
  list: uuid(),
};
const now = () => new Date().toISOString();
const clientStamps = { client_created_at: now(), client_updated_at: now() };

beforeAll(async () => {
  await db
    .from('seasons')
    .insert({ id: ids.season, year: 1904, game_name: 'T', field_image_path: 'p' });
  await db
    .from('events')
    .insert({ id: ids.event, season_id: ids.season, name: 'E', sort_order: 1 });
  await db.from('teams').insert({ id: ids.team, number: 999997, name: 'T' });
  await db.from('users').insert({
    id: ids.user,
    username: 'itest_alliance',
    full_name: 'A',
    password_hash: 'x',
    role: 'lead',
  });
  await db.from('alliances').insert({ id: ids.alliance, event_id: ids.event, number: 1 });
});

afterAll(async () => {
  await db.from('seasons').delete().eq('id', ids.season);
  await db.from('users').delete().eq('id', ids.user);
  await db.from('teams').delete().eq('id', ids.team);
});

describe('migration 0005 — alliance selection', () => {
  it('creates every table', async () => {
    for (const table of [
      'pick_lists',
      'pick_list_entries',
      'do_not_pick',
      'alliances',
      'alliance_slots',
      'alliance_declines',
    ]) {
      const { error } = await db.from(table).select('id').limit(1);
      expect(error, `${table}: ${error?.message}`).toBeNull();
    }
  });

  it('allows exactly one first list and one second list per event', async () => {
    const list = { event_id: ids.event, kind: 'first', ...clientStamps };
    expect((await db.from('pick_lists').insert({ id: ids.list, ...list })).error).toBeNull();
    expect((await db.from('pick_lists').insert({ id: uuid(), ...list })).error?.code).toBe('23505');
    expect(
      (await db.from('pick_lists').insert({ id: uuid(), ...list, kind: 'second' })).error,
    ).toBeNull();
  });

  it('carries a list-level version for the ordering guard (SPEC-FINAL 14.7)', async () => {
    const { data } = await db.from('pick_lists').select('version').eq('id', ids.list).single();
    expect(data!.version).toBe(1);
  });

  it('keeps a team once per live list and lets it come back after a soft delete', async () => {
    const row = { pick_list_id: ids.list, team_id: ids.team, rank: 1, ...clientStamps };
    const first = uuid();
    expect((await db.from('pick_list_entries').insert({ id: first, ...row })).error).toBeNull();
    expect((await db.from('pick_list_entries').insert({ id: uuid(), ...row })).error?.code).toBe(
      '23505',
    );
    await db.from('pick_list_entries').update({ deleted_at: now() }).eq('id', first);
    expect((await db.from('pick_list_entries').insert({ id: uuid(), ...row })).error).toBeNull();
  });

  it('requires a non-empty reason on a do-not-pick row (SPEC-FINAL 14.5)', async () => {
    const base = { event_id: ids.event, team_id: ids.team, created_by: ids.user, ...clientStamps };
    expect(
      (await db.from('do_not_pick').insert({ id: uuid(), ...base, reason: '   ' })).error?.code,
    ).toBe('23514');
    expect(
      (await db.from('do_not_pick').insert({ id: uuid(), ...base, reason: 'Broke down twice' }))
        .error,
    ).toBeNull();
  });

  it('numbers alliances 1..8 only', async () => {
    expect(
      (await db.from('alliances').insert({ id: uuid(), event_id: ids.event, number: 9 })).error
        ?.code,
    ).toBe('23514');
  });

  it('allows an empty slot as a row with a null team, one row per (alliance, slot) (D31)', async () => {
    const slot = {
      id: uuid(),
      alliance_id: ids.alliance,
      slot: 'pick1',
      team_id: null,
      ...clientStamps,
    };
    expect((await db.from('alliance_slots').insert(slot)).error).toBeNull();
    expect((await db.from('alliance_slots').insert({ ...slot, id: uuid() })).error?.code).toBe(
      '23505',
    );
    expect(
      (await db.from('alliance_slots').update({ team_id: ids.team }).eq('id', slot.id)).error,
    ).toBeNull();
    expect(
      (await db.from('alliance_slots').update({ team_id: null }).eq('id', slot.id)).error,
    ).toBeNull();
  });

  it('restricts the slot vocabulary to captain, pick1, pick2 and backup', async () => {
    const bad = await db.from('alliance_slots').insert({
      id: uuid(),
      alliance_id: ids.alliance,
      slot: 'pick3',
      team_id: null,
      ...clientStamps,
    });
    expect(bad.error?.code).toBe('23514');
  });

  it('records a decline once per (alliance, team)', async () => {
    const row = { alliance_id: ids.alliance, team_id: ids.team, client_created_at: now() };
    expect((await db.from('alliance_declines').insert({ id: uuid(), ...row })).error).toBeNull();
    expect((await db.from('alliance_declines').insert({ id: uuid(), ...row })).error?.code).toBe(
      '23505',
    );
  });
});
