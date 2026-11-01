import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { EVENT_ID, FIXTURE, SEASON_ID, teamId, userByName } from './fixtures';
import { setTextScale, shoot } from './shoot';

/**
 * Task 1.36: super scouting at `/super` (15-super/final, variant A: `super-phone.png`,
 * `super-desktop.png`). The pull is the shared fixture's plus the season's published super form
 * (Auto · Teleop · Notes, laid out like the design) and six super entries (22-super-readonly's
 * picker): three by whoever is signed in, one each by Dana Mor, Omer and Amit; "seen here"
 * counts come from the fixture's morning match entries, a rotating eighth of which are Noa's.
 * Task 1.47 side task 2: the Done tags name who, and a scouter reads Dana's entry read only.
 */

const T0 = '2026-01-10T08:00:00.000Z';
const id = (n: number) => `0000000b-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SUPER_FORM_ID = id(1);
const SUPER_VERSION_ID = id(2);

type Seed = {
  key: string;
  label: string;
  type: string;
  phase: 'auto' | 'teleop' | 'post_match';
  help?: string;
  unit?: string;
  config?: Record<string, unknown>;
};

const SEEDS: Seed[] = [
  {
    key: 'auto_reliability',
    label: 'Auto reliability',
    help: 'How often its auto worked',
    type: 'rating',
    phase: 'auto',
    config: { max: 5, style: 'stars' },
  },
  {
    key: 'start_position',
    label: 'Start position',
    help: 'Where it usually starts',
    type: 'position',
    phase: 'auto',
    unit: 'coordinate',
    config: { multi_point: false, mirror_axis: 'horizontal' },
  },
  {
    key: 'driver_skill',
    label: 'Driver skill',
    help: 'Across every match you watched',
    type: 'rating',
    phase: 'teleop',
    config: { max: 5, style: 'stars' },
  },
  {
    key: 'defence',
    label: 'Defence',
    type: 'single_select',
    phase: 'teleop',
    unit: 'enum',
    config: {
      options: [
        { value: 'none', label: 'None' },
        { value: 'some', label: 'Some' },
        { value: 'lots', label: 'Lots' },
      ],
    },
  },
  {
    key: 'penalties',
    label: 'Penalties seen',
    type: 'multi_select',
    phase: 'teleop',
    unit: 'enum',
    config: {
      options: [
        { value: 'pinning', label: 'Pinning' },
        { value: 'contact', label: 'Contact' },
        { value: 'over_limit', label: 'Over limit' },
      ],
    },
  },
  {
    key: 'scoring_spots',
    label: 'Scoring spots',
    help: 'Where it scored from',
    type: 'position',
    phase: 'teleop',
    unit: 'coordinate',
    config: { multi_point: true, mirror_axis: 'horizontal' },
  },
  {
    key: 'strengths',
    label: 'Strengths',
    help: 'What would make you pick it',
    type: 'long_text',
    phase: 'post_match',
    unit: 'text',
  },
  {
    key: 'weaknesses',
    label: 'Weaknesses',
    help: 'What would make you pass on it',
    type: 'long_text',
    phase: 'post_match',
    unit: 'text',
  },
];

const FIELDS = SEEDS.map((s, i) => ({
  id: id(10 + i),
  form_version_id: SUPER_VERSION_ID,
  key: s.key,
  label: s.label,
  help_text: s.help ?? null,
  type: s.type,
  section: null,
  display_order: i + 1,
  required: false,
  default_value: null,
  config: s.config ?? {},
  visibility_condition: null,
  deprecated: false,
  description: `${s.label} (fixture)`,
  unit: s.unit ?? 'count',
  phase: s.phase,
  direction: 'higher_is_better',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
  created_at: T0,
  updated_at: T0,
}));

/**
 * Task 1.47 side task 2 (22-super-readonly/final): Dana Mor, a scouter this device holds, wrote
 * 1690's super entry; she scouted 1690 in five of the morning's matches (fixture entries by
 * scouters other than the two signed in here, handed to her).
 */
const DANA = {
  id: '00000004-0000-4000-8000-000000000099',
  username: 'dana.m',
  full_name: 'Dana Mor',
  role: 'scouter' as const,
  must_change_password: false,
  disabled_at: null,
  created_at: T0,
  password_hash: FIXTURE.pull.entities.users[0]!.password_hash,
  updated_at: T0,
};
const NOA = userByName('noa.levi').id;
const YAEL = userByName('yael.s').id;
const OMER = userByName('omer.k').id;
const AMIT = userByName('amit.bd').id;

/** Tel Aviv on the fixture's competition day (UTC+2): "11:20" → its ISO time. */
const at = (time: string) => {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return `2026-03-17T${String(h - 2).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
};
const spot = (x: number, y: number) => ({ x, y });
const ANSWERS = {
  auto_reliability: 4,
  start_position: spot(0.12, 0.3),
  driver_skill: 4,
  defence: 'some',
  penalties: ['pinning'],
  scoring_spots: [
    spot(0.3, 0.2),
    spot(0.34, 0.42),
    spot(0.4, 0.6),
    spot(0.28, 0.7),
    spot(0.45, 0.35),
  ],
  strengths: 'Fast cycles on the near side; quick to recover after contact',
  weaknesses: 'Slow to climb; tips when pushed hard',
};

