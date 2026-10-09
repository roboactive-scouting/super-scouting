import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

const db = serviceClient();
const seasonId = uuid();
const formId = uuid();
const versionId = uuid();

beforeAll(async () => {
  await db.from('seasons').insert({
    id: seasonId,
    year: 1901,
    game_name: 'TEST',
    field_image_path: 'seasons/1901/field.webp',
  });
  await db.from('forms').insert({ id: formId, season_id: seasonId, kind: 'match', name: 'Match' });
  await db.from('form_versions').insert({ id: versionId, form_id: formId, version_no: 1 });
});

afterAll(async () => {
  await db.from('seasons').delete().eq('id', seasonId);
  await db.from('users').delete().eq('username', 'itest_user');
});

describe('migration 0002 — users and forms', () => {
  it('creates every table', async () => {
    for (const table of ['users', 'forms', 'form_versions', 'form_fields', 'scoring_rules']) {
      const { error } = await db.from(table).select('id').limit(1);
      expect(error, `${table}: ${error?.message}`).toBeNull();
    }
  });

  it('makes usernames unique case-insensitively (SPEC-FINAL 7.5)', async () => {
    const first = await db.from('users').insert({
      id: uuid(),
      username: 'itest_user',
      full_name: 'Integration Test',
      password_hash: 'x',
      role: 'scouter',
    });
    expect(first.error).toBeNull();
    const dup = await db.from('users').insert({
      id: uuid(),
      username: 'ITEST_USER',
      full_name: 'Clash',
      password_hash: 'x',
      role: 'scouter',
    });
    expect(dup.error?.code).toBe('23505');
  });

  it('restricts roles to scouter, lead and admin', async () => {
    const bad = await db.from('users').insert({
      id: uuid(),
      username: 'itest_bad_role',
      full_name: 'Bad',
      password_hash: 'x',
      role: 'mentor',
    });
    expect(bad.error?.code).toBe('23514');
  });

  it('allows one match form and one super form per season, and no more', async () => {
    const dup = await db
      .from('forms')
      .insert({ id: uuid(), season_id: seasonId, kind: 'match', name: 'Again' });
    expect(dup.error?.code).toBe('23505');
    const other = await db
      .from('forms')
      .insert({ id: uuid(), season_id: seasonId, kind: 'super', name: 'Super' });
    expect(other.error).toBeNull();
  });

  it('rejects a form kind outside match and super', async () => {
    const bad = await db
      .from('forms')
      .insert({ id: uuid(), season_id: seasonId, kind: 'pit', name: 'Pit' });
    expect(bad.error?.code).toBe('23514');
  });

  it('points a form at its active version once the version exists', async () => {
    const { error } = await db
      .from('forms')
      .update({ active_version_id: versionId })
      .eq('id', formId);
    expect(error).toBeNull();
  });

  it('defaults timer_config to an empty phase list (SPEC-FINAL 8.4)', async () => {
    const { data } = await db.from('forms').select('timer_config').eq('id', formId).single();
    expect(data!.timer_config).toEqual({ phases: [] });
  });

  it('keeps field keys unique inside a version and permits the same key in another', async () => {
    const field = {
      form_version_id: versionId,
      key: 'auto_speaker',
      label: 'Auto speaker notes',
      type: 'counter',
      display_order: 1,
      description: 'Notes scored in autonomous',
      unit: 'count',
      phase: 'auto',
      direction: 'higher_is_better',
    };
    expect((await db.from('form_fields').insert({ id: uuid(), ...field })).error).toBeNull();
    expect((await db.from('form_fields').insert({ id: uuid(), ...field })).error?.code).toBe(
      '23505',
    );

    const v2 = uuid();
    await db.from('form_versions').insert({ id: v2, form_id: formId, version_no: 2 });
    const inV2 = await db.from('form_fields').insert({ id: uuid(), ...field, form_version_id: v2 });
    expect(inV2.error).toBeNull();
  });

  it('constrains the semantic-metadata vocabularies', async () => {
    const base = {
      id: uuid(),
      form_version_id: versionId,
      key: 'bad_unit',
      label: 'x',
      type: 'counter',
      display_order: 9,
      description: 'x',
      phase: 'auto',
      direction: 'higher_is_better',
    };
    expect((await db.from('form_fields').insert({ ...base, unit: 'furlongs' })).error?.code).toBe(
      '23514',
    );
    expect(
      (await db.from('form_fields').insert({ ...base, unit: 'count', phase: 'halftime' })).error
        ?.code,
    ).toBe('23514');
    expect(
      (await db.from('form_fields').insert({ ...base, unit: 'count', direction: 'up' })).error
        ?.code,
    ).toBe('23514');
  });

  it('refuses negative points and keys scoring by (form_id, field_key)', async () => {
    const negative = await db
      .from('scoring_rules')
      .insert({ id: uuid(), form_id: formId, field_key: 'auto_speaker', points: -1 });
    expect(negative.error?.code).toBe('23514');

    const ok = await db
      .from('scoring_rules')
      .insert({ id: uuid(), form_id: formId, field_key: 'auto_speaker', points: 5 });
    expect(ok.error).toBeNull();

    const dup = await db
      .from('scoring_rules')
      .insert({ id: uuid(), form_id: formId, field_key: 'auto_speaker', points: 2 });
    expect(dup.error?.code).toBe('23505');
  });
});

