import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

const db = serviceClient();
const ids = {
  season: uuid(),
  event: uuid(),
  team: uuid(),
  match: uuid(),
  form: uuid(),
  version: uuid(),
  user: uuid(),
};

const now = () => new Date().toISOString();

const entry = (over: Record<string, unknown> = {}) => ({
  id: uuid(),
  form_version_id: ids.version,
  form_kind: 'match',
  event_id: ids.event,
  match_id: ids.match,
  team_id: ids.team,
  alliance: 'red',
  scouter_id: ids.user,
  robot_status: 'played',
  data: { auto_speaker: 3 },
  client_created_at: now(),
  client_updated_at: now(),
  ...over,
});

beforeAll(async () => {
  await db
    .from('seasons')
    .insert({ id: ids.season, year: 1902, game_name: 'T', field_image_path: 'p' });
  await db
    .from('events')
    .insert({ id: ids.event, season_id: ids.season, name: 'E', sort_order: 1 });
  await db.from('teams').insert({ id: ids.team, number: 999998, name: 'T' });
  await db
    .from('matches')
    .insert({ id: ids.match, event_id: ids.event, match_type: 'qualification', number: 1 });
  await db.from('forms').insert({ id: ids.form, season_id: ids.season, kind: 'match', name: 'M' });
  await db.from('form_versions').insert({ id: ids.version, form_id: ids.form, version_no: 1 });
  await db.from('users').insert({
    id: ids.user,
    username: 'itest_entries',
    full_name: 'E',
    password_hash: 'x',
    role: 'scouter',
  });
});

afterAll(async () => {
  await db.from('scouting_entries').delete().eq('event_id', ids.event);
  await db.from('seasons').delete().eq('id', ids.season);
  await db.from('users').delete().eq('id', ids.user);
  await db.from('teams').delete().eq('id', ids.team);
});

describe('migration 0003 — entries, conflicts and the idempotency ledger', () => {
  it('creates all three tables', async () => {
    for (const table of ['scouting_entries', 'sync_conflicts']) {
      const { error } = await db.from(table).select('id').limit(1);
      expect(error, `${table}: ${error?.message}`).toBeNull();
    }
    const { error } = await db.from('applied_operations').select('op_id').limit(1);
    expect(error, `applied_operations: ${error?.message}`).toBeNull();
  });

  it('makes an op_id unique, which is what makes a replayed push a noop', async () => {
    const opId = `itest-${uuid()}`;
    expect((await db.from('applied_operations').insert({ op_id: opId })).error).toBeNull();
    expect((await db.from('applied_operations').insert({ op_id: opId })).error?.code).toBe('23505');
    await db.from('applied_operations').delete().eq('op_id', opId);
  });

  it('accepts an entry with a client-generated id and starts version at 1', async () => {
    const row = entry();
    const { error } = await db.from('scouting_entries').insert(row);
    expect(error).toBeNull();
    const { data } = await db.from('scouting_entries').select('version').eq('id', row.id).single();
    expect(data!.version).toBe(1);
  });

  it('keeps BOTH rows for the same logical key — the index is deliberately not unique (D6)', async () => {
    const a = await db.from('scouting_entries').insert(entry());
    const b = await db.from('scouting_entries').insert(entry());
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
  });

  it('blocks deleting a match that has entries (SPEC-FINAL 3.9)', async () => {
    const { error } = await db.from('matches').delete().eq('id', ids.match);
    expect(error?.code).toBe('23503');
  });

  it('cascades entries when the form version is removed, not restricts (SPEC-FINAL 3.5)', async () => {
    const version2 = uuid();
    await db.from('form_versions').insert({ id: version2, form_id: ids.form, version_no: 9 });
    const doomed = entry({ form_version_id: version2 });
    await db.from('scouting_entries').insert(doomed);
    const { error } = await db.from('form_versions').delete().eq('id', version2);
    expect(error).toBeNull();
    const { data } = await db.from('scouting_entries').select('id').eq('id', doomed.id);
    expect(data).toEqual([]);
  });

  it('restricts robot_status, form_kind and alliance to their vocabularies', async () => {
    expect(
      (await db.from('scouting_entries').insert(entry({ robot_status: 'dead' }))).error?.code,
    ).toBe('23514');
    expect(
      (await db.from('scouting_entries').insert(entry({ form_kind: 'pit' }))).error?.code,
    ).toBe('23514');
    expect(
      (await db.from('scouting_entries').insert(entry({ alliance: 'green' }))).error?.code,
    ).toBe('23514');
  });

  it('requires the two client timestamps', async () => {
    const { error } = await db
      .from('scouting_entries')
      .insert(entry({ client_created_at: null, client_updated_at: null }));
    expect(error?.code).toBe('23502');
  });

  it('stores a divergence conflict with the whole losing payload', async () => {
    const live = entry();
    await db.from('scouting_entries').insert(live);
    const { error } = await db.from('sync_conflicts').insert({
      id: uuid(),
      event_id: ids.event,
      entity: 'scouting_entry',
      row_id: live.id,
      kind: 'divergence',
      superseded_payload: { data: { auto_speaker: 9 } },
      superseded_author_id: ids.user,
      superseded_client_updated_at: now(),
      base_version: 1,
    });
    expect(error).toBeNull();
  });

  it('restricts the conflict entity and kind vocabularies', async () => {
    const bad = await db.from('sync_conflicts').insert({
      id: uuid(),
      event_id: ids.event,
      entity: 'team',
      row_id: uuid(),
      kind: 'divergence',
    });
    expect(bad.error?.code).toBe('23514');
    const badKind = await db.from('sync_conflicts').insert({
      id: uuid(),
      event_id: ids.event,
      entity: 'scouting_entry',
      row_id: uuid(),
      kind: 'merge',
    });
    expect(badKind.error?.code).toBe('23514');
  });
});
