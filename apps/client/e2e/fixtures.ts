import bcrypt from 'bcryptjs';
import { validateEntryData, validateEntryShape } from '@frc/shared';
import type { PullEntityKey, PullResponse } from '@frc/shared';

/**
 * One season, District #3, 22 teams and a forty-match schedule, built from the design's
 * mock data (docs/design/pages/05-entries, 07-manage, 08-users). Every id is a fixed UUID,
 * so a screenshot never changes between runs. Nothing here reads the clock.
 */

/** `00000000k-0000-4000-8000-<n>`: k says what the row is, n which one. */
const uid = (kind: number, n: number) =>
  `${kind.toString(16).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const KIND = {
  season: 1,
  event: 2,
  team: 3,
  user: 4,
  match: 5,
  matchTeam: 6,
  entry: 7,
  form: 8,
  formVersion: 9,
  field: 10,
  rule: 11,
  roster: 12,
} as const;

const T0 = '2026-01-10T08:00:00.000Z';
/** Every password in the fixture; the cached hash below is for it. */
export const TEST_PASSWORD = 'test-password-1';
const PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 4);

// ---------------------------------------------------------------------------------------
// Seasons and events

export const SEASONS = [
  { id: uid(KIND.season, 2026), year: 2026, game_name: 'REBUILT' },
  { id: uid(KIND.season, 2025), year: 2025, game_name: 'REEFSCAPE' },
  { id: uid(KIND.season, 2024), year: 2024, game_name: 'CRESCENDO' },
].map((s) => ({
  ...s,
  // only 2026's image is committed (SEASON_IMAGE_MANIFEST); older seasons reuse it
  field_image_path: 'seasons/2026/field.webp',
  created_at: T0,
  updated_at: T0,
}));
export const SEASON_ID = SEASONS[0]!.id;

export const EVENTS = [
  'District #1 · Haifa',
  "District #2 · Be'er Sheva",
  'District #3 · Tel Aviv',
  'District #4 · Jerusalem',
  'Israel Championship',
].map((name, i) => ({
  id: uid(KIND.event, i + 1),
  season_id: SEASON_ID,
  name,
  code: null,
  sort_order: i + 1,
  created_at: T0,
  updated_at: T0,
}));
/** The active competition: District #3 · Tel Aviv. */
export const EVENT = EVENTS[2]!;
export const EVENT_ID = EVENT.id;

// ---------------------------------------------------------------------------------------
// Teams: the 22-team roster, plus three teams that are not on it

const ROSTER_TEAMS: [number, string][] = [
  [1574, 'MisCar'],
  [1690, 'Orbit'],
  [1937, 'Elysium'],
  [1943, 'NeatTeam'],
  [2096, 'RobActive'],
  [2231, 'OnyxTronix'],
  [2630, 'Thunderbolts'],
  [3075, 'Ha-Dream Team'],
  [3316, 'D-Bug'],
  [3339, 'BumbleB'],
  [4320, 'The Joker'],
  [4338, 'Falcons'],
  [4590, 'GreenBlitz'],
  [5135, 'Black Unicorns'],
  [5654, 'Phoenix'],
  [5951, 'Tiny Titans'],
  [5987, 'Galaxia'],
  [6230, 'Team Koi'],
  [6738, 'Excalibur'],
  [7039, 'Ultimate'],
  [7112, 'EverGreen'],
  [8175, 'Piece of Mind'],
];
/** Known to the registry, not on District #3's roster. 7845 is in match Q8's line-up. */
const OFF_ROSTER_TEAMS: [number, string][] = [
  [7845, 'Rogue Robotics'],
  [9036, 'Cyber Owls'],
  [8223, 'Mariners'],
];

export type Team = {
  id: string;
  number: number;
  name: string;
  created_at: string;
  updated_at: string;
};
const toTeam = ([number, name]: [number, string]): Team => ({
  id: uid(KIND.team, number),
  number,
  name,
  created_at: T0,
  updated_at: T0,
});
export const ROSTER: Team[] = ROSTER_TEAMS.map(toTeam);
export const OFF_ROSTER: Team[] = OFF_ROSTER_TEAMS.map(toTeam);
/** The whole registry, by number. */
export const TEAMS: Team[] = [...ROSTER, ...OFF_ROSTER].sort((a, b) => a.number - b.number);

/** The id of a team, by its FRC number. */
export function teamId(number: number): string {
  const team = TEAMS.find((t) => t.number === number);
  if (!team) throw new Error(`fixture: no team ${number}`);
  return team.id;
}

// ---------------------------------------------------------------------------------------
// Users (the design's Users page, in its order)

type UserSeed = [
  full: string,
  username: string,
  role: 'admin' | 'lead' | 'scouter',
  off: string | null,
  entries: number,
];
const USER_SEEDS: UserSeed[] = [
  ['Tamar Mizrahi', 'tamar.m', 'admin', null, 12],
  ['Eldad Gross', 'eldad.g', 'admin', null, 3],
  ['Noa Levi', 'noa.levi', 'lead', null, 64],
  ['Daniel Rosen', 'daniel.r', 'lead', null, 41],
  ['Amit Ben-David', 'amit.bd', 'scouter', null, 58],
  ['Yael Shapira', 'yael.s', 'scouter', null, 52],
  ['Omer Katz', 'omer.k', 'scouter', null, 47],
  ['Itai Cohen', 'itai.c', 'scouter', null, 39],
  ['Maya Friedman', 'maya.f', 'scouter', null, 33],
  ['Lior Avraham', 'lior.a', 'scouter', null, 28],
  ['Shira Peretz', 'shira.p', 'scouter', null, 0],
  ['Roni Gal', 'roni.g', 'scouter', '2026-09-14T08:00:00.000Z', 17],
];

export type FixtureUser = {
  id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'lead' | 'scouter';
  must_change_password: boolean;
  disabled_at: string | null;
  created_at: string;
  /** Entries this season (the Users page's last column). */
  entries: number;
};
export const USERS: FixtureUser[] = USER_SEEDS.map(
  ([full_name, username, role, off, entries], i) => ({
    id: uid(KIND.user, i + 1),
    username,
    full_name,
    role,
    must_change_password: false,
    disabled_at: off,
    created_at: T0,
    entries,
  }),
);

/** A fixture user by username (`yael.s` scouter, `noa.levi` lead, `tamar.m` admin). */
export function userByName(username: string): FixtureUser {
  const user = USERS.find((u) => u.username === username);
  if (!user) throw new Error(`fixture: no user ${username}`);
  return user;
}
const userByFullName = (full: string) => USERS.find((u) => u.full_name === full)!;

// ---------------------------------------------------------------------------------------
// Matches: Q1-Q10 are the Manage page's line-ups (0 = empty slot); Q35-Q40 hold the
// entries and the next match to scout; Q11-Q34 rotate through the roster.

/** [r1, r2, r3, b1, b2, b3] */
type Lineup = [number, number, number, number, number, number];
const MANAGE_LINEUPS: Lineup[] = [
  [1690, 3075, 6230, 2231, 5654, 7039],
  [1574, 2096, 4338, 7112, 5951, 1937],
  [2630, 3316, 3339, 4320, 4590, 5135],
  [1943, 5987, 6738, 8175, 1690, 2231],
  [3075, 1574, 5654, 2096, 6230, 4338],
  [7039, 7112, 5951, 1937, 2630, 3316],
  [3339, 4320, 4590, 5135, 1943, 0],
  [5987, 7845, 6738, 8175, 3075, 1574],
  [5654, 2096, 6230, 4338, 7039, 7112],
  [5951, 1937, 0, 0, 0, 0],
];
const LATE_LINEUPS: Record<number, Lineup> = {
  35: [6230, 1937, 3316, 4320, 4590, 1943],
  // 3316 was scouted at Blue 2 in Q37 but is not in its line-up: the entries page flags it
  36: [7039, 5951, 3075, 2231, 5135, 5654],
  37: [2630, 1690, 4590, 1943, 5987, 6738],
  38: [1574, 2096, 4338, 7112, 5951, 8175],
  39: [2630, 3316, 3339, 4320, 4590, 5135],
  40: [1943, 5987, 6738, 8175, 1690, 2231],
};
function lineupOf(n: number): Lineup {
  const manage = MANAGE_LINEUPS[n - 1];
  if (manage) return manage;
  const late = LATE_LINEUPS[n];
  if (late) return late;
  // six consecutive roster teams, shifted by seven places per match: never a repeat
  const at = (k: number) => ROSTER_TEAMS[(n * 7 + k) % ROSTER_TEAMS.length]![0];
  return [at(0), at(1), at(2), at(3), at(4), at(5)];
}

export const MATCH_COUNT = 40;
export type Slot = { alliance: 'red' | 'blue'; station: 1 | 2 | 3; team_id: string };
export type FixtureMatch = {
  id: string;
  event_id: string;
  match_type: 'qualification';
  number: number;
  created_at: string;
  updated_at: string;
  slots: Slot[];
};
export const MATCHES: FixtureMatch[] = Array.from({ length: MATCH_COUNT }, (_, i) => {
  const number = i + 1;
  const line = lineupOf(number);
  const slots: Slot[] = [];
  line.forEach((team, k) => {
    if (team === 0) return;
    slots.push({
      alliance: k < 3 ? 'red' : 'blue',
      station: ((k % 3) + 1) as 1 | 2 | 3,
      team_id: teamId(team),
    });
  });
  return {
    id: uid(KIND.match, number),
    event_id: EVENT_ID,
    match_type: 'qualification',
    number,
    created_at: T0,
    updated_at: T0,
    slots,
  };
});

/** The id of qualification match `n` (Q38 and Q39 are the ones page tests scout). */
export function matchId(n: number): string {
  const match = MATCHES.find((m) => m.number === n);
  if (!match) throw new Error(`fixture: no match Q${n}`);
  return match.id;
}

// ---------------------------------------------------------------------------------------
// The match form: one published version with a few fields per phase

const FORM_ID = uid(KIND.form, 1);
const FORM_VERSION_ID = uid(KIND.formVersion, 1);
export const FORM = { id: FORM_ID, version_id: FORM_VERSION_ID };

type FieldSeed = {
  key: string;
  label: string;
  type: 'counter' | 'toggle' | 'single_select' | 'long_text';
  phase: 'auto' | 'teleop' | 'endgame' | 'post_match';
  unit: 'count' | 'boolean' | 'enum' | 'text';
  direction: 'higher_is_better' | 'neutral';
  description: string;
  help?: string;
  config: Record<string, unknown>;
  expected_range: { min: number; max: number } | null;
  points: number | null;
  option_points: Record<string, number> | null;
};
const FIELD_SEEDS: FieldSeed[] = [
  {
    key: 'auto_notes',
    label: 'Auto notes scored',
    type: 'counter',
    phase: 'auto',
    unit: 'count',
    direction: 'higher_is_better',
    description: 'Game pieces scored in autonomous',
    config: { min: 0, max: 10, step: 1 },
    expected_range: { min: 0, max: 10 },
    points: 5,
    option_points: null,
  },
  {
    key: 'auto_left_zone',
    label: 'Left the starting zone',
    type: 'toggle',
    phase: 'auto',
    unit: 'boolean',
    direction: 'higher_is_better',
    description: 'Robot left its starting zone',
    config: {},
    expected_range: null,
    points: 2,
    option_points: null,
  },
  {
    key: 'teleop_notes',
    label: 'Teleop notes scored',
    type: 'counter',
    phase: 'teleop',
    unit: 'count',
    direction: 'higher_is_better',
    description: 'Game pieces scored in teleop',
    config: { min: 0, max: 40, step: 1 },
    expected_range: { min: 0, max: 40 },
    points: 2,
    option_points: null,
  },
  {
    key: 'endgame_climb',
    label: 'Climb level',
    type: 'single_select',
    phase: 'endgame',
    unit: 'enum',
    direction: 'higher_is_better',
    description: 'How high the robot climbed',
    config: {
      is_ordinal: true,
      options: [
        { value: 'none', label: 'No climb' },
        { value: 'park', label: 'Parked' },
        { value: 'low', label: 'Low rung' },
        { value: 'high', label: 'High rung' },
      ],
    },
    expected_range: null,
    points: 0,
    option_points: { none: 0, park: 2, low: 6, high: 10 },
  },
  {
    key: 'notes',
    label: 'Notes',
    type: 'long_text',
    phase: 'post_match',
    unit: 'text',
    direction: 'neutral',
    description: 'Anything worth telling a strategy lead',
    config: {},
    expected_range: null,
    points: null,
    option_points: null,
  },
  // Appended, not placed in teleop's run, so every earlier field keeps its id and order.
  ...[
    ['teleop_coral_l4', 'Coral L4', 'Scored', 'Coral scored on level 4', 12],
    ['teleop_coral_l1_3', 'Coral L1–L3', 'Scored', 'Coral scored on levels 1 to 3', 20],
    ['teleop_algae_net', 'Algae in net', 'Scored', 'Algae scored in the net', 10],
  ].map(([key, label, help, description, max]): FieldSeed => ({
    key: key as string,
    label: label as string,
    type: 'counter',
    phase: 'teleop',
    unit: 'count',
    direction: 'higher_is_better',
    description: description as string,
    help: help as string,
    config: { min: 0, max, step: 1 },
    expected_range: { min: 0, max: max as number },
    points: null,
    option_points: null,
  })),
];

const FORM_FIELDS = FIELD_SEEDS.map((f, i) => ({
  id: uid(KIND.field, i + 1),
  form_version_id: FORM_VERSION_ID,
  key: f.key,
  label: f.label,
  help_text: f.help ?? null,
  type: f.type,
  section: null,
  display_order: i + 1,
  required: false,
  default_value: null,
  config: f.config,
  visibility_condition: null,
  deprecated: false,
  description: f.description,
  unit: f.unit,
  phase: f.phase,
  direction: f.direction,
  category: null,
  expected_range: f.expected_range,
  include_in_ai_context: true,
  is_ordinal: f.config.is_ordinal === true ? true : null,
  created_at: T0,
  updated_at: T0,
}));

const SCORING_RULES = FIELD_SEEDS.flatMap((f, i) =>
  f.points === null
    ? []
    : [
        {
          id: uid(KIND.rule, i + 1),
          form_id: FORM_ID,
          field_key: f.key,
          points: f.points,
          option_points: f.option_points,
          created_at: T0,
          updated_at: T0,
        },
      ],
);

// ---------------------------------------------------------------------------------------
// Entries (the design's Entries page): [match, station, team, status, scouter, time, pts]

type EntrySeed = [number, string, number, 'P' | 'B' | 'D' | 'N', string, string, number | null];
const ENTRY_SEEDS: EntrySeed[] = [
  [38, 'B2', 5951, 'P', 'Noa Levi', '11:41', 34],
  [38, 'R1', 1574, 'P', 'Amit Ben-David', '11:40', 41],
  [38, 'R3', 4338, 'B', 'Yael Shapira', '11:41', 12],
  [38, 'B1', 7112, 'P', 'Omer Katz', '11:39', 27],
  [37, 'B2', 3316, 'P', 'Noa Levi', '11:33', 29],
  [37, 'R2', 1690, 'P', 'Amit Ben-David', '11:32', 52],
  [37, 'B3', 6738, 'N', 'Yael Shapira', '11:31', null],
  [37, 'R1', 2630, 'P', 'Omer Katz', '11:32', 22],
  [36, 'B2', 5135, 'D', 'Noa Levi', '11:25', 8],
  [36, 'R3', 3075, 'P', 'Amit Ben-David', '11:24', 38],
  [36, 'B1', 2231, 'P', 'Tamar Mizrahi', '11:24', 45],
  [35, 'B2', 4590, 'P', 'Noa Levi', '11:16', 31],
  [35, 'R1', 6230, 'P', 'Omer Katz', '11:15', 26],
  [35, 'R2', 1937, 'B', 'Yael Shapira', '11:16', 15],
];
const STATUS = { P: 'played', B: 'broke_down', D: 'disabled', N: 'no_show' } as const;

/** Counter values and a climb that add up to `points` under the rules above. */
function dataFor(points: number | null): Record<string, unknown> {
  if (points === null) return {};
  let auto = Math.min(Math.floor(points / 5), 4);
  if ((points - 5 * auto) % 2 !== 0) auto -= 1; // the rest is made of 2s, 6s and 10s
  let rest = points - 5 * auto;
  const left = rest >= 2;
  if (left) rest -= 2;
  const climb = (
    [
      ['high', 10],
      ['low', 6],
      ['park', 2],
    ] as const
  ).find(([, p]) => rest >= p);
  if (climb) rest -= climb[1];
  return {
    auto_notes: auto,
    auto_left_zone: left,
    teleop_notes: rest / 2,
    endgame_climb: climb ? climb[0] : 'none',
  };
}

export type FixtureEntry = {
  id: string;
  form_version_id: string;
  form_kind: 'match';
  event_id: string;
  match_id: string;
  team_id: string;
  alliance: 'red' | 'blue';
  scouter_id: string;
  robot_status: 'played' | 'broke_down' | 'disabled' | 'no_show';
  breakdown_seconds: number | null;
  data: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  client_created_at: string;
  client_updated_at: string;
  deleted_at: null;
};
export const ENTRIES: FixtureEntry[] = ENTRY_SEEDS.map(
  ([match, station, team, status, who, time, points], i) => {
    // 2026-03-17, Asia/Jerusalem (UTC+2 until the DST change on 27 March)
    const [h, m] = time.split(':').map(Number) as [number, number];
    const at = `2026-03-17T${String(h - 2).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
    return {
      id: uid(KIND.entry, i + 1),
      form_version_id: FORM_VERSION_ID,
      form_kind: 'match',
      event_id: EVENT_ID,
      match_id: matchId(match),
      team_id: teamId(team),
      alliance: station.startsWith('R') ? 'red' : 'blue',
      scouter_id: userByFullName(who).id,
      robot_status: STATUS[status],
      breakdown_seconds: status === 'B' ? 25 : null,
      data: dataFor(points),
      version: 1,
      created_at: at,
      updated_at: at,
      client_created_at: at,
      client_updated_at: at,
      deleted_at: null,
    };
  },
);

