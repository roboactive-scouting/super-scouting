import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

// Task 1.40, spec §7.5 item 5: migration 20261012091000_form_deletions.sql. A deleted form,
// version, field or scoring rule leaves a tombstone naming its season; a row inserted again
// under the same id clears it; a row that goes by CASCADE finds its parent already gone, so
// its season_id is null and it is never delivered — the parent's own tombstone covers it.
const db = serviceClient();
const ids = {
  season: uuid(),
  form: uuid(),
  v1: uuid(),
  v2: uuid(),
  f1: uuid(),
  f2: uuid(),
  f3: uuid(),
  r1: uuid(),
  r2: uuid(),
};
const allRowIds = Object.values(ids);

async function must(result: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await result;
  expect(error, error?.message).toBeNull();
}

type Tombstone = { entity: string; row_id: string; season_id: string | null; deleted_at: string };

async function tombstone(entity: string, rowId: string): Promise<Tombstone | null> {
  const { data, error } = await db
    .from('form_deletions')
    .select('entity, row_id, season_id, deleted_at')
    .eq('entity', entity)
    .eq('row_id', rowId)
    .maybeSingle();
  expect(error, error?.message).toBeNull();
  return data as Tombstone | null;
}

const field = (id: string, versionId: string, key: string) => ({
  id,
  form_version_id: versionId,
  key,
  label: key,
  type: 'counter',
  display_order: 1,
  description: 'x',
  unit: 'count',
  phase: 'auto',
  direction: 'higher_is_better',
});

beforeAll(async () => {
  await must(
    db
      .from('seasons')
      .insert({ id: ids.season, year: 1909, game_name: 'T', field_image_path: 'p' }),
  );
  await must(
    db.from('forms').insert({ id: ids.form, season_id: ids.season, kind: 'match', name: 'M' }),
  );
  await must(
    db.from('form_versions').insert([
      { id: ids.v1, form_id: ids.form, version_no: 1 },
      { id: ids.v2, form_id: ids.form, version_no: 2 },
    ]),
  );
  await must(
    db
      .from('form_fields')
      .insert([field(ids.f1, ids.v1, 'a'), field(ids.f2, ids.v1, 'b'), field(ids.f3, ids.v2, 'a')]),
  );
  await must(
    db.from('scoring_rules').insert([
      { id: ids.r1, form_id: ids.form, field_key: 'a', points: 1 },
      { id: ids.r2, form_id: ids.form, field_key: 'b', points: 2 },
    ]),
  );
});

afterAll(async () => {
  await db.from('seasons').delete().eq('id', ids.season);
  // Every delete above left a tombstone; none of them may outlive the test.
  await db.from('form_deletions').delete().in('row_id', allRowIds);
});

describe('form_deletions (task 1.40)', () => {
  it('a live row has no tombstone', async () => {
    expect(await tombstone('form_fields', ids.f1)).toBeNull();
  });

  it('a field removed from a version leaves a tombstone naming the season, stamped now', async () => {
    const before = Date.now();
    await must(db.from('form_fields').delete().eq('id', ids.f1));
    const row = await tombstone('form_fields', ids.f1);
    expect(row?.season_id).toBe(ids.season);
    // The database clock, not this machine's: allow for skew either way.
    expect(Math.abs(Date.parse(row!.deleted_at) - before)).toBeLessThan(120_000);
  });

  it('a dropped scoring rule leaves a tombstone naming the season', async () => {
    await must(db.from('scoring_rules').delete().eq('id', ids.r1));
    expect((await tombstone('scoring_rules', ids.r1))?.season_id).toBe(ids.season);
  });

  it('the delta read finds them by season and deleted_at', async () => {
    const { data, error } = await db
      .from('form_deletions')
      .select('entity, row_id')
      .eq('season_id', ids.season)
      .gt('deleted_at', '2000-01-01T00:00:00.000Z')
      .order('row_id');
    expect(error, error?.message).toBeNull();
    expect(data).toEqual(
      [
        { entity: 'form_fields', row_id: ids.f1 },
        { entity: 'scoring_rules', row_id: ids.r1 },
      ].sort((a, b) => a.row_id.localeCompare(b.row_id)),
    );
  });

  it('a row inserted again under the same id clears its tombstone', async () => {
    await must(db.from('form_fields').insert(field(ids.f1, ids.v1, 'a')));
    expect(await tombstone('form_fields', ids.f1)).toBeNull();
    await must(
      db.from('scoring_rules').insert({ id: ids.r1, form_id: ids.form, field_key: 'a', points: 3 }),
    );
    expect(await tombstone('scoring_rules', ids.r1)).toBeNull();
  });

  it('a deleted version names the season; its cascaded field finds no parent and is null', async () => {
    await must(db.from('form_versions').delete().eq('id', ids.v2));
    expect((await tombstone('form_versions', ids.v2))?.season_id).toBe(ids.season);
    const cascaded = await tombstone('form_fields', ids.f3);
    expect(cascaded).not.toBeNull();
    expect(cascaded?.season_id).toBeNull();
  });

  it('a deleted form names the season; everything it cascades to is null, never delivered', async () => {
    await must(db.from('forms').delete().eq('id', ids.form));
    expect((await tombstone('forms', ids.form))?.season_id).toBe(ids.season);
    for (const [entity, rowId] of [
      ['form_versions', ids.v1],
      ['form_fields', ids.f1],
      ['form_fields', ids.f2],
      ['scoring_rules', ids.r1],
      ['scoring_rules', ids.r2],
    ] as const) {
      const row = await tombstone(entity, rowId);
      expect(row, `${entity} ${rowId}`).not.toBeNull();
      expect(row?.season_id, `${entity} ${rowId}`).toBeNull();
    }
  });
});
