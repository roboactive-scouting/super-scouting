import { describe, expect, it, beforeAll } from 'vitest';
import { serviceClient } from './client';
import { SEED } from '../src/seed/fixtures';
import { seedDevDatabase } from '../src/seed/seed';

const db = serviceClient();

beforeAll(async () => {
  await seedDevDatabase(db);
});

describe('dev seed (SPEC-FINAL 19.7)', () => {
  it('creates the fake season, one event and about thirty teams', async () => {
    const season = await db.from('seasons').select('*').eq('id', SEED.season).single();
    expect(season.data!.year).toBe(SEED.year);
    const events = await db.from('events').select('id').eq('season_id', SEED.season);
    expect(events.data!.length).toBeGreaterThanOrEqual(1);
    const roster = await db.from('event_teams').select('id').eq('event_id', SEED.event);
    expect(roster.data!.length).toBe(30);
  });

  it('creates a published match form with two versions and scoring rules', async () => {
    const versions = await db.from('form_versions').select('*').eq('form_id', SEED.matchForm);
    expect(versions.data!.length).toBe(2);
    const form = await db
      .from('forms')
      .select('active_version_id')
      .eq('id', SEED.matchForm)
      .single();
    expect(form.data!.active_version_id).toBe(SEED.formVersion);
    const rules = await db.from('scoring_rules').select('field_key').eq('form_id', SEED.matchForm);
    expect(rules.data!.length).toBeGreaterThan(0);
  });

  it('gives the match form its fields too — the ids must not collide across versions', async () => {
    for (const versionId of [SEED.formVersionOld, SEED.formVersion]) {
      const fields = await db.from('form_fields').select('key').eq('form_version_id', versionId);
      expect(fields.data!.map((f) => f.key).sort(), versionId).toEqual([
        'auto_left_zone',
        'auto_notes',
        'endgame_climb',
        'notes',
        'teleop_notes',
      ]);
    }
  });

  it('creates a published super form with its own fields, so both v1 kinds exist', async () => {
    const form = await db
      .from('forms')
      .select('kind, active_version_id')
      .eq('id', SEED.superForm)
      .single();
    expect(form.data!.kind).toBe('super');
    expect(form.data!.active_version_id).toBe(SEED.superFormVersion);
    const fields = await db
      .from('form_fields')
      .select('key')
      .eq('form_version_id', SEED.superFormVersion);
    expect(fields.data!.map((f) => f.key).sort()).toEqual(['driver_skill', 'super_notes']);
  });

  it('creates about a hundred scouting entries, all bound to a form version', async () => {
    const entries = await db
      .from('scouting_entries')
      .select('id, form_version_id')
      .eq('event_id', SEED.event);
    expect(entries.data!.length).toBeGreaterThanOrEqual(100);
    expect(entries.data!.every((e) => e.form_version_id !== null)).toBe(true);
  });

  it('sets the active context to the seeded season and event', async () => {
    const settings = await db.from('app_settings').select('*').eq('id', true).single();
    expect(settings.data!.active_season_id).toBe(SEED.season);
    expect(settings.data!.active_event_id).toBe(SEED.event);
  });

  it('creates one seeded user per role and depends on no personal identity', async () => {
    const users = await db
      .from('users')
      .select('username, full_name, role')
      .in('id', [SEED.scouter, SEED.lead, SEED.admin]);
    expect(users.data!.map((u) => u.role).sort()).toEqual(['admin', 'lead', 'scouter']);
    for (const user of users.data!) {
      expect(user.username).toMatch(/^seed_/);
      expect(user.full_name).toMatch(/^Seed /);
      expect(JSON.stringify(user)).not.toMatch(/@/);
    }
  });

  it('never records a zero for a dead robot', async () => {
    const dead = await db
      .from('scouting_entries')
      .select('robot_status, data')
      .eq('event_id', SEED.event)
      .in('robot_status', ['no_show', 'disabled']);
    expect(dead.data!.length).toBeGreaterThan(0);
    for (const row of dead.data!) expect(row.data).toEqual({});
  });

  it('is idempotent — running it twice changes nothing', async () => {
    await seedDevDatabase(db);
    const entries = await db.from('scouting_entries').select('id').eq('event_id', SEED.event);
    expect(entries.data!.length).toBeLessThan(200);
  });

  it('refuses to run against a URL that is not the dev project', async () => {
    await expect(seedDevDatabase(db, { requireUrlToContain: 'not-this-project' })).rejects.toThrow(
      /dev/i,
    );
  });
});