// Qualification matches Q1-Q34 scouted that morning (2026-03-17, Asia/Jerusalem), every
// robot in the line-up by a rotating scouter, except the four matches below that miss one.
// Q35-Q38 above keep their partial coverage; Q39 and Q40 have no entries.

/** match → the station left unscouted. */
const MISSING_ROBOT: Record<number, string> = { 7: 'R3', 19: 'B2', 26: 'R1', 31: 'B3' };
const MORNING_SCOUTERS = [
  'Amit Ben-David',
  'Yael Shapira',
  'Omer Katz',
  'Itai Cohen',
  'Maya Friedman',
  'Lior Avraham',
  'Noa Levi',
  'Daniel Rosen',
].map((name) => userByFullName(name).id);
const FIRST_QUAL = 1;
const LAST_MORNING_QUAL = 34;

const MORNING_ENTRIES: FixtureEntry[] = [];
for (let n = FIRST_QUAL; n <= LAST_MORNING_QUAL; n++) {
  const match = MATCHES[n - 1]!;
  match.slots.forEach((slot, k) => {
    const station = `${slot.alliance === 'red' ? 'R' : 'B'}${slot.station}`;
    if (MISSING_ROBOT[n] === station) return;
    // 08:00 local (06:00 UTC) plus four minutes a match, and a little for each scouter
    const minutes = 6 * 60 + (n - 1) * 4 + 3;
    const at = new Date(Date.UTC(2026, 2, 17, 0, minutes, 20 * k)).toISOString();
    const points = 10 + ((n * 13 + k * 29) % 46);
    MORNING_ENTRIES.push({
      id: uid(KIND.entry, 100 + MORNING_ENTRIES.length),
      form_version_id: FORM_VERSION_ID,
      form_kind: 'match',
      event_id: EVENT_ID,
      match_id: match.id,
      team_id: slot.team_id,
      alliance: slot.alliance,
      scouter_id: MORNING_SCOUTERS[(n + k) % MORNING_SCOUTERS.length]!,
      robot_status: 'played',
      breakdown_seconds: null,
      data: {
        ...dataFor(points),
        teleop_coral_l4: (n + k) % 6,
        teleop_coral_l1_3: (n * 3 + k * 5) % 9,
        teleop_algae_net: (n + 2 * k) % 4,
      },
      version: 1,
      created_at: at,
      updated_at: at,
      client_created_at: at,
      client_updated_at: at,
      deleted_at: null,
    });
  });
}
ENTRIES.push(...MORNING_ENTRIES);

