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

/*
 * Exports and import (task 1.31). The design's clock is 8 October 2026, 12:00 in Tel Aviv
 * (`EXPORTS_NOW`): the newest export was saved two hours before it.
 */
export const EXPORTS_NOW = new Date('2026-10-08T09:00:00Z');
const tamar = { id: userByName('tamar.m').id, full_name: 'Tamar Mizrahi' };

/** A row as a definition carries it: no id, version, flag or points. */
function draftOf(row: ScoredFieldRow) {
  const {
    id: _id,
    form_version_id: _v,
    deprecated: _d,
    points: _p,
    option_points: _o,
    ...draft
  } = row;
  return draft;
}

function definitionOf(rows: ScoredFieldRow[], kind: 'match' | 'super' = 'match') {
  return {
    format: 1,
    kind,
    name: kind === 'match' ? 'Match form' : 'Super form',
    timer_config: FORM_ROW.timer_config,
    fields: rows.map(draftOf),
    scoring_rules: rows
      .filter((r) => (r.points ?? 0) > 0 || Object.values(r.option_points ?? {}).some((p) => p > 0))
      .map((r) => ({ field_key: r.key, points: r.points ?? 0, option_points: r.option_points })),
  };
}

/**
 * The newest saved export: draft v4 as it was exported, plus three fields added and Climb time
 * changed to a number since (design `-import.png`: adds 3, changes 1 type, removes 0).
 */
const EXPORTED_V4 = (() => {
  const rows = FIELDS[4].map((f) =>
    f.key === 'end_climb_time' ? { ...f, type: 'number' as const, config: { min: 0 } } : f,
  );
  const extra = rows.length;
  const add = (
    key: string,
    label: string,
    type: 'counter' | 'toggle',
    phase: ScoredFieldRow['phase'],
    i: number,
  ) => ({
    ...rows.find((f) => f.key === (type === 'toggle' ? 'auto_leave' : 'tele_high'))!,
    id: uid(10, 900 + i),
    key,
    label,
    help_text: null,
    phase,
    display_order: extra + i,
    points: null,
  });
  return [
    ...rows,
    add('tele_traps', 'Trap scores', 'counter', 'teleop', 1),
    add('end_harmony', 'Harmony', 'toggle', 'endgame', 2),
    add('post_fouls', 'Fouls drawn', 'counter', 'post_match', 3),
  ];
})();

const SUPER_ROWS: ScoredFieldRow[] = FIELDS[3]
  .slice(0, 6)
  .map((f) => ({ ...f, points: null, option_points: null }));

const exportRow = (
  n: number,
  label: string,
  kind: 'match' | 'super',
  fieldCount: number,
  by: { id: string; full_name: string },
  savedAt: string,
) => {
  const created = Date.parse(savedAt);
  const expires = created + 24 * 3600_000;
  return {
    id: uid(11, n),
    form_id: kind === 'match' ? MATCH_FORM_ID : null,
    kind,
    label,
    field_count: fieldCount,
    created_by: by,
    created_at: new Date(created).toISOString(),
    expires_at: new Date(expires).toISOString(),
    expires_in_seconds: Math.floor((expires - EXPORTS_NOW.getTime()) / 1000),
  };
};

export const EXPORTS = [
  exportRow(1, 'Match form 2026 · draft v4', 'match', 19, noa, '2026-10-08T07:00:00Z'),
  exportRow(2, 'Match form 2026 · v3', 'match', 15, tamar, '2026-10-07T12:10:00Z'),
  exportRow(3, 'Super form 2025 · v2', 'super', 6, tamar, '2026-10-07T11:40:00Z'),
];
const EXPORT_DEFINITION: Record<string, unknown> = {
  [EXPORTS[0]!.id]: definitionOf(EXPORTED_V4),
  [EXPORTS[1]!.id]: definitionOf(FIELDS[3]),
  [EXPORTS[2]!.id]: definitionOf(SUPER_ROWS, 'super'),
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
  listFormExports: () => ({ exports: EXPORTS }),
  getFormExport: (input) => {
    const row = EXPORTS.find((x) => x.id === input.export_id) ?? EXPORTS[0]!;
    return { ...row, definition: EXPORT_DEFINITION[row.id] };
  },
  saveFormExport: (input) => {
    const version = VERSIONS.find((v) => v.id === input.form_version_id)!;
    const label = `Match form 2026 · ${version.status === 'draft' ? 'draft ' : ''}v${version.version_no}`;
    return exportRow(9, label, 'match', version.field_count, tamar, EXPORTS_NOW.toISOString());
  },
  exportForm: (input) => {
    const version = VERSIONS.find((v) => v.id === input.form_version_id) ?? VERSIONS[0]!;
    return definitionOf(version.version_no === 4 ? FIELDS[4] : FIELDS[3]);
  },
  importForm: (input) => ({
    form_id: (input.form_id as string | undefined) ?? uid(8, 27),
    draft_version_id: VERSION_ID[4],
    created: input.form_id === undefined,
  }),
  // 214 + 38 + 12 entries over four versions (13-forms).
  deleteForm: (input) => ({ versions: 4, entries: 264, deleted: input.dry_run !== true }),
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
