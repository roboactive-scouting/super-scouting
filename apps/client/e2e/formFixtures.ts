import type { ScoredFieldRow, VersionSummary } from '@frc/shared';
import { SEASON_ID, SEASONS, userByName } from './fixtures';

/*
 * The design's 2026 match form (docs/design/pages/12-form-builder, 13-forms) for the forms
 * list and the builder (task 1.29): draft v4 (17 fields) over the active, locked v3 (15 fields,
 * 214 entries), v2 and v1; across Auto, Teleop, Endgame and Notes, with the four types the
 * entry form draws today and the rest as the builder's placeholder. A 2027 season has no forms.
 * Every id is fixed, so a screenshot never changes between runs.
 */

const uid = (kind: number, n: number) =>
  `${kind.toString(16).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const SEASON_2027 = {
  ...SEASONS[0]!,
  id: uid(1, 2027),
  year: 2027,
  game_name: 'NEXT',
};
/** listSeasons with 2027 on top (the shared fixture's seasons stay 2024–2026 for Manage). */
export const SEASONS_WITH_2027 = [SEASON_2027, ...SEASONS];

export const MATCH_FORM_ID = uid(8, 26);
const VERSION_ID = { 1: uid(9, 261), 2: uid(9, 262), 3: uid(9, 263), 4: uid(9, 264) } as const;
const noa = { id: userByName('noa.levi').id, full_name: 'Noa Levi' };

type Seed = Partial<ScoredFieldRow> & Pick<ScoredFieldRow, 'key' | 'label' | 'type'>;

const counter = (
  key: string,
  label: string,
  help: string,
  phase: ScoredFieldRow['phase'],
  points: number | null,
): Seed => ({
  key,
  label,
  type: 'counter',
  help_text: help,
  phase,
  unit: 'count',
  direction: 'higher_is_better',
  description: `${label} (${help.toLowerCase()})`,
  config: { min: 0, max: 20, step: 1 },
  points,
});

const MIRROR = { mirror_axis: 'horizontal' };

/** v3's fifteen data fields, in display order. */
const BASE: Seed[] = [
  {
    key: 'auto_leave',
    label: 'Left the start zone',
    type: 'toggle',
    phase: 'auto',
    unit: 'boolean',
    config: {},
    points: 3,
  },
  counter('auto_high', 'Pieces scored high', 'Upper goal', 'auto', 6),
  counter('auto_low', 'Pieces scored low', 'Lower goal', 'auto', 3),
  {
    key: 'auto_start',
    label: 'Start position',
    help_text: 'Where the robot started',
    type: 'position',
    phase: 'auto',
    unit: 'coordinate',
    direction: 'neutral',
    config: { multi_point: false, ...MIRROR },
  },
  counter('tele_high', 'Pieces scored high', 'Upper goal', 'teleop', 4),
  counter('tele_low', 'Pieces scored low', 'Lower goal', 'teleop', 2),
  {
    key: 'tele_cycle_routes',
    label: 'Cycle routes',
    help_text: 'The route of each cycle',
    type: 'cycle_path',
    phase: 'teleop',
    unit: 'coordinate',
    direction: 'neutral',
    config: { max_points_per_cycle: 6, ...MIRROR },
  },
  {
    key: 'tele_defence',
    label: 'Played defence',
    type: 'toggle',
    phase: 'teleop',
    unit: 'boolean',
    direction: 'neutral',
    section: 'Defence',
    config: {},
  },
  {
    ...counter('tele_fouls', 'Fouls', 'Penalties called on it', 'teleop', null),
    direction: 'lower_is_better',
    section: 'Defence',
  },
  {
    key: 'end_climb',
    label: 'Climb level',
    help_text: 'Highest bar at the end of the match',
    type: 'single_select',
    phase: 'endgame',
    unit: 'enum',
    is_ordinal: true,
    config: {
      is_ordinal: true,
      options: [
        { value: 'none', label: 'None' },
        { value: 'park', label: 'Parked' },
        { value: 'low', label: 'Low bar' },
        { value: 'high', label: 'High bar' },
      ],
    },
    points: 0,
    option_points: { none: 0, park: 2, low: 6, high: 12 },
  },
  {
    key: 'end_climb_time',
    label: 'Climb time',
    help_text: 'From starting the climb to hanging',
    type: 'timer',
    phase: 'endgame',
    unit: 'seconds',
    direction: 'lower_is_better',
    config: { allow_unsure: true },
  },
  {
    key: 'post_driver',
    label: 'Driver skill',
    type: 'rating',
    phase: 'post_match',
    category: 'driver skill',
    config: { max: 5, style: 'stars' },
  },
  {
    key: 'post_total',
    label: 'Total pieces scored',
    type: 'computed',
    phase: 'post_match',
    config: {
      expression: {
        kind: 'op',
        op: '+',
        left: { kind: 'field', key: 'auto_high' },
        right: { kind: 'field', key: 'tele_high' },
      },
      result_type: 'float',
    },
  },
  {
    key: 'post_notes',
    label: 'Notes',
    help_text: 'Anything a strategy lead should know',
    type: 'long_text',
    phase: 'post_match',
    unit: 'text',
    direction: 'neutral',
    config: {},
  },
];

/** What draft v4 adds: the two "fields added". */
const ADDED: Seed[] = [
  {
    key: 'auto_score_spots',
    label: 'Scoring spots',
    help_text: 'Where it scored from',
    type: 'position',
    phase: 'auto',
    unit: 'coordinate',
    direction: 'neutral',
    config: { multi_point: true, ...MIRROR },
  },
  {
    key: 'tele_shots',
    label: 'Shots',
    help_text: 'Tap the goal each time it shoots, then where it shot from',
    type: 'event_log',
    phase: 'teleop',
    unit: 'count',
    config: {
      event_types: [
        { value: 'high', label: 'High goal' },
        { value: 'low', label: 'Low goal' },
        { value: 'miss', label: 'Missed' },
      ],
      ask_position: true,
      ...MIRROR,
    },
  },
];

function rows(seeds: Seed[], versionNo: 3 | 4): ScoredFieldRow[] {
  return seeds.map((s, i) => ({
    id: uid(10, versionNo * 100 + i + 1),
    form_version_id: VERSION_ID[versionNo],
    help_text: null,
    section: null,
    display_order: i + 1,
    required: false,
    default_value: null,
    visibility_condition: null,
    deprecated: false,
    description: `${s.label}, as the scout saw it`,
    unit: 'count',
    direction: 'higher_is_better',
    category: null,
    expected_range: null,
    include_in_ai_context: null,
    is_ordinal: null,
    points: null,
    option_points: null,
    config: {},
    phase: 'teleop',
    ...s,
  }));
}

/** v4 places each added field at the end of its phase's run. */
const V4_SEEDS: Seed[] = [
  ...BASE.slice(0, 4),
  ADDED[0]!,
  ...BASE.slice(4, 6),
  ADDED[1]!,
  ...BASE.slice(6),
];

export const FIELDS = { 3: rows(BASE, 3), 4: rows(V4_SEEDS, 4) };

const summary = (versionNo: 1 | 2 | 3 | 4, over: Partial<VersionSummary>): VersionSummary => ({
  id: VERSION_ID[versionNo],
  version_no: versionNo,
  status: 'published',
  published_at: '2026-10-02T09:00:00.000Z',
  is_active: false,
  is_locked: true,
  field_count: 15,
  entry_count: 0,
  updated_at: '2026-10-02T09:00:00.000Z',
  updated_by: noa,
  ...over,
});

export const VERSIONS: VersionSummary[] = [
  summary(4, {
    status: 'draft',
    published_at: null,
    is_locked: false,
    field_count: 17,
    updated_at: '2026-10-08T08:48:00.000Z',
  }),
  summary(3, { is_active: true, entry_count: 214 }),
  summary(2, {
    field_count: 14,
    entry_count: 38,
    published_at: '2026-09-20T09:00:00.000Z',
    updated_at: '2026-09-20T09:00:00.000Z',
  }),
  summary(1, {
    field_count: 12,
    entry_count: 12,
    published_at: '2026-09-05T09:00:00.000Z',
    updated_at: '2026-09-05T09:00:00.000Z',
  }),
];

const FORM_ROW = {
  id: MATCH_FORM_ID,
  season_id: SEASON_ID,
  kind: 'match' as const,
  name: 'Match form',
  active_version_id: VERSION_ID[3],
  timer_config: {
    phases: [
      { phase: 'auto' as const, seconds: 15 },
      { phase: 'teleop' as const, seconds: 135 },
      { phase: 'endgame' as const, seconds: 30 },
    ],
  },
  created_at: '2026-09-01T09:00:00.000Z',
  updated_at: '2026-10-08T08:48:00.000Z',
};

/** The forms use cases, by name; a function receives the call's input. */
export const FORMS_RPC: Record<string, (input: Record<string, unknown>) => unknown> = {
  listForms: (input) => ({
    season_id: input.season_id,
    forms:
      input.season_id === SEASON_ID
        ? [
            {
              id: FORM_ROW.id,
              kind: FORM_ROW.kind,
              name: FORM_ROW.name,
              active_version_id: FORM_ROW.active_version_id,
              updated_at: FORM_ROW.updated_at,
              versions: VERSIONS,
            },
          ]
        : [],
  }),
  getForm: () => ({ ...FORM_ROW, versions: VERSIONS }),
  getFormVersion: (input) => {
    const version = VERSIONS.find((v) => v.id === input.form_version_id) ?? VERSIONS[1]!;
    const fields = version.version_no === 4 ? FIELDS[4] : FIELDS[3];
    return {
      ...version,
      form_id: MATCH_FORM_ID,
      fields: fields.map((f) => ({ ...f, form_version_id: version.id })),
    };
  },
};
