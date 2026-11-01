import type { CachedRow } from '@/data/db';

/*
 * The entry preview's device (task 1.52), from the design's page 25: Q37 · 1690 Orbit at Blue 3,
 * played, 47 points (Auto 14, Teleop 22, Endgame 11), scouted by Omer Katz on form v1 while the
 * form's ACTIVE version is v2 — the preview scores with v2, as the server does — plus a no-show,
 * a disabled robot, a super entry, a deleted entry and another event's.
 */

export const NOW = Date.parse('2026-11-14T14:30:00.000Z');
/** 14/11/2026 16:05 in Tel Aviv. */
export const CREATED = '2026-11-14T14:05:00.000Z';

export const IDS = {
  played: 'e-37',
  earlier: 'e-30',
  noShow: 'e-26',
  disabled: 'e-50',
  super: 's-1',
  deleted: 'e-del',
  otherEvent: 'e-far',
} as const;

const field = (
  n: number,
  key: string,
  label: string,
  type: string,
  phase: string,
  config: Record<string, unknown> = {},
  version = 'fv-2',
) => ({
  entity: 'form_fields',
  id: `${version}-ff-${n}`,
  form_version_id: version,
  key,
  label,
  type,
  display_order: n,
  phase,
  required: false,
  deprecated: false,
  config,
  unit: 'count',
  direction: 'higher_is_better',
  deleted_at: null,
});

const yesNo = { options: [] };
const climb = {
  options: [
    { value: 'none', label: 'No climb' },
    { value: 'shallow', label: 'Shallow' },
    { value: 'deep', label: 'Deep' },
  ],
};
const driver = {
  options: [
    { value: 'poor', label: 'Poor' },
    { value: 'good', label: 'Good' },
  ],
};

const rule = (n: number, key: string, points: number, option_points: unknown = null) => ({
  entity: 'scoring_rules',
  id: `r-${n}`,
  form_id: 'f-match',
  field_key: key,
  points,
  option_points,
  deleted_at: null,
});

const entry = (id: string, over: Record<string, unknown>) => ({
  entity: 'scouting_entries',
  id,
  event_id: 'ev-1',
  form_kind: 'match',
  form_version_id: 'fv-1',
  match_id: 'm-37',
  team_id: 't-1690',
  alliance: 'blue',
  scouter_id: 'u-omer',
  robot_status: 'played',
  breakdown_seconds: null,
  data: {},
  version: 1,
  client_created_at: CREATED,
  client_updated_at: CREATED,
  deleted_at: null,
  ...over,
});

/** The design's played entry: 47 points. */
export const PLAYED_DATA = {
  left_zone: true,
  auto_high: 4,
  auto_low: 2,
  tele_high: 9,
  tele_low: 4,
  missed: 1,
  defense: false,
  shots: [
    { x: 0.2, y: 0.3 },
    { x: 0.3, y: 0.4 },
    { x: 0.4, y: 0.4 },
    { x: 0.5, y: 0.2 },
    { x: 0.6, y: 0.6 },
    { x: 0.7, y: 0.5 },
  ],
  climb: 'deep',
  driver: 'good',
  notes: 'Best match so far. Driver calm, lined up every shot; climbed Deep with 15 s left.',
  notes_he: 'נהג מעולה, לא נתקע אף פעם.',
};

