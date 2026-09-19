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
