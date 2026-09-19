import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

const db = serviceClient();
const seasonId = uuid();
const dashboardId = uuid();

beforeAll(async () => {
  await db
    .from('seasons')
    .insert({ id: seasonId, year: 1903, game_name: 'T', field_image_path: 'p' });
});

afterAll(async () => {
  await db.from('seasons').delete().eq('id', seasonId);
});

describe('migration 0004 — analysis tables', () => {
  it('creates every table', async () => {
    for (const table of ['metrics', 'dashboards', 'dashboard_charts', 'weight_presets']) {
      const { error } = await db.from(table).select('id').limit(1);
      expect(error, `${table}: ${error?.message}`).toBeNull();
    }
  });

  it('keeps metric names unique within a season', async () => {
    const metric = {
      season_id: seasonId,
      source_kind: 'meta',
      name: 'Entries per user',
      definition: {
        source: { kind: 'meta', measure: 'entries_per_user' },
        aggregation: 'count',
        filters: {},
      },
    };
    expect((await db.from('metrics').insert({ id: uuid(), ...metric })).error).toBeNull();
    expect((await db.from('metrics').insert({ id: uuid(), ...metric })).error?.code).toBe('23505');
  });

  it('restricts source_kind to form and meta', async () => {
    const bad = await db.from('metrics').insert({
      id: uuid(),
      season_id: seasonId,
      source_kind: 'sql',
      name: 'Bad',
      definition: {},
    });
    expect(bad.error?.code).toBe('23514');
  });

  it('allows exactly one dashboard of each built-in kind per season, and many custom ones', async () => {
    const ranking = {
      season_id: seasonId,
      kind: 'ranking',
      name: 'Ranking',
      scope: { mode: 'season' },
    };
    expect((await db.from('dashboards').insert({ id: dashboardId, ...ranking })).error).toBeNull();
    expect((await db.from('dashboards').insert({ id: uuid(), ...ranking })).error?.code).toBe(
      '23505',
    );

    const custom = { season_id: seasonId, kind: 'custom', name: 'Mine', scope: { mode: 'season' } };
    expect((await db.from('dashboards').insert({ id: uuid(), ...custom })).error).toBeNull();
    expect(
      (await db.from('dashboards').insert({ id: uuid(), ...custom, name: 'Mine 2' })).error,
    ).toBeNull();
  });

  it('restricts a chart span to 3, 6 or 12 (SPEC-FINAL 12.4)', async () => {
    const chart = { dashboard_id: dashboardId, position: 1, config: { type: 'bar' } };
    expect(
      (await db.from('dashboard_charts').insert({ id: uuid(), ...chart, span: 6 })).error,
    ).toBeNull();
    expect(
      (await db.from('dashboard_charts').insert({ id: uuid(), ...chart, span: 5 })).error?.code,
    ).toBe('23514');
  });

  it('keeps weight preset names unique within a season', async () => {
    const preset = { season_id: seasonId, name: 'Defence-heavy', weights: {} };
    expect((await db.from('weight_presets').insert({ id: uuid(), ...preset })).error).toBeNull();
    expect((await db.from('weight_presets').insert({ id: uuid(), ...preset })).error?.code).toBe(
      '23505',
    );
  });
});
