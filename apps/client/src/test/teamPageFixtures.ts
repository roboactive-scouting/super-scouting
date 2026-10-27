import type { CachedRow } from '@/data/db';

/*
 * The team page's device (task 1.53), after the design's page 24: 1690 Orbit at District #3 ·
 * Tel Aviv with six qualification matches — one broke down (Q14) and one no-show (Q26, whose
 * stale data must never show) — a super entry, notes (one in Hebrew) whose times do NOT follow the
 * match order, plus two other roster teams with entries (the rank and the colour domains are
 * event-wide), a roster team with none (5987 Galaxia, the empty state), a deleted entry and
 * another event's entry (both never counted).
 */

export const EVENT_ID = 'ev-1';
export const TEAM_ID = 't-1690';
export const EMPTY_TEAM_ID = 't-5987';
/** 14/11/2026 16:30 in Tel Aviv: the notes' "today". */
export const NOW = Date.parse('2026-11-14T14:30:00.000Z');

const field = (
  n: number,
  key: string,
  label: string,
  type: string,
  phase: string,
  over: Record<string, unknown> = {},
  version = 'fv-1',
) => ({
  entity: 'form_fields' as const,
  id: `${version}-ff-${n}`,
  form_version_id: version,
  key,
  label,
  type,
  display_order: n,
  phase,
  required: false,
  deprecated: false,
  config: {},
  unit: 'count',
  direction: 'higher_is_better',
  expected_range: null,
  is_ordinal: null,
  deleted_at: null,
  ...over,
});

const rule = (n: number, key: string, points: number, option_points: unknown = null) => ({
  entity: 'scoring_rules' as const,
  id: `r-${n}`,
  form_id: 'f-match',
  field_key: key,
  points,
  option_points,
  deleted_at: null,
});

const match = (n: number) => ({
  entity: 'matches' as const,
  id: `m-${n}`,
  event_id: EVENT_ID,
  match_type: 'qualification',
  number: n,
});

let seq = 0;
const entry = (
  id: string,
  team: string,
  n: number,
  scouter: string,
  status: string,
  data: Record<string, unknown>,
  at: string,
  over: Record<string, unknown> = {},
) => {
  seq += 1;
  return {
    entity: 'scouting_entries' as const,
    id,
    event_id: EVENT_ID,
    form_kind: 'match',
    form_version_id: 'fv-1',
    match_id: `m-${n}`,
    team_id: team,
    alliance: seq % 2 ? 'red' : 'blue',
    scouter_id: scouter,
    robot_status: status,
    breakdown_seconds: status === 'broke_down' ? 25 : null,
    data,
    version: 1,
    client_created_at: at,
    client_updated_at: at,
    deleted_at: null,
    ...over,
  };
};

const climbOptions = {
  options: [
    { value: 'none', label: 'None' },
    { value: 'shallow', label: 'Shallow' },
    { value: 'deep', label: 'Deep' },
  ],
};

/** The entry ids of 1690's matches, oldest → newest. */
export const IDS = {
  q3: 'e-q3',
  q9: 'e-q9',
  q14: 'e-q14',
  q20: 'e-q20',
  q26: 'e-q26',
  q31: 'e-q31',
  q37: 'e-q37',
  super: 's-1690',
  deleted: 'e-del',
  otherEvent: 'e-far',
} as const;

export const HEBREW_NOTE = 'הרובוט נתקע ליד הקיר באמצע הטלאופ וחזר אחרי בערך 10 שניות.';

/*
 * Points (left_zone 4, auto_high 2, auto_low 1, tele_high 2, climb none 0 / shallow 6 / deep 11):
 * Q3 29 · Q9 36 · Q14 11 (broke down) · Q20 40 · Q26 — (no show) · Q31 36 · Q37 42.
 * Average (29 + 36 + 11 + 40 + 36 + 42) / 6 = 32.33…; 2096's one match (50) ranks it first,
 * so 1690 is #2 of the 4 roster teams.
 */
