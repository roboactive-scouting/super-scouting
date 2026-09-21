import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { PullResponse, PushResponse } from '@frc/shared';

const base = process.env.SMOKE_API_BASE_URL;
const supabaseUrl = process.env.SMOKE_SUPABASE_URL;
const supabaseKey = process.env.SMOKE_SUPABASE_SERVICE_ROLE_KEY;
if (!base || !supabaseUrl || !supabaseKey) {
  throw new Error(
    'SMOKE_API_BASE_URL, SMOKE_SUPABASE_URL and SMOKE_SUPABASE_SERVICE_ROLE_KEY are required',
  );
}

const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const uid = () => crypto.randomUUID();

const ids = {
  season: uid(),
  event: uid(),
  team: uid(),
  match: uid(),
  form: uid(),
  version: uid(),
  user: uid(),
  entry: uid(),
};

beforeAll(async () => {
  // A namespaced CI season, created and torn down by the suite (SPEC-FINAL 18.4).
  await db.from('seasons').insert({
    id: ids.season,
    year: 2999,
    game_name: 'CI',
    field_image_path: 'seasons/2999/field.webp',
  });
  await db.from('events').insert({
    id: ids.event,
    season_id: ids.season,
    name: `CI ${ids.event.slice(0, 8)}`,
    sort_order: 1,
  });
  await db
    .from('teams')
    .insert({ id: ids.team, number: 900000 + Math.floor(Math.random() * 90000), name: 'CI Team' });
  await db.from('event_teams').insert({ id: uid(), event_id: ids.event, team_id: ids.team });
  await db
    .from('matches')
    .insert({ id: ids.match, event_id: ids.event, match_type: 'qualification', number: 1 });
  await db.from('users').insert({
    id: ids.user,
    username: `ci_${ids.user.slice(0, 8)}`,
    full_name: 'CI User',
    password_hash: 'x',
    role: 'scouter',
  });
  await db
    .from('forms')
    .insert({ id: ids.form, season_id: ids.season, kind: 'match', name: 'CI form' });
  await db.from('form_versions').insert({
    id: ids.version,
    form_id: ids.form,
    version_no: 1,
    published_at: new Date().toISOString(),
  });
  await db.from('form_fields').insert({
    id: uid(),
    form_version_id: ids.version,
    key: 'ci_counter',
    label: 'CI counter',
    type: 'counter',
    display_order: 1,
    required: false,
    config: { min: 0, max: 10, step: 1 },
    description: 'CI',
    unit: 'count',
    phase: 'auto',
    direction: 'higher_is_better',
  });
});

afterAll(async () => {
  await db.from('scouting_entries').delete().eq('event_id', ids.event);
  await db.from('seasons').delete().eq('id', ids.season);
  await db.from('users').delete().eq('id', ids.user);
  await db.from('teams').delete().eq('id', ids.team);
});

describe('smoke: the walking skeleton path', () => {
  it('the health endpoint reads the database', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('loads the active competition and its form version', async () => {
    const res = await fetch(`${base}/sync/pull?event_id=${ids.event}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as PullResponse;
    expect(body.complete).toBe(true);
    expect(body.entities.form_fields.some((f) => f.key === 'ci_counter')).toBe(true);
  });

  it('submits an entry and reads it back', async () => {
    const now = new Date().toISOString();
    const push = await fetch(`${base}/sync/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        device_id: uid(),
        operations: [
          {
            op_id: uid(),
            entity: 'scouting_entry',
            row_id: ids.entry,
            action: 'create',
            base_version: null,
            payload: {
              form_version_id: ids.version,
              form_kind: 'match',
              event_id: ids.event,
              match_id: ids.match,
              team_id: ids.team,
              alliance: 'red',
              scouter_id: ids.user,
              robot_status: 'played',
              data: { ci_counter: 4 },
            },
            author_user_id: ids.user,
            client_created_at: now,
            client_updated_at: now,
            seq: 1,
          },
        ],
      }),
    });
    expect(push.status).toBe(200);
    const pushed = (await push.json()) as PushResponse;
    expect(pushed.results[0]).toMatchObject({ status: 'applied', new_version: 1 });

    const pull = await fetch(`${base}/sync/pull?event_id=${ids.event}`);
    const body = (await pull.json()) as PullResponse;
    const entry = body.entities.scouting_entries.find((e) => e.id === ids.entry);
    expect(entry).toBeDefined();
    expect(entry!.data).toEqual({ ci_counter: 4 });
  });

  it('replaying the same operation is a noop, never a duplicate row', async () => {
    const now = new Date().toISOString();
    const opId = uid();
    const body = {
      device_id: uid(),
      operations: [
        {
          op_id: opId,
          entity: 'scouting_entry',
          row_id: uid(),
          action: 'create',
          base_version: null,
          payload: {
            form_version_id: ids.version,
            form_kind: 'match',
            event_id: ids.event,
            match_id: ids.match,
            team_id: ids.team,
            alliance: 'blue',
            scouter_id: ids.user,
            robot_status: 'no_show',
            data: {},
          },
          author_user_id: ids.user,
          client_created_at: now,
          client_updated_at: now,
          seq: 1,
        },
      ],
    };
    const headers = { 'content-type': 'application/json' };
    const first = (await (
      await fetch(`${base}/sync/push`, { method: 'POST', headers, body: JSON.stringify(body) })
    ).json()) as PushResponse;
    const second = (await (
      await fetch(`${base}/sync/push`, { method: 'POST', headers, body: JSON.stringify(body) })
    ).json()) as PushResponse;
    expect(first.results[0]!.status).toBe('applied');
    expect(second.results[0]!.status).toBe('noop');
  });
});