// Task 1.27: form_versions.updated_by (20261008100000), form_exports (20261008101000), and
// the one-statement form delete Store.deleteFormCascade relies on.
describe('migrations 20261008100000 and 20261008101000 — updated_by, form_exports, the form delete', () => {
  const ids = {
    season: uuid(),
    event: uuid(),
    team: uuid(),
    user: uuid(),
    form: uuid(),
    version: uuid(),
    field: uuid(),
    rule: uuid(),
    entry: uuid(),
    exported: uuid(),
    exported2: uuid(),
  };

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
        .insert({ id: ids.season, year: 1907, game_name: 'T', field_image_path: 'p' }),
    );
    await must(
      db.from('events').insert({ id: ids.event, season_id: ids.season, name: 'E', sort_order: 1 }),
    );
    await must(db.from('teams').insert({ id: ids.team, number: 999995, name: 'T' }));
    await must(
      db.from('users').insert({
        id: ids.user,
        username: 'itest_form_exports',
        full_name: 'Export Tester',
        password_hash: 'x',
        role: 'admin',
      }),
    );
    await must(
      db.from('forms').insert({ id: ids.form, season_id: ids.season, kind: 'super', name: 'S' }),
    );
  });

  afterAll(async () => {
    // Whatever a failed assertion left behind.
    await db.from('form_exports').delete().in('id', [ids.exported, ids.exported2]);
    await db.from('scouting_entries').delete().eq('id', ids.entry);
    await db.from('seasons').delete().eq('id', ids.season);
    await db.from('teams').delete().eq('id', ids.team);
    await db.from('users').delete().eq('id', ids.user);
  });

  it('form_versions.updated_by records a user, may be null, and must name a real user', async () => {
    await must(
      db
        .from('form_versions')
        .insert({ id: ids.version, form_id: ids.form, version_no: 1, updated_by: ids.user }),
    );
    const { data } = await db
      .from('form_versions')
      .select('updated_by')
      .eq('id', ids.version)
      .single();
    expect(data!.updated_by).toBe(ids.user);

    const nobody = await db
      .from('form_versions')
      .update({ updated_by: uuid() })
      .eq('id', ids.version);
    expect(nobody.error?.code).toBe('23503');

    await must(db.from('form_versions').update({ updated_by: null }).eq('id', ids.version));
    await must(db.from('form_versions').update({ updated_by: ids.user }).eq('id', ids.version));
  });

  it('form_exports accepts a saved export and needs a real author', async () => {
    await must(
      db.from('form_exports').insert({
        id: ids.exported,
        form_id: ids.form,
        label: 'S · draft v1',
        definition: { format: 1, kind: 'super', fields: [] },
        created_by: ids.user,
      }),
    );
    const { data } = await db
      .from('form_exports')
      .select('created_at, form_id')
      .eq('id', ids.exported)
      .single();
    expect(data!.form_id).toBe(ids.form);
    expect(typeof data!.created_at).toBe('string');

    const nobody = await db.from('form_exports').insert({
      id: ids.exported2,
      form_id: ids.form,
      label: 'x',
      definition: {},
      created_by: uuid(),
    });
    expect(nobody.error?.code).toBe('23503');
  });

  it('deleting a form takes its versions, fields, scoring and entries, and unlinks its exports', async () => {
    await must(db.from('forms').update({ active_version_id: ids.version }).eq('id', ids.form));
    await must(
      db.from('form_fields').insert({
        id: ids.field,
        form_version_id: ids.version,
        key: 'notes',
        label: 'Notes',
        type: 'counter',
        display_order: 1,
      }),
    );
    await must(
      db
        .from('scoring_rules')
        .insert({ id: ids.rule, form_id: ids.form, field_key: 'notes', points: 1 }),
    );
    const now = new Date().toISOString();
    await must(
      db.from('scouting_entries').insert({
        id: ids.entry,
        form_version_id: ids.version,
        form_kind: 'super',
        event_id: ids.event,
        match_id: null,
        team_id: ids.team,
        scouter_id: ids.user,
        data: {},
        client_created_at: now,
        client_updated_at: now,
      }),
    );

    // Exactly the statement Store.deleteFormCascade sends.
    await must(db.from('forms').delete().eq('id', ids.form));

    expect(await count('forms', 'id', ids.form)).toBe(0);
    expect(await count('form_versions', 'id', ids.version)).toBe(0);
    expect(await count('form_fields', 'id', ids.field)).toBe(0);
    expect(await count('scoring_rules', 'id', ids.rule)).toBe(0);
    expect(await count('scouting_entries', 'id', ids.entry)).toBe(0);
    const { data } = await db
      .from('form_exports')
      .select('form_id')
      .eq('id', ids.exported)
      .single();
    expect(data!.form_id).toBeNull();
    // the event, the team and the author are not the form's
    expect(await count('events', 'id', ids.event)).toBe(1);
    expect(await count('users', 'id', ids.user)).toBe(1);
  });
});
