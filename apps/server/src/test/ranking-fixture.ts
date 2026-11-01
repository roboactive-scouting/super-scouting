import type { FormFieldDefinition } from '@frc/shared';
import type { FakeContext, FakeRow } from './fake-context.js';

/**
 * Task 1.57: the statistics fixture (`ctx.seedRankingFixture()`), as the plan's test reads it.
 *
 * - Season se-1, event ev-1 (active), teams t-1 2096 ROBACTIVE, t-2 1690 Orbit and t-3 3065
 *   Jatt, all three on ev-1's roster. Matches Q1–Q3 and P1.
 * - The match form fm-1: v1 (fv-m1, retired) and the ACTIVE v2 (fv-m2) with a field of every
 *   scorable shape — a toggle, two counters, an ordinal climb, a nominal pickup, a neutral
 *   defense toggle — and a Long-text "Notes". Rules on auto_leave, auto_notes, tele_notes, climb.
 *   The super form fs-1, active v1 (fv-s1), with its own Long-text "Notes".
 * - t-1: Q1 10 points, Q2 20 points, Q3 a no-show — average 15, availability 2 of 3. Each has
 *   a note, by Seed Scouter, and t-1 has a super entry with a note too.
 * - t-2: Q1 12 points (played) and Q2 12 points (broke down) — average 12, by Fixture scouter.
 * - t-3: P1 only (30 points, practice) — no average, no availability.
 */
export const RANKING_FIXTURE = {
  season: 'se-1',
  event: 'ev-1',
  seedScouter: 'u-seed',
  matchForm: 'fm-1',
  activeMatchVersion: 'fv-m2',
  oldMatchVersion: 'fv-m1',
  superForm: 'fs-1',
  superVersion: 'fv-s1',
} as const;

const AT = '2026-11-01T09:00:00.000Z';

