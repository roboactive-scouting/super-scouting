import type { FormFieldDefinition } from '@frc/shared';
import type { FakeContext, FakeRow } from './fake-context.js';

/**
 * Task 1.50: the browse-and-search fixture (`ctx.seedSmallSeason()`), as the plan's test reads it.
 *
 * - Season se-1 with events ev-1 (active; sort 1) and ev-2 (sort 2).
 * - Teams t-1 2096 ROBACTIVE and t-2 1690 Orbit on ev-1's roster; t-2 and t-3 3065 Jatt on
 *   ev-2's. So t-3 is in the season but not at ev-1 (rank null).
 * - The match form fm-1: v1 (fv-m1, retired, one field) and the ACTIVE v2 (fv-m2), with fields
 *   in all four phases and scoring rules. The super form fs-1, active v1 (fv-s1).
 * - Matches at ev-1: Q1–Q4 and P1; at ev-2: Q1.
 * - Entries e-1..e-12 at ev-1, both kinds. t-1 averages 25 over Q1 (35) and Q2 (15) — its Q3 is
 *   a no-show and its Q4 disabled, its P1 practice — and t-2 averages 5.5, so t-1 ranks 1.
 *   e-1 is Seed Scouter's played Q1 entry; e-9 is on the retired v1 and scores by v2's rules.
 * - ev-2's entries (e-21, e-22) are t-2's and t-3's, so listTeamEvents('t-1') is ['ev-1'].
 */
export const SMALL_SEASON = {
  season: 'se-1',
  activeEvent: 'ev-1',
  otherEvent: 'ev-2',
  seedScouter: 'u-seed',
  matchForm: 'fm-1',
  activeMatchVersion: 'fv-m2',
  oldMatchVersion: 'fv-m1',
  superForm: 'fs-1',
  superVersion: 'fv-s1',
} as const;

const AT = '2026-11-01T09:00:00.000Z';

const CLIMB = {
  options: [
    { value: 'none', label: 'None' },
    { value: 'park', label: 'Parked' },
    { value: 'deep', label: 'Deep cage' },
  ],
};

function field(
  key: string,
  type: FormFieldDefinition['type'],
  phase: FormFieldDefinition['phase'],
  display_order: number,
  over: Partial<FormFieldDefinition> = {},
): FormFieldDefinition {
  return {
    id: `ff-${key}`,
    key,
    label: key.replace(/_/g, ' '),
    help_text: null,
    type,
    section: null,
    display_order,
    required: false,
    default_value: null,
    config: {},
    visibility_condition: null,
    deprecated: false,
    description: 'x',
    unit: type === 'toggle' ? 'boolean' : 'count',
    phase,
    direction: 'higher_is_better',
    category: null,
    expected_range: null,
    include_in_ai_context: null,
    is_ordinal: null,
    ...over,
  };
}

/** Minute `n` of the morning: entry e-n was created at 08:0n, so e-12 is the newest. */
const stamp = (n: number) => new Date(Date.UTC(2026, 10, 14, 8, n)).toISOString();