/**
 * The super entries the device holds (22 final's picker): `me` is whoever is signed in, so their
 * own read "You"; the others are Dana's, Omer's and Amit's. [team, author, first saved, last changed]
 */
function superEntries(me: string) {
  const rows: [number, string, string, string][] = [
    [1574, me, '11:02', '11:02'],
    [1690, DANA.id, '10:40', '11:12'],
    [1937, me, '10:40', '10:51'],
    [4338, OMER, '09:58', '09:58'],
    [3075, me, '11:20', '11:20'],
    [4590, AMIT, '10:15', '10:30'],
  ];
  return rows.map(([number, scouter, first, last], i) => ({
    id: id(40 + i),
    form_version_id: SUPER_VERSION_ID,
    form_kind: 'super',
    event_id: EVENT_ID,
    match_id: null,
    team_id: teamId(number),
    alliance: null,
    scouter_id: scouter,
    robot_status: null,
    breakdown_seconds: null,
    data: ANSWERS,
    version: 1,
    created_at: at(first),
    updated_at: at(last),
    client_created_at: at(first),
    client_updated_at: at(last),
    deleted_at: null,
  }));
}

const entities = FIXTURE.pull.entities;
/** Five of the morning's 1690 match entries by neither signed-in user become Dana's. */
const danas = new Set(
  entities.scouting_entries
    .filter((e) => e.team_id === teamId(1690) && e.scouter_id !== NOA && e.scouter_id !== YAEL)
    .slice(0, 5)
    .map((e) => e.id),
);
const pullFor = (me: string) => ({
  ...FIXTURE.pull,
  entities: {
    ...entities,
    users: [...entities.users, DANA],
    forms: [
      ...entities.forms,
      {
        id: SUPER_FORM_ID,
        season_id: SEASON_ID,
        kind: 'super',
        name: 'Super scouting',
        active_version_id: SUPER_VERSION_ID,
        timer_config: { phases: [] },
        created_at: T0,
        updated_at: T0,
      },
    ],
    form_versions: [
      ...entities.form_versions,
      {
        id: SUPER_VERSION_ID,
        form_id: SUPER_FORM_ID,
        version_no: 1,
        published_at: T0,
        is_locked: true,
        created_at: T0,
        updated_at: T0,
      },
    ],
    form_fields: [...entities.form_fields, ...FIELDS],
    scouting_entries: [
      ...entities.scouting_entries.map((e) =>
        danas.has(e.id) ? { ...e, scouter_id: DANA.id } : e,
      ),
      ...superEntries(me),
    ],
  },
});

async function start(page: Page, role: 'lead' | 'scouter' = 'lead') {
  const me = role === 'lead' ? NOA : YAEL;
  await signIn(page, role, { overrides: { 'sync/pull': pullFor(me) } });
}