// The shared schemas are the judge: a morning entry that the app would refuse is a fixture bug.
// (Not the Q35-Q38 seeds, kept as designed: the disabled robot there carries data.)
for (const e of MORNING_ENTRIES) {
  const shape = validateEntryShape({ ...e, form_kind: 'match' });
  const data = validateEntryData(FORM_FIELDS, e.robot_status, e.data);
  if (shape.length > 0 || !data.ok) {
    throw new Error(`fixture entry ${e.id} is invalid: ${JSON.stringify({ shape, data })}`);
  }
}

// ---------------------------------------------------------------------------------------
// The pull: what the device caches for District #3

const NO_ROWS: Record<string, unknown>[] = [];
const entities = Object.fromEntries(
  (
    [
      'app_settings',
      'seasons',
      'events',
      'teams',
      'event_teams',
      'matches',
      'match_teams',
      'forms',
      'form_versions',
      'form_fields',
      'scoring_rules',
      'users',
      'scouting_entries',
      'sync_conflicts',
      'pick_lists',
      'pick_list_entries',
      'do_not_pick',
      'alliances',
      'alliance_slots',
      'alliance_declines',
      'metrics',
      'dashboards',
      'dashboard_charts',
      'weight_presets',
    ] satisfies PullEntityKey[]
  ).map((key) => [key, NO_ROWS]),
) as PullResponse['entities'];

