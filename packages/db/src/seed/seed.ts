import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { SEED, SEED_FIELDS, SEED_SUPER_FIELDS, type SeedField } from './fixtures';

export type SeedOptions = { requireUrlToContain?: string };

const iso = (dayOffset: number, minute: number): string =>
  new Date(Date.UTC(1999, 2, 1 + dayOffset, 9, minute)).toISOString();

/**
 * Fills the DEV project with a fake season (SPEC-FINAL 19.7). Manual by design,
 * idempotent, and never run against production. It writes rows directly and is not
 * a use-case caller, which is what lets it run before auth and roles exist (§16.5).
 */
export async function seedDevDatabase(
  db: SupabaseClient<Database>,
  options: SeedOptions = {},
): Promise<void> {
  const guard = options.requireUrlToContain;
  if (guard !== undefined) {
    // The caller asserts which project this must be. A mismatch stops the run.
    const url = (db as unknown as { supabaseUrl: string }).supabaseUrl ?? '';
    if (!url.includes(guard)) {
      throw new Error(`refusing to seed: this is not the expected dev project (${guard})`);
    }
  }

  await db.from('seasons').upsert({
    id: SEED.season,
    year: SEED.year,
    game_name: 'SEED GAME 1999',
    field_image_path: `seasons/${SEED.year}/field.webp`,
  });

  await db.from('events').upsert({
    id: SEED.event,
    season_id: SEED.season,
    name: 'Seed District Event',
    sort_order: 1,
  });

  await db.from('users').upsert([
    {
      id: SEED.scouter,
      username: 'seed_scouter',
      full_name: 'Seed Scouter',
      password_hash: SEED.passwordHash,
      role: 'scouter',
    },
    {
      id: SEED.lead,
      username: 'seed_lead',
      full_name: 'Seed Lead',
      password_hash: SEED.passwordHash,
      role: 'lead',
    },
    {
      id: SEED.admin,
      username: 'seed_admin',
      full_name: 'Seed Admin',
      password_hash: SEED.passwordHash,
      role: 'admin',
    },
  ]);

  const teams = Array.from({ length: 30 }, (_, i) => ({
    id: SEED.team(i),
    number: 8000 + i,
    name: `Seed Team ${8000 + i}`,
  }));
  await db.from('teams').upsert(teams);
  await db.from('event_teams').upsert(
    teams.map((t, i) => ({ id: SEED.team(500 + i), event_id: SEED.event, team_id: t.id })),
    { onConflict: 'id' },
  );

  await db.from('forms').upsert({
    id: SEED.matchForm,
    season_id: SEED.season,
    kind: 'match',
    name: 'Seed match form',
    timer_config: {
      phases: [
        { phase: 'auto', seconds: 15 },
        { phase: 'teleop', seconds: 135 },
        { phase: 'endgame', seconds: 30 },
      ],
    },
  });
  await db.from('form_versions').upsert([
    {
      id: SEED.formVersionOld,
      form_id: SEED.matchForm,
      version_no: 1,
      published_at: iso(0, 0),
      is_locked: true,
    },
    {
      id: SEED.formVersion,
      form_id: SEED.matchForm,
      version_no: 2,
      published_at: iso(0, 5),
      is_locked: true,
    },
  ]);
  await db.from('forms').update({ active_version_id: SEED.formVersion }).eq('id', SEED.matchForm);

  // The super form: one match form and one super form per season (SPEC-FINAL 3.3).
  await db.from('forms').upsert({
    id: SEED.superForm,
    season_id: SEED.season,
    kind: 'super',
    name: 'Seed super form',
    timer_config: { phases: [] },
  });
  await db.from('form_versions').upsert({
    id: SEED.superFormVersion,
    form_id: SEED.superForm,
    version_no: 1,
    published_at: iso(0, 0),
    is_locked: true,
  });
  await db
    .from('forms')
    .update({ active_version_id: SEED.superFormVersion })
    .eq('id', SEED.superForm);

  // The field id must be unique PER VERSION. Deriving it from the version id by
  // string surgery collapsed all three versions onto one id set, and the upserts
  // then overwrote each other — leaving the match form with no fields at all,
  // silently, because only the last pass survived. Use the fixture allocator.
  const versionFieldSets: [string, SeedField[]][] = [
    [SEED.formVersionOld, SEED_FIELDS],
    [SEED.formVersion, SEED_FIELDS],
    [SEED.superFormVersion, SEED_SUPER_FIELDS],
  ];
  for (const [versionIndex, [versionId, fields]] of versionFieldSets.entries()) {
    await db.from('form_fields').upsert(
      fields.map((f, i) => ({
        id: SEED.formField(versionIndex, i),
        form_version_id: versionId,
        key: f.key,
        label: f.label,
        type: f.type,
        display_order: i + 1,
        required: f.type === 'counter',
        config: f.config,
        description: f.description,
        unit: f.unit,
        phase: f.phase,
        direction: f.direction,
        expected_range: f.expected_range,
        is_ordinal: f.type === 'single_select' ? true : null,
      })),
    );
  }

  await db.from('scoring_rules').upsert(
    SEED_FIELDS.filter((f) => f.points !== null).map((f, i) => ({
      id: SEED.team(900 + i),
      form_id: SEED.matchForm,
      field_key: f.key,
      points: f.points ?? 0,
      option_points: f.option_points,
    })),
    { onConflict: 'form_id,field_key' },
  );

  // 20 qualification matches x 6 robots = 120 entries; a handful of them are dead robots.
  const matches = Array.from({ length: 20 }, (_, i) => ({
    id: SEED.match(i + 1),
    event_id: SEED.event,
    match_type: 'qualification' as const,
    number: i + 1,
  }));
  await db.from('matches').upsert(matches);

  const matchTeams: Database['public']['Tables']['match_teams']['Insert'][] = [];
  const entries: Database['public']['Tables']['scouting_entries']['Insert'][] = [];

  for (let m = 0; m < matches.length; m += 1) {
    for (let slot = 0; slot < 6; slot += 1) {
      const teamIndex = (m * 6 + slot) % teams.length;
      const alliance = slot < 3 ? 'red' : 'blue';
      const station = (slot % 3) + 1;
      matchTeams.push({
        id: SEED.matchTeam(m + 1, slot),
        match_id: matches[m]!.id,
        alliance,
        station,
        team_id: teams[teamIndex]!.id,
      });

      const index = m * 6 + slot;
      const dead = index % 37 === 0;
      const brokeDown = index % 23 === 0 && !dead;
      const status = dead
        ? index % 74 === 0
          ? 'no_show'
          : 'disabled'
        : brokeDown
          ? 'broke_down'
          : 'played';
      entries.push({
        id: SEED.entry(index),
        form_version_id: index % 11 === 0 ? SEED.formVersionOld : SEED.formVersion,
        form_kind: 'match',
        event_id: SEED.event,
        match_id: matches[m]!.id,
        team_id: teams[teamIndex]!.id,
        alliance,
        scouter_id: [SEED.scouter, SEED.lead, SEED.admin][index % 3]!,
        robot_status: status,
        breakdown_seconds: status === 'broke_down' ? 60 + (index % 60) : null,
        // A dead or no-show robot records no field values at all (SPEC-FINAL 8.2).
        data: dead
          ? {}
          : {
              auto_notes: index % 5,
              auto_left_zone: index % 3 !== 0,
              teleop_notes: (index * 7) % 19,
              endgame_climb: ['none', 'park', 'low', 'high'][index % 4],
              notes: index % 9 === 0 ? 'הרובוט היה איטי בסוף המשחק' : '',
            },
        client_created_at: iso(1, index),
        client_updated_at: iso(1, index),
      });
    }
  }

  await db.from('match_teams').upsert(matchTeams);
  await db.from('scouting_entries').upsert(entries);

  await db
    .from('app_settings')
    .update({
      active_season_id: SEED.season,
      active_event_id: SEED.event,
    })
    .eq('id', true);
}