test('super: the Scout card, the picker and the form, at both widths', async ({ page }) => {
  test.slow();
  await start(page);

  // The way in: a card at the foot of Scout (a station first: a fresh device asks for one).
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/scout');
  const sheet = page.getByRole('dialog', { name: 'Choose your station' });
  await sheet.getByRole('button', { name: 'Red 1', exact: true }).click();
  await sheet.getByRole('button', { name: 'Use Red 1' }).click();
  await expect(sheet).toBeHidden();
  const card = page.getByRole('link', { name: /Super scouting/ });
  await expect(card).toContainText('One entry per team for the whole event');
  await shoot(page, 'scout-super-card');

  await card.click();
  await expect(page).toHaveURL(/\/super$/);
  await expect(page.getByRole('heading', { name: 'Super scouting', level: 1 })).toBeVisible();
  await expect(page.getByText('Super-scouted on this device')).toBeVisible();
  await expect(page.getByText('6 of 22')).toBeVisible();
  await expect(page.getByRole('button', { name: /To do\s*16/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // No match, alliance or robot status anywhere.
  await expect(page.getByRole('radio', { name: 'Played' })).toHaveCount(0);
  await shoot(page, 'super-picker', undefined, { long: true });
  // Task 1.38: the largest in-app text size (150 %) must not break the layout (SPEC-FINAL 17.7).
  await setTextScale(page, 1.5);
  await shoot(page, 'super-picker-150', undefined, { long: true });
  await setTextScale(page, 1);

  // The form for the most-seen team to do.
  await page.setViewportSize({ width: 1440, height: 900 });
  const teams = page.getByRole('list', { name: 'Teams' });
  const first = teams.getByRole('link').first();
  await first.click();
  await expect(page.getByText('SUPER', { exact: true })).toBeVisible();
  await expect(page.getByText('Seen here in')).toBeVisible();
  await expect(page.getByText(/· the whole event/)).toBeVisible();
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await expect(page.getByRole('tab')).toHaveText(['Auto', 'Teleop', 'Notes']);
  await expect(page.getByRole('button', { name: /Start match/ })).toHaveCount(0);
  await shoot(page, 'super-form');

  // The confirmation names the team and the event, and records no match.
  // Crossing 1024 px redraws the page as the phone's (the draft keeps what was entered).
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await page.getByText('Good', { exact: true }).click();
  await page.getByText('Some', { exact: true }).click();
  await page.getByText('Pinning', { exact: true }).click();
  await page.getByRole('button', { name: 'Review entry' }).click();
  const confirm = page.getByRole('dialog', { name: 'Submit the super entry?' });
  await expect(confirm).toContainText('the whole event. No match is recorded.');
  await shoot(page, 'super-confirm');
  await confirm.getByRole('button', { name: 'Submit entry' }).click();
  await expect(page.getByRole('status', { name: 'Super entry saved' })).toBeVisible();
  await expect(page.getByText('7 of 22')).toBeVisible();

  // A done team reopens its entry, which says so.
  await page.getByRole('button', { name: /Done\s*7/ }).click();
  await page.getByRole('list', { name: 'Teams' }).getByRole('link', { name: /1574/ }).click();
  await expect(
    page.getByText('Editing your entry from 11:02 — your changes update it'),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await expect(page.getByRole('radio', { name: 'Some' })).toBeChecked();
  await shoot(page, 'super-reopened');
});

test('super: names on the picker’s Done rows, and another scouter’s entry read only', async ({
  page,
}) => {
  test.slow();
  // Yael is a scouter: Dana's entry for 1690 is hers to read, not to change (22 final).
  await start(page, 'scouter');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/super');
  await page.getByRole('button', { name: /Done\s*6/ }).click();
  const teams = page.getByRole('list', { name: 'Teams' });
  await expect(teams.getByRole('link')).toHaveText([
    /1574.*✓ You 11:02$/,
    /1690.*✓ Dana 10:40$/,
    /1937.*✓ You 10:40$/,
    /3075.*✓ You 11:20$/,
    /4338.*✓ Omer 09:58$/,
    /4590.*✓ Amit 10:15$/,
  ]);
  await expect(page.getByText('6 of 22')).toBeVisible();
  await shoot(page, 'super-picker-names', undefined, { long: true });

  await teams.getByRole('link', { name: /1690/ }).click();
  await expect(page).toHaveURL(/\/super\/[0-9a-f-]+$/);
  await expect(page.getByText('Read only', { exact: true })).toBeVisible();
  await expect(page.getByText('Dana Mor’s entry')).toBeVisible();
  await expect(
    page.getByText('Started 10:40 · last changed 11:12 · seen in 5 matches'),
  ).toBeVisible();
  await expect(page.getByText('Only Dana, a lead or an admin can change it.')).toBeVisible();
  await expect(page.getByText(/is locked/)).toHaveCount(0);
  // Nothing edits: no field control, no phase tabs, no Review entry.
  for (const role of ['radio', 'checkbox', 'textbox', 'tab'] as const)
    await expect(page.getByRole('main').getByRole(role)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review entry' })).toHaveCount(0);
  await expect(
    page.getByText('Fast cycles on the near side; quick to recover after contact'),
  ).toBeVisible();
  // As the design's computer: the picker beside it on Done, 1690 marked as the one open.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: /Done\s*6/ }).click();
  await expect(teams.getByRole('link', { name: /1690/ })).toHaveAttribute('aria-current', 'page');
  await shoot(page, 'super-readonly', undefined, { long: true });

  // A map row opens the map view only.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Scoring spots: 5 spots' }).click();
  const map = page.getByRole('dialog', { name: 'Scoring spots' });
  await expect(map.getByText('View only')).toBeVisible();
  await shoot(page, 'super-readonly-map', 'phone');
});