const PULL: PullResponse = {
  watermark: '2026-03-17T10:00:00.000Z',
  next_cursor: null,
  complete: true,
  entities: {
    ...entities,
    app_settings: [
      {
        id: true,
        active_season_id: SEASON_ID,
        active_event_id: EVENT_ID,
        created_at: T0,
        updated_at: T0,
      },
    ],
    seasons: [SEASONS[0]!],
    events: [EVENT],
    teams: TEAMS,
    event_teams: ROSTER.map((t) => ({
      id: uid(KIND.roster, t.number),
      event_id: EVENT_ID,
      team_id: t.id,
      created_at: T0,
      updated_at: T0,
      deleted_at: null,
    })),
    matches: MATCHES.map(({ slots: _slots, ...row }) => row),
    match_teams: MATCHES.flatMap((m) =>
      m.slots.map((s) => ({
        id: uid(KIND.matchTeam, m.number * 10 + (s.alliance === 'red' ? 0 : 3) + s.station),
        match_id: m.id,
        alliance: s.alliance,
        station: s.station,
        team_id: s.team_id,
        created_at: T0,
        updated_at: T0,
      })),
    ),
    forms: [
      {
        id: FORM_ID,
        season_id: SEASON_ID,
        kind: 'match',
        name: 'Match scouting',
        active_version_id: FORM_VERSION_ID,
        timer_config: { phases: [] },
        created_at: T0,
        updated_at: T0,
      },
    ],
    form_versions: [
      {
        id: FORM_VERSION_ID,
        form_id: FORM_ID,
        version_no: 1,
        published_at: T0,
        is_locked: true,
        created_at: T0,
        updated_at: T0,
      },
    ],
    form_fields: FORM_FIELDS,
    scoring_rules: SCORING_RULES,
    users: USERS.map(({ entries: _entries, ...u }) => ({
      ...u,
      password_hash: PASSWORD_HASH,
      updated_at: T0,
    })),
    scouting_entries: ENTRIES,
  },
};