function field(
  key: string,
  label: string,
  type: FormFieldDefinition['type'],
  phase: FormFieldDefinition['phase'],
  display_order: number,
  over: Partial<FormFieldDefinition> = {},
): FormFieldDefinition {
  return {
    id: `ff-${key}`,
    key,
    label,
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

/** Minute `n` of the morning; later entries are newer. */
const stamp = (n: number) => new Date(Date.UTC(2026, 10, 14, 8, n)).toISOString();

const fieldsKeyOf = (versionId: string, key: string) => `${versionId}:${key}`;

export function seedRankingFixture(ctx: FakeContext): void {
  const S = RANKING_FIXTURE;
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
  ctx.events.set(S.event, {
    id: S.event,
    season_id: S.season,
    name: 'District #3 · Tel Aviv',
    code: null,
    sort_order: 1,
    created_at: AT,
    updated_at: AT,
  });
  ctx.setActiveContext(S.season, S.event);
  for (const [id, number, name] of [
    ['t-1', 2096, 'ROBACTIVE'],
    ['t-2', 1690, 'Orbit'],
    ['t-3', 3065, 'Jatt'],
  ] as const) {
    ctx.teams.set(id, { id, number, name, created_at: AT, updated_at: AT });
  }
  ctx.roster.set(S.event, ['t-1', 't-2', 't-3']);
  for (const [id, match_type, number] of [
    ['m-1', 'qualification', 1],
    ['m-2', 'qualification', 2],
    ['m-3', 'qualification', 3],
    ['m-p1', 'practice', 1],
  ] as const) {
    ctx.matches.set(id, { id, event_id: S.event, match_type, number });
  }

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
      ctx.formFields.set(fieldsKeyOf(versionId, f.key), {
        ...f,
        id: `${versionId}-${f.id}`,
        form_version_id: versionId,
      } as FormFieldDefinition);
    }
  };
  const autoNotes = field('auto_notes', 'Auto notes', 'counter', 'auto', 2, {
    config: { min: 0, max: 10, step: 1 },
  });
  fields(S.oldMatchVersion, [field('auto_leave', 'Leave', 'toggle', 'auto', 1), autoNotes]);
  fields(S.activeMatchVersion, [
    field('auto_leave', 'Leave', 'toggle', 'auto', 1),
    autoNotes,
    field('tele_notes', 'Teleop notes', 'counter', 'teleop', 3, {
      config: { min: 0, max: 30, step: 1 },
    }),
    field('pickup', 'Pickup', 'single_select', 'teleop', 4, {
      unit: 'enum',
      config: {
        options: [
          { value: 'floor', label: 'Floor' },
          { value: 'station', label: 'Station' },
        ],
      },
    }),
    field('defense', 'Played defense', 'toggle', 'teleop', 5, { direction: 'neutral' }),
    field('climb', 'Climb', 'single_select', 'endgame', 6, {
      unit: 'enum',
      is_ordinal: true,
      config: {
        options: [
          { value: 'none', label: 'None' },
          { value: 'park', label: 'Parked' },
          { value: 'deep', label: 'Deep' },
        ],
      },
    }),
    field('notes', 'Notes', 'long_text', 'post_match', 7, { unit: 'text', direction: 'neutral' }),
  ]);
  fields(S.superVersion, [
    field('driver_skill', 'Driver skill', 'rating', 'teleop', 1, { config: { max: 5 } }),
    field('notes', 'Notes', 'long_text', 'post_match', 2, { unit: 'text', direction: 'neutral' }),
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
  rule('auto_leave', 2, null);
  rule('auto_notes', 5, null);
  rule('tele_notes', 2, null);
  rule('climb', 0, { none: 0, park: 2, deep: 6 });

  let minute = 0;
  const entry = (id: string, over: Partial<Record<string, unknown>> & { team_id: string }) => {
    minute += 1;
    const row: FakeRow = {
      id,
      version: 1,
      form_version_id: S.activeMatchVersion,
      form_kind: 'match',
      event_id: S.event,
      match_id: null,
      alliance: 'red',
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
  // t-1: 10, 20 and a no-show — average 15 over two matches.
  entry('t-1-match-1', {
    team_id: 't-1',
    match_id: 'm-1',
    data: { auto_notes: 2, climb: 'none', pickup: 'floor', defense: false, notes: 'Slow start' },
  });
  entry('t-1-match-2', {
    team_id: 't-1',
    match_id: 'm-2',
    data: {
      auto_notes: 2,
      tele_notes: 2,
      climb: 'deep',
      pickup: 'floor',
      defense: true,
      notes: 'Climbed deep',
    },
  });
  entry('t-1-super', {
    team_id: 't-1',
    form_kind: 'super',
    form_version_id: S.superVersion,
    robot_status: null,
    alliance: null,
    data: { driver_skill: 4, notes: 'Smooth driver' },
  });
  entry('t-1-match-3', {
    team_id: 't-1',
    match_id: 'm-3',
    robot_status: 'no_show',
    // Values a no-show must never show or count (the scouter filled them in, then changed status).
    data: { auto_notes: 3, climb: 'park', notes: 'Never came out' },
  });
  // t-2: 12 played and 12 broke down — average 12.
  entry('t-2-match-1', {
    team_id: 't-2',
    match_id: 'm-1',
    alliance: 'blue',
    scouter_id: 'u-scouter',
    data: { tele_notes: 6, pickup: 'station' },
  });
  entry('t-2-match-2', {
    team_id: 't-2',
    match_id: 'm-2',
    alliance: 'blue',
    scouter_id: 'u-scouter',
    robot_status: 'broke_down',
    breakdown_seconds: 40,
    data: { auto_leave: true, auto_notes: 2, pickup: 'station' },
  });
  // t-3: a practice match only.
  entry('t-3-practice-1', {
    team_id: 't-3',
    match_id: 'm-p1',
    alliance: 'blue',
    scouter_id: 'u-scouter',
    data: { auto_notes: 6 },
  });
}

/** The form a version belongs to, and the form's active version id. */
function formOfVersion(ctx: FakeContext, versionId: string) {
  const version = ctx.formVersions.get(versionId);
  const form = version ? ctx.forms.get(String(version.form_id)) : undefined;
  return form
    ? { formId: form.id, activeId: String(form.active_version_id ?? versionId) }
    : { formId: null, activeId: versionId };
}

/**
 * Task 1.57: two devices scored the same robot in the same match. Copies `sourceId` as
 * `<sourceId>-dup` (same team, match and kind), `scoreDelta` points higher — added to the first
 * counter or number field a rule scores — and one minute newer (or older) by
 * `client_updated_at`, so the canonical-entry rule (SPEC-FINAL 11.6) must pick one.
 */
export function duplicateEntry(
  ctx: FakeContext,
  sourceId: string,
  options: { scoreDelta: number; newer: boolean },
): void {
  const row = ctx.rows.scouting_entries.get(sourceId);
  if (!row) throw new Error(`duplicateEntry: no entry ${sourceId}`);
  const data = { ...(row.data as Record<string, unknown>) };
  if (options.scoreDelta !== 0) {
    const { formId, activeId } = formOfVersion(ctx, String(row.form_version_id));
    const rule = [...ctx.scoringRules.values()].find((r) => {
      const f = ctx.formFields.get(fieldsKeyOf(activeId, String(r.field_key)));
      return (
        r.form_id === formId &&
        Number(r.points) > 0 &&
        (f?.type === 'counter' || f?.type === 'number')
      );
    });
    if (!rule) throw new Error(`duplicateEntry: nothing scores ${sourceId}'s form by count`);
    const key = String(rule.field_key);
    const held = typeof data[key] === 'number' ? (data[key] as number) : 0;
    data[key] = held + options.scoreDelta / Number(rule.points);
  }
  const shift = options.newer ? 60_000 : -60_000;
  const at = new Date(Date.parse(String(row.client_updated_at)) + shift).toISOString();
  const id = `${sourceId}-dup`;
  ctx.rows.scouting_entries.set(id, {
    ...row,
    id,
    version: 1,
    data,
    created_at: at,
    updated_at: at,
    client_created_at: at,
    client_updated_at: at,
    deleted_at: null,
  });
}

/**
 * Task 1.57 (SPEC-FINAL 11.7): puts `key` with a DIFFERENT type into an older version of the
 * form whose active version holds it (the newest older one, or a new `<active>-old`), and moves
 * that form's oldest live, counted entry (a qualification match, not a no-show or disabled)
 * onto that version, so the changed type is in the aggregation window.
 */
export function changeFieldTypeBetweenVersions(ctx: FakeContext, key: string): void {
  const form = [...ctx.forms.values()].find((f) =>
    ctx.formFields.has(fieldsKeyOf(String(f.active_version_id), key)),
  );
  if (!form) throw new Error(`changeFieldTypeBetweenVersions: no active version holds ${key}`);
  const activeId = String(form.active_version_id);
  const active = ctx.formVersions.get(activeId);
  const activeNo = Number(active?.version_no ?? 1);
  const older = [...ctx.formVersions.values()]
    .filter((v) => v.form_id === form.id && Number(v.version_no) < activeNo)
    .sort((a, b) => Number(b.version_no) - Number(a.version_no))[0];
  const olderId = older?.id ?? `${activeId}-old`;
  if (!older) {
    ctx.formVersions.set(olderId, {
      id: olderId,
      version: 1,
      form_id: form.id,
      version_no: activeNo - 1,
      published_at: AT,
      is_locked: true,
      updated_by: null,
      created_at: AT,
      updated_at: AT,
    });
  }
  const current = ctx.formFields.get(fieldsKeyOf(activeId, key))!;
  ctx.formFields.set(fieldsKeyOf(olderId, key), {
    ...current,
    id: `${olderId}-${key}-changed`,
    form_version_id: olderId,
    type: current.type === 'short_text' ? 'counter' : 'short_text',
    config: {},
  } as FormFieldDefinition);

  const counted = [...ctx.rows.scouting_entries.values()]
    .filter(
      (row) =>
        row.form_version_id === activeId &&
        row.deleted_at == null &&
        row.form_kind === 'match' &&
        row.robot_status !== 'no_show' &&
        row.robot_status !== 'disabled' &&
        ctx.matches.get(String(row.match_id))?.match_type === 'qualification',
    )
    .sort(
      (a, b) => Date.parse(String(a.client_created_at)) - Date.parse(String(b.client_created_at)),
    );
  const moved = counted[0];
  if (!moved) throw new Error('changeFieldTypeBetweenVersions: no counted entry to move');
  ctx.rows.scouting_entries.set(moved.id, { ...moved, form_version_id: olderId });
}
