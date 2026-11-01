import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import {
  activeContext,
  loginOutput,
  rankTeamsOutput,
  type PullResponse,
  type PushResponse,
} from '@frc/shared';
import {
  CI_POINTS_PER_UNIT,
  newCiFixture,
  setUpCiSeason,
  smokeEnv,
  tearDownCiSeason,
  uid,
} from './fixtures.js';

/**
 * Tier 2 of SPEC-FINAL 18.4: "is the app still wired together?" Every test goes through the
 * deployed server to the dev database, never a mock. Deliberately shallow: behaviour is tier 1's.
 * The tests run in file order and share the CI season; the metric reads the entries pushed above it.
 */

const env = smokeEnv();
const { base, db } = env;
const fx = newCiFixture();
const { ids } = fx;

let token = '';
const bearer = () => ({ authorization: `Bearer ${token}` });
const json = { 'content-type': 'application/json' };

beforeAll(async () => {
  token = await setUpCiSeason(env, fx);
});

// Runs whether the tests passed or failed, and throws if any CI row survives.
afterAll(async () => {
  await tearDownCiSeason(db, fx);
});

describe('smoke: authentication and session (SPEC-FINAL 7.5, 16.5)', () => {
  it('login returns a usable token', async () => {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ username: fx.username, password: fx.password }),
    });
    expect(res.status).toBe(200);
    const body = loginOutput.parse(await res.json());
    expect(body.user).toMatchObject({ id: ids.user, username: fx.username, role: 'scouter' });
    expect(JSON.stringify(body)).not.toContain('password_hash');

    // Usable: the fresh token opens a registry route.
    const use = await fetch(`${base}/api/getActiveContext`, {
      method: 'POST',
      headers: { ...json, authorization: `Bearer ${body.token}` },
      body: '{}',
    });
    expect(use.status).toBe(200);
  });

  it('refuses a registry route with no token, and the same call with one succeeds', async () => {
    const res = await fetch(`${base}/api/listUsers`, { method: 'POST', headers: json, body: '{}' });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'unauthenticated' } });

    // The control: the route exists and takes this body, so the 401 above is the missing token.
    const withToken = await fetch(`${base}/api/listUsers`, {
      method: 'POST',
      headers: { ...json, ...bearer() },
      body: '{}',
    });
    expect(withToken.status).toBe(200);
  });

  it('refuses a token signed with another secret', async () => {
    const forged = await new SignJWT({ role: 'admin', username: fx.username })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(ids.user)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(crypto.getRandomValues(new Uint8Array(32)));
    const res = await fetch(`${base}/api/listUsers`, {
      method: 'POST',
      headers: { ...json, authorization: `Bearer ${forged}` },
      body: '{}',
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('refuses a pull with no token', async () => {
    const res = await fetch(`${base}/sync/pull?event_id=${ids.event}`);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('refuses a push with no token', async () => {
    const res = await fetch(`${base}/sync/push`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ device_id: uid(), operations: [] }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('refuses a login with the wrong password', async () => {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ username: fx.username, password: 'not-the-password' }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });
});

describe('smoke: the client → server → database path', () => {
  it('the health endpoint reads the database', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it("getActiveContext answers with dev's active season and event, read and never set", async () => {
    const res = await fetch(`${base}/api/getActiveContext`, {
      method: 'POST',
      headers: { ...json, ...bearer() },
      body: '{}',
    });
    expect(res.status).toBe(200);
    const body = activeContext.parse(await res.json());

    const { data: settings, error } = await db
      .from('app_settings')
      .select('active_season_id, active_event_id');
    expect(error).toBeNull();
    expect(settings).toHaveLength(1);
    expect(body.active_season_id).toBe(settings![0]!.active_season_id);
    expect(body.active_event_id).toBe(settings![0]!.active_event_id);
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
      headers: { ...json, ...bearer() },
      body: JSON.stringify({
        device_id: uid(),
        operations: [
          {
            op_id: fx.opId(),
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
      headers: { ...json, ...bearer() },
      body: JSON.stringify({
        device_id: uid(),
        operations: [
          {
            op_id: fx.opId(),
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
            op_id: fx.opId(),
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
    const body = {
      device_id: uid(),
      operations: [
        {
          op_id: fx.opId(),
          entity: 'scouting_entry',
          row_id: uid(),
          action: 'create',
          base_version: null,
          payload: {
            form_version_id: ids.version,
            form_kind: 'match',
            event_id: ids.event,
            match_id: ids.replayMatch,
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
    const headers = { ...json, ...bearer() };
    const first = (await (
      await fetch(`${base}/sync/push`, { method: 'POST', headers, body: JSON.stringify(body) })
    ).json()) as PushResponse;
    const second = (await (
      await fetch(`${base}/sync/push`, { method: 'POST', headers, body: JSON.stringify(body) })
    ).json()) as PushResponse;
    expect(first.results[0]!.status).toBe('applied');
    expect(second.results[0]!.status).toBe('noop');
  });

  it('runs one metric over the CI entries: rankTeams gives the average those entries imply', async () => {
    const res = await fetch(`${base}/api/rankTeams`, {
      method: 'POST',
      headers: { ...json, ...bearer() },
      body: JSON.stringify({ event_id: ids.event }),
    });
    expect(res.status).toBe(200);
    const table = rankTeamsOutput.parse(await res.json());
    expect(table.event.id).toBe(ids.event);
    const row = table.rows.find((r) => r.team_id === ids.team);
    expect(row).toBeDefined();
    // Two played qualification entries above, ci_counter 4 and 3, at CI_POINTS_PER_UNIT each:
    // (8 + 6) / 2 = 7. The replayed no-show is left out of the average, never scored as 0 (11.3).
    expect(row!.average_points).toBeCloseTo(((4 + 3) * CI_POINTS_PER_UNIT) / 2, 6);
    expect(row!).toMatchObject({ rank: 1, matches_counted: 2, no_shows: 1 });
  });
});