export const PREVIEW_ROWS = [
  { entity: 'seasons', id: 'se-1', year: 2026, field_image_path: 'seasons/2026/field.webp' },
  {
    entity: 'events',
    id: 'ev-1',
    season_id: 'se-1',
    name: 'District #3 · Tel Aviv',
    sort_order: 3,
  },
  { entity: 'events', id: 'ev-2', season_id: 'se-1', name: 'District #2', sort_order: 2 },
  { entity: 'teams', id: 't-1690', number: 1690, name: 'Orbit' },
  { entity: 'matches', id: 'm-37', event_id: 'ev-1', match_type: 'qualification', number: 37 },
  { entity: 'matches', id: 'm-30', event_id: 'ev-1', match_type: 'qualification', number: 30 },
  { entity: 'matches', id: 'm-26', event_id: 'ev-1', match_type: 'qualification', number: 26 },
  {
    entity: 'match_teams',
    id: 'mt-1',
    match_id: 'm-37',
    team_id: 't-1690',
    alliance: 'blue',
    station: 3,
  },
  { entity: 'users', id: 'u-omer', full_name: 'Omer Katz', username: 'omer.k' },
  { entity: 'users', id: 'u-yael', full_name: 'Yael Shapira', username: 'yael.s' },
  { entity: 'users', id: 'u-dana', full_name: 'Dana Mor', username: 'dana.m' },
  {
    entity: 'forms',
    id: 'f-match',
    kind: 'match',
    season_id: 'se-1',
    active_version_id: 'fv-2',
    deleted_at: null,
  },
  { entity: 'form_versions', id: 'fv-1', form_id: 'f-match', version_no: 1 },
  { entity: 'form_versions', id: 'fv-2', form_id: 'f-match', version_no: 2 },
  { entity: 'forms', id: 'f-super', kind: 'super', season_id: 'se-1', active_version_id: 'fv-s' },
  { entity: 'form_versions', id: 'fv-s', form_id: 'f-super', version_no: 3 },
  // v1 had one field v2 dropped: the preview scores with v2 (the active version).
  field(1, 'old_field', 'Old field', 'counter', 'auto', { min: 0, max: 9, step: 1 }, 'fv-1'),
  field(1, 'left_zone', 'Left the start zone', 'toggle', 'auto', yesNo),
  field(2, 'auto_high', 'High goal', 'counter', 'auto', { min: 0, max: 10, step: 1 }),
  field(3, 'auto_low', 'Low goal', 'counter', 'auto', { min: 0, max: 10, step: 1 }),
  field(4, 'tele_high', 'High goal', 'counter', 'teleop', { min: 0, max: 30, step: 1 }),
  field(5, 'tele_low', 'Low goal', 'counter', 'teleop', { min: 0, max: 30, step: 1 }),
  field(6, 'missed', 'Missed shots', 'counter', 'teleop', { min: 0, max: 30, step: 1 }),
  field(7, 'defense', 'Played defense', 'toggle', 'teleop', yesNo),
  field(8, 'shots', 'Shooting spots', 'position', 'teleop', {
    mirror_axis: 'horizontal',
    multiple: true,
  }),
  field(9, 'climb', 'Climb', 'single_select', 'endgame', climb),
  field(10, 'driver', 'Driver skill', 'single_select', 'post_match', driver),
  field(11, 'notes', 'Notes', 'long_text', 'post_match'),
  field(12, 'notes_he', 'הערות נוספות', 'long_text', 'post_match'),
  field(1, 'reliability', 'Auto reliability', 'single_select', 'auto', driver, 'fv-s'),
  field(2, 'strengths', 'Strengths', 'long_text', 'post_match', {}, 'fv-s'),
  rule(1, 'left_zone', 4),
  rule(2, 'auto_high', 2),
  rule(3, 'auto_low', 1),
  rule(4, 'tele_high', 2),
  rule(5, 'tele_low', 1),
  rule(6, 'missed', 0),
  rule(7, 'defense', 3),
  rule(8, 'climb', 0, { none: 0, shallow: 6, deep: 11 }),
  entry(IDS.played, { data: PLAYED_DATA }),
  // The team's earlier match: 30 points (auto_high 15 × 2) — the average is (47 + 30) / 2.
  entry(IDS.earlier, {
    match_id: 'm-30',
    form_version_id: 'fv-2',
    data: { auto_high: 15 },
    client_created_at: '2026-11-14T12:00:00.000Z',
  }),
  entry(IDS.noShow, {
    match_id: 'm-26',
    scouter_id: 'u-yael',
    robot_status: 'no_show',
    data: {},
    client_created_at: '2026-11-14T11:20:00.000Z',
  }),
  entry(IDS.disabled, {
    match_id: 'm-26',
    form_version_id: 'fv-2',
    scouter_id: 'u-yael',
    robot_status: 'disabled',
    data: { auto_high: 3 },
  }),
  entry(IDS.super, {
    form_kind: 'super',
    form_version_id: 'fv-s',
    match_id: null,
    alliance: null,
    robot_status: null,
    scouter_id: 'u-dana',
    data: { reliability: 'good', strengths: 'Fast cycles on the near side' },
    client_created_at: '2026-11-14T09:12:00.000Z',
  }),
  entry(IDS.deleted, { deleted_at: '2026-11-14T15:00:00.000Z' }),
  entry(IDS.otherEvent, { event_id: 'ev-2' }),
] as unknown as CachedRow[];
