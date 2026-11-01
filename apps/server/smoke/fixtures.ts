import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

/**
 * The smoke suite's namespaced CI season (SPEC-FINAL 18.4): created before the suite, torn
 * down after it whatever happened, on the DEV project only (CI holds no production secret).
 *
 * Everything the suite writes hangs off ids generated here, so teardown can find every row —
 * including the ones no foreign key reaches: the match and form tombstones the delete triggers
 * write (match_deletions, form_deletions) and the op_id ledger (applied_operations). Ops go
 * through `opId()` so their ledger rows can be removed too.
 *
 * The suite never writes app_settings: dev's active season and event are someone's test bench.
 */

export const CI_YEAR = 2999;
/** The CI field's scoring rule: two points per unit, so a score can't be mistaken for the raw count. */
export const CI_POINTS_PER_UNIT = 2;
/** A CI season older than this belongs to a run that died before its teardown. */
const STALE_AFTER_MS = 30 * 60_000;

export type SmokeEnv = { base: string; db: SupabaseClient };

export function smokeEnv(): SmokeEnv {
  const base = process.env.SMOKE_API_BASE_URL;
  const supabaseUrl = process.env.SMOKE_SUPABASE_URL;
  const supabaseKey = process.env.SMOKE_SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !supabaseUrl || !supabaseKey) {
    throw new Error(
      'SMOKE_API_BASE_URL, SMOKE_SUPABASE_URL and SMOKE_SUPABASE_SERVICE_ROLE_KEY are required',
    );
  }
  return {
    base: base.replace(/\/+$/, ''),
    db: createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }),
  };
}

export const uid = () => crypto.randomUUID();

export type CiFixture = ReturnType<typeof newCiFixture>;

/** Ids only: no I/O, so teardown knows every id even when setup failed halfway. */
export function newCiFixture() {
  const user = uid();
  const ops: string[] = [];
  return {
    ids: {
      season: uid(),
      event: uid(),
      team: uid(),
      match: uid(),
      /** Its own match: since task 1.40 a second entry for (match, team) is a duplicate, not applied. */
      replayMatch: uid(),
      form: uid(),
      version: uid(),
      field: uid(),
      rule: uid(),
      user,
      entry: uid(),
    },
    username: `ci_${user.slice(0, 8)}`,
    // A per-run password for the CI user, never printed. The token it buys is never printed either.
    password: crypto.randomUUID(),
    teamNumber: 900000 + Math.floor(Math.random() * 90000),
    ops,
    /** A fresh op_id, remembered so teardown can clear its applied_operations row. */
    opId: () => {
      const id = uid();
      ops.push(id);
      return id;
    },
  };
}

async function must(label: string, query: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await query;
  if (error) throw new Error(`CI setup: ${label} failed: ${error.message}`);
}

/** Creates the CI season and logs the CI user in. On any failure it tears down, then rethrows. */
export async function setUpCiSeason(env: SmokeEnv, fx: CiFixture): Promise<string> {
  const { db, base } = env;
  const { ids } = fx;
  try {
    await clearStaleCiSeason(db);
    await must(
      'season',
      db.from('seasons').insert({
        id: ids.season,
        year: CI_YEAR,
        game_name: 'CI',
        field_image_path: `seasons/${CI_YEAR}/field.webp`,
      }),
    );
    await must(
      'event',
      db.from('events').insert({
        id: ids.event,
        season_id: ids.season,
        name: `CI ${ids.event.slice(0, 8)}`,
        sort_order: 1,
      }),
    );
    await must(
      'team',
      db.from('teams').insert({ id: ids.team, number: fx.teamNumber, name: 'CI Team' }),
    );
    await must(
      'roster',
      db.from('event_teams').insert({ id: uid(), event_id: ids.event, team_id: ids.team }),
    );
    await must(
      'matches',
      db.from('matches').insert([
        { id: ids.match, event_id: ids.event, match_type: 'qualification', number: 1 },
        { id: ids.replayMatch, event_id: ids.event, match_type: 'qualification', number: 2 },
      ]),
    );
    await must(
      'user',
      db.from('users').insert({
        id: ids.user,
        username: fx.username,
        full_name: 'CI User',
        password_hash: await bcrypt.hash(fx.password, 10),
        role: 'scouter',
      }),
    );
    await must(
      'form',
      db
        .from('forms')
        .insert({ id: ids.form, season_id: ids.season, kind: 'match', name: 'CI form' }),
    );
    await must(
      'form version',
      db.from('form_versions').insert({
        id: ids.version,
        form_id: ids.form,
        version_no: 1,
        published_at: new Date().toISOString(),
      }),
    );
    await must(
      'form field',
      db.from('form_fields').insert({
        id: ids.field,
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
      }),
    );
    // The statistics read the season's match form through its ACTIVE version and the form's
    // rules (SPEC-FINAL 5.1); without both, every entry scores nothing.
    await must(
      'active version',
      db.from('forms').update({ active_version_id: ids.version }).eq('id', ids.form),
    );
    await must(
      'scoring rule',
      db.from('scoring_rules').insert({
        id: ids.rule,
        form_id: ids.form,
        field_key: 'ci_counter',
        points: CI_POINTS_PER_UNIT,
      }),
    );

    // Both sync routes and every registry route but two need a bearer (SPEC-FINAL 7.5).
    return await login(base, fx);
  } catch (e) {
    await tearDownCiSeason(db, fx).catch((t: unknown) => console.error(t));
    throw e;
  }
}