export function seedSmallSeason(ctx: FakeContext): void {
  const S = SMALL_SEASON;
  ctx.usersById.set(S.seedScouter, {
    id: S.seedScouter,
    username: 'seed_scouter',
    full_name: 'Seed Scouter',
    role: 'scouter',
    password_hash: 'x',
    must_change_password: false,
    disabled_at: null,
    created_at: AT,
  });

  ctx.seasons.set(S.season, {
    id: S.season,
    year: 2026,
    game_name: 'Reefscape',
    field_image_path: 'p',
    created_at: AT,
    updated_at: AT,
  });
  const event = (id: string, name: string, sort_order: number) =>
    ctx.events.set(id, {
      id,
      season_id: S.season,
      name,
      code: null,
      sort_order,
      created_at: AT,
      updated_at: AT,
    });
  event(S.activeEvent, 'District #3 · Tel Aviv', 1);
  event(S.otherEvent, "District #2 · Be'er Sheva", 2);
  ctx.setActiveContext(S.season, S.activeEvent);

  for (const [id, number, name] of [
    ['t-1', 2096, 'ROBACTIVE'],
    ['t-2', 1690, 'Orbit'],
    ['t-3', 3065, 'Jatt'],
  ] as const) {
    ctx.teams.set(id, { id, number, name, created_at: AT, updated_at: AT });
  }
  ctx.roster.set(S.activeEvent, ['t-1', 't-2']);
  ctx.roster.set(S.otherEvent, ['t-2', 't-3']);

  const match = (id: string, event_id: string, match_type: string, number: number) =>
    ctx.matches.set(id, { id, event_id, match_type, number });
  match('m-1', S.activeEvent, 'qualification', 1);
  match('m-2', S.activeEvent, 'qualification', 2);
  match('m-3', S.activeEvent, 'qualification', 3);
  match('m-4', S.activeEvent, 'qualification', 4);
  match('m-p1', S.activeEvent, 'practice', 1);
  match('m-21', S.otherEvent, 'qualification', 1);

  // The forms: match (v1 retired, v2 active) and super.
  const form = (id: string, kind: 'match' | 'super', active: string) =>
    ctx.forms.set(id, {
      id,
      version: 1,
      season_id: S.season,
      kind,
      name: kind === 'match' ? 'Match' : 'Super',
      active_version_id: active,
      timer_config: { phases: [] },
      created_at: AT,
      updated_at: AT,
    });
  form(S.matchForm, 'match', S.activeMatchVersion);
  form(S.superForm, 'super', S.superVersion);
  const version = (id: string, form_id: string, version_no: number) =>
    ctx.formVersions.set(id, {
      id,
      version: 1,
      form_id,
      version_no,
      published_at: AT,
      is_locked: true,
      updated_by: null,
      created_at: AT,
      updated_at: AT,
    });
  version(S.oldMatchVersion, S.matchForm, 1);
  version(S.activeMatchVersion, S.matchForm, 2);
  version(S.superVersion, S.superForm, 1);
  const fields = (versionId: string, list: FormFieldDefinition[]) => {
    for (const f of list) {
      ctx.formFields.set(`${versionId}:${f.key}`, {
        ...f,
        id: `${versionId}-${f.id}`,
        form_version_id: versionId,
      } as FormFieldDefinition);
    }
  };
  fields(S.oldMatchVersion, [field('auto_leave', 'toggle', 'auto', 1)]);
  fields(S.activeMatchVersion, [
    field('auto_leave', 'toggle', 'auto', 1),
    field('auto_notes', 'counter', 'auto', 2, { config: { min: 0, max: 10, step: 1 } }),
    field('tele_notes', 'counter', 'teleop', 3, { config: { min: 0, max: 30, step: 1 } }),
    field('climb', 'single_select', 'endgame', 4, {
      config: CLIMB,
      is_ordinal: true,
      unit: 'enum',
    }),
    field('comments', 'long_text', 'post_match', 5, { unit: 'text', direction: 'neutral' }),
  ]);
  fields(S.superVersion, [
    field('driver_skill', 'rating', 'teleop', 1, { config: { max: 5 } }),
    field('notes', 'long_text', 'post_match', 2, { unit: 'text', direction: 'neutral' }),
  ]);
  const rule = (field_key: string, points: number, option_points: Record<string, number> | null) =>
    ctx.scoringRules.set(`${S.matchForm}:${field_key}`, {
      id: `sr-${field_key}`,
      version: 1,
      form_id: S.matchForm,
      field_key,
      points,
      option_points,
      created_at: AT,
      updated_at: AT,
    });
  rule('auto_leave', 3, null);
  rule('auto_notes', 5, null);
  rule('tele_notes', 2, null);
  rule('climb', 0, { none: 0, park: 2, deep: 12 });

  let minute = 0;
  const entry = (
    id: string,
    over: Partial<Record<string, unknown>> & { team_id: string },
  ): void => {
    minute += 1;
    const row: FakeRow = {
      id,
      version: 1,
      form_version_id: S.activeMatchVersion,
      form_kind: 'match',
      event_id: S.activeEvent,
      match_id: null,
      alliance: null,
      scouter_id: S.seedScouter,
      robot_status: 'played',
      breakdown_seconds: null,
      data: {},
      created_at: stamp(minute),
      updated_at: stamp(minute),
      client_created_at: stamp(minute),
      client_updated_at: stamp(minute),
      deleted_at: null,
      ...over,
    };
    ctx.rows.scouting_entries.set(id, row);
  };
  const red = { alliance: 'red' };
  const blue = { alliance: 'blue' };
  // t-1 at ev-1: 35 and 15 counted (avg 25); a no-show, a disabled robot and a practice match.
  entry('e-1', {
    team_id: 't-1',
    match_id: 'm-1',
    ...red,
    data: { auto_leave: true, auto_notes: 2, tele_notes: 5, climb: 'deep', comments: 'Fast' },
  });
  entry('e-2', {
    team_id: 't-1',
    match_id: 'm-2',
    ...red,
    data: { auto_notes: 1, tele_notes: 4, climb: 'park' },
  });
  entry('e-3', { team_id: 't-1', match_id: 'm-3', ...red, robot_status: 'no_show' });
  // t-2 at ev-1: 9, 8, 2 and 3 (on the retired v1, scored by v2's rules) — avg 5.5.
  entry('e-4', {
    team_id: 't-2',
    match_id: 'm-1',
    ...blue,
    scouter_id: 'u-scouter',
    data: { auto_notes: 1, tele_notes: 2 },
  });
  entry('e-5', {
    team_id: 't-2',
    match_id: 'm-2',
    ...blue,
    scouter_id: 'u-scouter',
    data: { tele_notes: 3, climb: 'park' },
  });
  entry('e-6', {
    team_id: 't-2',
    match_id: 'm-3',
    ...blue,
    scouter_id: 'u-scouter',
    robot_status: 'broke_down',
    breakdown_seconds: 40,
    data: { tele_notes: 1 },
  });
  entry('e-7', { team_id: 't-1', match_id: 'm-4', ...red, robot_status: 'disabled' });
  entry('e-8', {
    team_id: 't-2',
    match_id: 'm-p1',
    ...blue,
    scouter_id: 'u-scouter',
    data: { tele_notes: 10 },
  });
  entry('e-9', {
    team_id: 't-2',
    match_id: 'm-4',
    ...blue,
    scouter_id: 'u-scouter',
    form_version_id: S.oldMatchVersion,
    data: { auto_leave: true },
  });
  // Super entries: one running judgement per team (match_id null, no robot status).
  entry('e-10', {
    team_id: 't-1',
    form_kind: 'super',
    form_version_id: S.superVersion,
    robot_status: null,
    data: { driver_skill: 4, notes: 'Smooth driver' },
  });
  entry('e-11', {
    team_id: 't-2',
    form_kind: 'super',
    form_version_id: S.superVersion,
    scouter_id: 'u-scouter',
    robot_status: null,
    data: { driver_skill: 2 },
  });
  entry('e-12', {
    team_id: 't-1',
    match_id: 'm-p1',
    ...red,
    data: { auto_notes: 3 },
  });
  // ev-2: other teams only.
  entry('e-21', {
    team_id: 't-2',
    match_id: 'm-21',
    event_id: S.otherEvent,
    ...blue,
    data: { tele_notes: 6 },
  });
  entry('e-22', {
    team_id: 't-3',
    match_id: 'm-21',
    event_id: S.otherEvent,
    ...red,
    data: { tele_notes: 7 },
  });
}