// ---------------------------------------------------------------------------------------
// RPC answers, by use-case name. A function receives the call's input.

type Answer = unknown | ((input: Record<string, unknown>) => unknown);

const matchesOf = (event_id: unknown) => (event_id === EVENT_ID ? MATCHES : []);

const RPC: Record<string, Answer> = {
  getActiveContext: { active_season_id: SEASON_ID, active_event_id: EVENT_ID },
  listSeasons: { items: SEASONS, next_cursor: null },
  listEvents: (input: Record<string, unknown>) => ({
    items: input.season_id === SEASON_ID ? EVENTS : [],
    next_cursor: null,
  }),
  listUsers: (input: Record<string, unknown>) => ({
    items: USERS.filter((u) => input.include_disabled === true || u.disabled_at === null).map(
      ({ entries: _entries, ...u }) => u,
    ),
    next_cursor: null,
  }),
  listTeams: (input: Record<string, unknown>) => {
    const q = typeof input.query === 'string' ? input.query.toLowerCase() : '';
    return {
      items: TEAMS.filter(
        (t) => !q || String(t.number).includes(q) || t.name.toLowerCase().includes(q),
      ),
      next_cursor: null,
    };
  },
  listEventRoster: (input: Record<string, unknown>) => ({
    items:
      input.event_id === EVENT_ID
        ? ROSTER.map((t) => ({ team_id: t.id, number: t.number, name: t.name }))
        : [],
  }),
  listMatches: (input: Record<string, unknown>) => ({
    items: matchesOf(input.event_id),
    next_cursor: null,
  }),
  countEntriesByScouter: (input: Record<string, unknown>) => ({
    items:
      input.season_id === SEASON_ID
        ? USERS.filter((u) => u.entries > 0)
            .sort((a, b) => b.entries - a.entries)
            .map((u) => ({ scouter_id: u.id, count: u.entries }))
        : [],
  }),
};

export const FIXTURE = { pull: PULL, rpc: RPC };