export async function login(base: string, fx: CiFixture): Promise<string> {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: fx.username, password: fx.password }),
  });
  if (res.status !== 200) throw new Error(`CI login failed with HTTP ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

/**
 * Removes every row the run wrote, then counts them back and throws if any survived. Idempotent:
 * safe after a setup that failed halfway, and safe to run twice. Entries go first, because
 * scouting_entries.match_id and team_id are ON DELETE RESTRICT; the season delete cascades to
 * the event, its matches, roster and conflicts, and the form with its version, field and rule.
 */
export async function tearDownCiSeason(db: SupabaseClient, fx: CiFixture): Promise<void> {
  const { ids } = fx;
  const formRows = [ids.form, ids.version, ids.field, ids.rule];
  const problems: string[] = [];
  const step = async (label: string, query: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await query;
    if (error) problems.push(`${label}: ${error.message}`);
  };

  await step('entries', db.from('scouting_entries').delete().eq('event_id', ids.event));
  await step('season', db.from('seasons').delete().eq('id', ids.season));
  await step('user', db.from('users').delete().eq('id', ids.user));
  await step('team', db.from('teams').delete().eq('id', ids.team));
  await step('match tombstones', db.from('match_deletions').delete().eq('event_id', ids.event));
  await step(
    'form tombstones',
    db
      .from('form_deletions')
      .delete()
      .or(`season_id.eq.${ids.season},row_id.in.(${formRows.join(',')})`),
  );
  // Safe to clear: these op_ids were random to this run, and the rows they wrote are gone.
  if (fx.ops.length > 0) {
    await step('op ledger', db.from('applied_operations').delete().in('op_id', fx.ops));
  }

  const left = async (
    label: string,
    query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  ) => {
    const { count, error } = await query;
    if (error) problems.push(`count ${label}: ${error.message}`);
    else if (count) problems.push(`${count} ${label} row(s) left`);
  };
  const head = { count: 'exact', head: true } as const;
  await left('seasons', db.from('seasons').select('id', head).eq('id', ids.season));
  await left('events', db.from('events').select('id', head).eq('id', ids.event));
  await left('matches', db.from('matches').select('id', head).eq('event_id', ids.event));
  await left(
    'scouting_entries',
    db.from('scouting_entries').select('id', head).eq('event_id', ids.event),
  );
  await left('forms', db.from('forms').select('id', head).eq('id', ids.form));
  await left('users', db.from('users').select('id', head).eq('id', ids.user));
  await left('teams', db.from('teams').select('id', head).eq('id', ids.team));
  await left(
    'match_deletions',
    db.from('match_deletions').select('match_id', head).eq('event_id', ids.event),
  );
  await left(
    'form_deletions',
    db
      .from('form_deletions')
      .select('row_id', head)
      .or(`season_id.eq.${ids.season},row_id.in.(${formRows.join(',')})`),
  );
  if (fx.ops.length > 0) {
    await left(
      'applied_operations',
      db.from('applied_operations').select('op_id', head).in('op_id', fx.ops),
    );
  }

  // Non-secret ids, so a person can re-check (or finish cleaning) dev by hand after a run.
  const runIds = JSON.stringify({ season: ids.season, event: ids.event, formRows, ops: fx.ops });
  if (problems.length > 0) {
    throw new Error(`CI teardown did not leave dev clean ${runIds}:\n- ${problems.join('\n- ')}`);
  }
  console.warn(`CI teardown: no CI rows left ${runIds}`);
}

/**
 * season.year is unique, so a CI season left by a run that was killed before its teardown would
 * fail every later run at its first insert. One older than STALE_AFTER_MS is swept; a younger one
 * is another run in progress, and this run stops rather than delete it under that run's feet.
 * The active season is never touched.
 */
async function clearStaleCiSeason(db: SupabaseClient): Promise<void> {
  const { data: seasons, error } = await db
    .from('seasons')
    .select('id, created_at')
    .eq('year', CI_YEAR);
  if (error) throw new Error(`CI setup: reading CI seasons failed: ${error.message}`);
  const season = seasons?.[0] as { id: string; created_at: string } | undefined;
  if (!season) return;

  const { data: settings } = await db.from('app_settings').select('active_season_id');
  if ((settings ?? []).some((s) => s.active_season_id === season.id)) {
    throw new Error(`CI setup: the ${CI_YEAR} season is dev's active season; refusing to touch it`);
  }
  const age = Date.now() - new Date(season.created_at).getTime();
  if (age < STALE_AFTER_MS) {
    throw new Error(
      `CI setup: another smoke run created the CI season ${Math.round(age / 1000)}s ago; run again once it finishes`,
    );
  }

  const { data: events } = await db.from('events').select('id').eq('season_id', season.id);
  const eventIds = (events ?? []).map((e) => e.id as string);
  const { data: roster } = eventIds.length
    ? await db.from('event_teams').select('team_id').in('event_id', eventIds)
    : { data: [] };
  // A cascaded child's tombstone has a null season_id, so the form rows' ids are read first.
  const { data: forms } = await db.from('forms').select('id').eq('season_id', season.id);
  const formIds = (forms ?? []).map((f) => f.id as string);
  const { data: versions } = formIds.length
    ? await db.from('form_versions').select('id').in('form_id', formIds)
    : { data: [] };
  const versionIds = (versions ?? []).map((v) => v.id as string);
  const { data: fields } = versionIds.length
    ? await db.from('form_fields').select('id').in('form_version_id', versionIds)
    : { data: [] };
  const { data: rules } = formIds.length
    ? await db.from('scoring_rules').select('id').in('form_id', formIds)
    : { data: [] };
  const formRows = [
    ...formIds,
    ...versionIds,
    ...(fields ?? []).map((f) => f.id as string),
    ...(rules ?? []).map((r) => r.id as string),
  ];

  if (eventIds.length) {
    await must('stale entries', db.from('scouting_entries').delete().in('event_id', eventIds));
  }
  await must('stale season', db.from('seasons').delete().eq('id', season.id));
  if (eventIds.length) {
    await must(
      'stale match tombstones',
      db.from('match_deletions').delete().in('event_id', eventIds),
    );
  }
  await must(
    'stale form tombstones',
    db.from('form_deletions').delete().eq('season_id', season.id),
  );
  if (formRows.length) {
    await must('stale form tombstones', db.from('form_deletions').delete().in('row_id', formRows));
  }
  const teamIds = (roster ?? []).map((r) => r.team_id as string);
  if (teamIds.length) {
    await must(
      'stale teams',
      db.from('teams').delete().in('id', teamIds).eq('name', 'CI Team').gte('number', 900000),
    );
  }
  await must(
    'stale users',
    db
      .from('users')
      .delete()
      .eq('full_name', 'CI User')
      .like('username', 'ci\\_%')
      .lt('created_at', new Date(Date.now() - STALE_AFTER_MS).toISOString()),
  );
  console.warn(`CI setup: swept a stale CI season left by an earlier run (${season.id})`);
}