export const TEAM_ROWS: CachedRow[] = [
  { entity: 'seasons', id: 'se-1', year: 2026 },
  {
    entity: 'events',
    id: EVENT_ID,
    season_id: 'se-1',
    name: 'District #3 · Tel Aviv',
    sort_order: 3,
  },
  { entity: 'events', id: 'ev-2', season_id: 'se-1', name: 'District #2', sort_order: 2 },
  { entity: 'teams', id: TEAM_ID, number: 1690, name: 'Orbit' },
  { entity: 'teams', id: 't-5951', number: 5951, name: 'Makers Assemble' },
  { entity: 'teams', id: 't-2096', number: 2096, name: 'ROBACTIVE' },
  { entity: 'teams', id: EMPTY_TEAM_ID, number: 5987, name: 'Galaxia' },
  ...[TEAM_ID, 't-5951', 't-2096', EMPTY_TEAM_ID].map((team, i) => ({
    entity: 'event_teams' as const,
    id: `et-${i}`,
    event_id: EVENT_ID,
    team_id: team,
    deleted_at: null,
  })),
  ...[3, 9, 14, 20, 26, 31, 37, 40].map(match),
  { entity: 'users', id: 'u-yael', full_name: 'Yael Shapira', username: 'yael.s' },
  { entity: 'users', id: 'u-dana', full_name: 'Dana Mor', username: 'dana.m' },
  { entity: 'users', id: 'u-noa', full_name: 'Noa Levi', username: 'noa.levi' },
  { entity: 'users', id: 'u-omer', full_name: 'Omer Katz', username: 'omer.k' },
  {
    entity: 'forms',
    id: 'f-match',
    kind: 'match',
    season_id: 'se-1',
    active_version_id: 'fv-1',
    deleted_at: null,
  },
  { entity: 'form_versions', id: 'fv-1', form_id: 'f-match', version_no: 1 },
  {
    entity: 'forms',
    id: 'f-super',
    kind: 'super',
    season_id: 'se-1',
    active_version_id: 'fv-s',
    deleted_at: null,
  },
  { entity: 'form_versions', id: 'fv-s', form_id: 'f-super', version_no: 1 },
  field(1, 'left_zone', 'Left the start zone', 'toggle', 'auto', { unit: 'boolean' }),
  field(2, 'auto_high', 'High goal', 'counter', 'auto', { config: { min: 0, max: 10, step: 1 } }),
  // Every team scores exactly 1 here: min = max, so it shades flat.
  field(3, 'auto_low', 'Low goal', 'counter', 'auto', { config: { min: 0, max: 10, step: 1 } }),
  field(4, 'tele_high', 'High goal', 'counter', 'teleop', {
    config: { min: 0, max: 30, step: 1 },
    expected_range: { min: 0, max: 20 },
  }),
  field(5, 'missed', 'Missed shots', 'counter', 'teleop', {
    config: { min: 0, max: 30, step: 1 },
    direction: 'lower_is_better',
  }),
  field(6, 'defense', 'Played defense', 'toggle', 'teleop', {
    unit: 'boolean',
    direction: 'neutral',
  }),
  field(7, 'climb', 'Usual climb', 'single_select', 'endgame', {
    config: climbOptions,
    unit: 'enum',
  }),
  field(8, 'notes', 'Notes', 'long_text', 'post_match', { unit: 'text', direction: 'neutral' }),
  field(9, 'notes_he', 'הערות', 'long_text', 'post_match', { unit: 'text', direction: 'neutral' }),
  // A timer with no declared direction: a faster climb shades better (lower_is_better).
  field(10, 'climb_time', 'Climb time', 'timer', 'endgame', { unit: 'seconds', direction: null }),
  field(11, 'driver', 'Driver skill', 'rating', 'post_match', { config: { max: 5 }, unit: null }),
  field(1, 'strengths', 'Strengths', 'long_text', 'post_match', { unit: 'text' }, 'fv-s'),
  rule(1, 'left_zone', 4),
  rule(2, 'auto_high', 2),
  rule(3, 'auto_low', 1),
  rule(4, 'tele_high', 2),
  rule(5, 'climb', 0, { none: 0, shallow: 6, deep: 11 }),

  // 1690 Orbit
  entry(
    IDS.q3,
    TEAM_ID,
    3,
    'u-dana',
    'played',
    {
      left_zone: true,
      auto_high: 3,
      auto_low: 1,
      tele_high: 6,
      missed: 2,
      defense: false,
      climb: 'shallow',
      climb_time: 14.2,
      driver: 4,
    },
    '2026-11-14T07:10:00.000Z',
  ),
  entry(
    IDS.q9,
    TEAM_ID,
    9,
    'u-yael',
    'played',
    {
      left_zone: true,
      auto_high: 2,
      auto_low: 1,
      tele_high: 8,
      missed: 1,
      defense: false,
      climb: 'deep',
      climb_time: 11.8,
      driver: 5,
      notes_he: HEBREW_NOTE,
    },
    '2026-11-14T07:40:00.000Z',
    { client_updated_at: '2026-11-14T13:50:00.000Z' },
  ),
  entry(
    IDS.q14,
    TEAM_ID,
    14,
    'u-omer',
    'broke_down',
    {
      left_zone: false,
      auto_high: 2,
      auto_low: 1,
      tele_high: 3,
      missed: 4,
      defense: false,
      climb: 'none',
      climb_time: null,
      driver: 2,
      notes: 'Lost a wheel at 1:10 and sat still until the end.',
    },
    '2026-11-13T09:20:00.000Z',
  ),
  entry(
    IDS.q20,
    TEAM_ID,
    20,
    'u-noa',
    'played',
    {
      left_zone: true,
      auto_high: 3,
      auto_low: 1,
      tele_high: 9,
      missed: 2,
      defense: true,
      climb: 'deep',
      climb_time: 12.5,
      driver: 4,
      notes: 'Played defense on 5951 for the last 40 s; drew one foul.',
    },
    '2026-11-14T08:40:00.000Z',
  ),
  // A no-show holding stale values: none of them may ever show (11.3).
  entry(
    IDS.q26,
    TEAM_ID,
    26,
    'u-yael',
    'no_show',
    {
      auto_high: 7,
      tele_high: 13,
      climb: 'deep',
    },
    '2026-11-14T09:10:00.000Z',
  ),
  entry(
    IDS.q31,
    TEAM_ID,
    31,
    'u-yael',
    'played',
    {
      left_zone: true,
      auto_high: 3,
      auto_low: 1,
      tele_high: 7,
      missed: 2,
      defense: false,
      climb: 'deep',
      climb_time: 10.9,
      driver: 4,
    },
    '2026-11-14T10:00:00.000Z',
  ),
  entry(
    IDS.q37,
    TEAM_ID,
    37,
    'u-omer',
    'played',
    {
      left_zone: true,
      auto_high: 4,
      auto_low: 1,
      tele_high: 9,
      missed: 1,
      defense: false,
      climb: 'deep',
      climb_time: 9.6,
      driver: 5,
      notes: 'Best match so far. Driver calm, lined up every shot.',
    },
    '2026-11-14T12:05:00.000Z',
  ),
  {
    entity: 'scouting_entries' as const,
    id: IDS.super,
    event_id: EVENT_ID,
    form_kind: 'super',
    form_version_id: 'fv-s',
    match_id: null,
    team_id: TEAM_ID,
    alliance: null,
    scouter_id: 'u-noa',
    robot_status: null,
    breakdown_seconds: null,
    data: { strengths: 'Fast cycles on the high goal.' },
    version: 1,
    client_created_at: '2026-11-14T11:00:00.000Z',
    client_updated_at: '2026-11-14T11:00:00.000Z',
    deleted_at: null,
  },
  // Never counted: a deleted entry and another event's.
  entry(
    IDS.deleted,
    TEAM_ID,
    40,
    'u-dana',
    'played',
    { auto_high: 9, notes: 'deleted note' },
    '2026-11-14T13:00:00.000Z',
    { deleted_at: '2026-11-14T13:05:00.000Z' },
  ),
  entry(
    IDS.otherEvent,
    TEAM_ID,
    40,
    'u-dana',
    'played',
    { auto_high: 9, notes: 'far note' },
    '2026-11-14T13:00:00.000Z',
    { event_id: 'ev-2' },
  ),

  // The rest of the event: the rank and every colour domain are event-wide.
  entry(
    'e-5951-3',
    't-5951',
    3,
    'u-noa',
    'played',
    {
      left_zone: false,
      auto_high: 1,
      auto_low: 1,
      tele_high: 4,
      missed: 6,
      defense: true,
      climb: 'none',
      driver: 2,
    },
    '2026-11-14T07:11:00.000Z',
  ),
  entry(
    'e-5951-9',
    't-5951',
    9,
    'u-omer',
    'played',
    {
      left_zone: true,
      auto_high: 0,
      auto_low: 1,
      tele_high: 5,
      missed: 5,
      defense: true,
      climb: 'shallow',
      climb_time: 18.4,
      driver: 3,
    },
    '2026-11-14T07:41:00.000Z',
  ),
  entry(
    'e-2096-14',
    't-2096',
    14,
    'u-dana',
    'played',
    {
      left_zone: true,
      auto_high: 5,
      auto_low: 1,
      tele_high: 12,
      missed: 0,
      defense: false,
      climb: 'deep',
      climb_time: 8.7,
      driver: 5,
    },
    '2026-11-13T09:21:00.000Z',
  ),
];
