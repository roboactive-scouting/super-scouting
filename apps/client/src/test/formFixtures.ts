import type {
  FormListItem,
  GetFormOutput,
  GetFormVersionOutput,
  ScoredFieldRow,
  VersionSummary,
} from '@frc/shared';

/*
 * The design's match form (12-form-builder, 13-forms) for the builder and forms-list unit
 * tests: draft v4 over the active, locked v3 (214 entries), v2 and v1. Wire shapes only.
 */

export const SEASON_2026 = '00000000-0000-4000-8000-000000002026';
export const SEASON_2027 = '00000000-0000-4000-8000-000000002027';
export const FORM_ID = '00000000-0000-4000-8000-0000000000f1';
export const V = {
  v1: '00000000-0000-4000-8000-0000000000a1',
  v2: '00000000-0000-4000-8000-0000000000a2',
  v3: '00000000-0000-4000-8000-0000000000a3',
  v4: '00000000-0000-4000-8000-0000000000a4',
};
const noa = { id: '00000000-0000-4000-8000-0000000000b1', full_name: 'Noa Levi' };

export function summary(over: Partial<VersionSummary> & { id: string; version_no: number }) {
  return {
    status: 'published',
    published_at: '2026-10-02T09:00:00.000Z',
    is_active: false,
    is_locked: true,
    field_count: 15,
    entry_count: 0,
    updated_at: '2026-10-02T09:00:00.000Z',
    updated_by: noa,
    ...over,
  } as VersionSummary;
}

export const VERSIONS: VersionSummary[] = [
  summary({
    id: V.v4,
    version_no: 4,
    status: 'draft',
    published_at: null,
    is_locked: false,
    field_count: 17,
    updated_at: '2026-10-08T08:48:00.000Z',
  }),
  summary({ id: V.v3, version_no: 3, is_active: true, entry_count: 214 }),
  summary({
    id: V.v2,
    version_no: 2,
    field_count: 14,
    entry_count: 38,
    published_at: '2026-09-20T09:00:00.000Z',
  }),
  summary({
    id: V.v1,
    version_no: 1,
    field_count: 12,
    entry_count: 12,
    published_at: '2026-09-05T09:00:00.000Z',
  }),
];

export const MATCH_FORM: FormListItem = {
  id: FORM_ID,
  kind: 'match',
  name: 'Match form',
  active_version_id: V.v3,
  updated_at: '2026-10-08T08:48:00.000Z',
  versions: VERSIONS,
};

let n = 0;
export function field(over: Partial<ScoredFieldRow> & { key: string }): ScoredFieldRow {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    form_version_id: V.v4,
    label: over.key,
    help_text: null,
    type: 'counter',
    section: null,
    display_order: n,
    required: false,
    default_value: null,
    config: { min: 0, step: 1 },
    visibility_condition: null,
    deprecated: false,
    description: 'what it counts',
    unit: 'count',
    phase: 'teleop',
    direction: 'higher_is_better',
    category: null,
    expected_range: null,
    include_in_ai_context: null,
    is_ordinal: null,
    points: null,
    option_points: null,
    ...over,
  };
}

/** The draft's fields: two in Auto, three in Teleop (one under a section), one each after. */
export function draftFields(): ScoredFieldRow[] {
  return [
    field({
      key: 'auto_leave',
      label: 'Left the start zone',
      type: 'toggle',
      config: {},
      unit: 'boolean',
      phase: 'auto',
      points: 3,
    }),
    field({
      key: 'auto_high',
      label: 'Pieces scored high',
      phase: 'auto',
      help_text: 'Upper goal',
      points: 6,
    }),
    field({ key: 'tele_high', label: 'Pieces scored high', help_text: 'Upper goal', points: 4 }),
    field({
      key: 'tele_shots',
      label: 'Shots',
      type: 'event_log',
      config: { event_types: [{ value: 'high', label: 'High goal' }], ask_position: false },
    }),
    field({
      key: 'tele_defence',
      label: 'Played defence',
      type: 'toggle',
      config: {},
      unit: 'boolean',
      section: 'Defence',
    }),
    field({
      key: 'end_climb',
      label: 'Climb level',
      type: 'single_select',
      unit: 'enum',
      phase: 'endgame',
      is_ordinal: true,
      config: {
        options: [
          { value: 'none', label: 'None' },
          { value: 'high', label: 'High bar' },
        ],
      },
      option_points: { none: 0, high: 12 },
    }),
    field({
      key: 'post_notes',
      label: 'Notes',
      type: 'long_text',
      config: {},
      unit: 'text',
      direction: 'neutral',
      phase: 'post_match',
    }),
  ];
}

export function versionOut(
  summaryRow: VersionSummary,
  fields: ScoredFieldRow[] = draftFields(),
): GetFormVersionOutput {
  return {
    ...summaryRow,
    form_id: FORM_ID,
    fields: fields.map((f) => ({ ...f, form_version_id: summaryRow.id })),
  };
}

export function formOut(versions: VersionSummary[] = VERSIONS): GetFormOutput {
  return {
    id: FORM_ID,
    season_id: SEASON_2026,
    kind: 'match',
    name: 'Match form',
    active_version_id: versions.find((v) => v.is_active)?.id ?? null,
    timer_config: { phases: [] },
    created_at: '2026-09-01T09:00:00.000Z',
    updated_at: '2026-10-08T08:48:00.000Z',
    versions,
  };
}

export const SEASONS = [
  {
    id: SEASON_2027,
    year: 2027,
    game_name: 'NEXT',
    field_image_path: 'x',
    created_at: 'x',
    updated_at: 'x',
  },
  {
    id: SEASON_2026,
    year: 2026,
    game_name: 'REBUILT',
    field_image_path: 'x',
    created_at: 'x',
    updated_at: 'x',
  },
];
