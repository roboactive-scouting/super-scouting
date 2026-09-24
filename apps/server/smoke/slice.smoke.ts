import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
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

// A per-run password for the CI user, never printed. The token it buys is never printed either.
const password = crypto.randomUUID();
let token = '';
const bearer = () => ({ authorization: `Bearer ${token}` });

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
  const { error: userError } = await db.from('users').insert({
    id: ids.user,
    username: `ci_${ids.user.slice(0, 8)}`,
    full_name: 'CI User',
    password_hash: await bcrypt.hash(password, 10),
    role: 'scouter',
  });
  if (userError) throw new Error(`could not create the CI user: ${userError.message}`);
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

  // Both sync routes need a bearer token since task 1.12 (SPEC-FINAL 7.5).
  const login = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: `ci_${ids.user.slice(0, 8)}`, password }),
  });
  if (login.status !== 200) throw new Error(`CI login failed with HTTP ${login.status}`);
  token = ((await login.json()) as { token: string }).token;
});

afterAll(async () => {
  await db.from('scouting_entries').delete().eq('event_id', ids.event);
  await db.from('seasons').delete().eq('id', ids.season);
  await db.from('users').delete().eq('id', ids.user);
  await db.from('teams').delete().eq('id', ids.team);
});

describe('smoke: authentication at the HTTP edge (SPEC-FINAL 7.5, 16.5)', () => {
  it('refuses a pull with no token', async () => {
    const res = await fetch(`${base}/sync/pull?event_id=${ids.event}`);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('refuses a push with no token', async () => {
    const res = await fetch(`${base}/sync/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_id: uid(), operations: [] }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('refuses a login with the wrong password', async () => {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: `ci_${ids.user.slice(0, 8)}`,
        password: 'not-the-password',
      }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });
});

describe('smoke: the walking skeleton path', () => {
  it('the health endpoint reads the database', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('loads the active competition and its form version', async () => {
    const res = await fetch(`${base}/sync/pull?event_id=${ids.event}`, { headers: bearer() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as PullResponse;
    expect(body.complete).toBe(true);
    expect(body.entities.form_fields.some((f) => f.key === 'ci_counter')).toBe(true);
  });

  it('submits an entry and reads it back', async () => {
    const now = new Date().toISOString();
    const push = await fetch(`${base}/sync/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer() },
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

    const pull = await fetch(`${base}/sync/pull?event_id=${ids.event}`, { headers: bearer() });
    const body = (await pull.json()) as PullResponse;
    const entry = body.entities.scouting_entries.find((e) => e.id === ids.entry);
    expect(entry).toBeDefined();
    expect(entry!.data).toEqual({ ci_counter: 4 });
  });

  it('auto-creates a bare match with its entry in one batch and reads both back (SPEC-FINAL 6.4)', async () => {
    // The client path: an unlisted match number rides the outbox as entity 'match',
    // then the entry that references it. The earlier tests seed their match directly,
    // which is how a phantom `version` column on matches passed this suite.
    const now = new Date().toISOString();
    const matchId = uid();
    const entryId = uid();
    const number = 500 + Math.floor(Math.random() * 400);
    const push = await fetch(`${base}/sync/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer() },
      body: JSON.stringify({
        device_id: uid(),
        operations: [
          {
            op_id: uid(),
            entity: 'match',
            row_id: matchId,
            action: 'create',
            base_version: null,
            payload: { event_id: ids.event, match_type: 'qualification', number },
            author_user_id: ids.user,
            client_created_at: now,
            client_updated_at: now,
            seq: 1,
          },
          {
            op_id: uid(),
            entity: 'scouting_entry',
            row_id: entryId,
            action: 'create',
            base_version: null,
            payload: {
              form_version_id: ids.version,
              form_kind: 'match',
              event_id: ids.event,
              match_id: matchId,
              team_id: ids.team,
              alliance: 'red',
              scouter_id: ids.user,
              robot_status: 'played',
              data: { ci_counter: 3 },
            },
            author_user_id: ids.user,
            client_created_at: now,
            client_updated_at: now,
            seq: 2,
          },
        ],
      }),
    });
    expect(push.status).toBe(200);
    const pushed = (await push.json()) as PushResponse;
    expect(pushed.results[0]).toMatchObject({ status: 'applied', row_id: matchId, new_version: 1 });
    expect(pushed.results[1]).toMatchObject({ status: 'applied', row_id: entryId });

    const { data: match } = await db
      .from('matches')
      .select('id, event_id, match_type, number')
      .eq('id', matchId)
      .maybeSingle();
    expect(match).toEqual({
      id: matchId,
      event_id: ids.event,
      match_type: 'qualification',
      number,
    });

    const pull = await fetch(`${base}/sync/pull?event_id=${ids.event}`, { headers: bearer() });
    const body = (await pull.json()) as PullResponse;
    expect(body.entities.matches.some((m) => m.id === matchId)).toBe(true);
    expect(body.entities.scouting_entries.some((e) => e.id === entryId)).toBe(true);
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
    const headers = { 'content-type': 'application/json', ...bearer() };
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
