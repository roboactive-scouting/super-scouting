import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { EVENT_ID, FIXTURE, SEASON_ID, teamId, userByName } from './fixtures';
import { setTextScale, shoot } from './shoot';

/**
 * Task 1.36: super scouting at `/super` (15-super/final, variant A: `super-phone.png`,
 * `super-desktop.png`). The pull is the shared fixture's plus the season's published super form
 * (Auto · Teleop · Notes, laid out like the design) and five super entries the lead (Noa Levi,
 * the design's user) already saved at 11:20; "seen here" counts come from the fixture's morning
 * match entries, a rotating eighth of which are Noa's.
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
    key: 'strengths',
    label: 'Strengths',
    help: 'What would make you pick it',
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

const NOA = userByName('noa.levi').id;
/** 11:20 in Tel Aviv on the fixture's competition day. */
const AT = '2026-03-17T09:20:00.000Z';
const DONE = [1574, 1937, 4338, 5951, 7112].map((number, i) => ({
  id: id(40 + i),
  form_version_id: SUPER_VERSION_ID,
  form_kind: 'super',
  event_id: EVENT_ID,
  match_id: null,
  team_id: teamId(number),
  alliance: null,
  scouter_id: NOA,
  robot_status: null,
  breakdown_seconds: null,
  data: {
    auto_reliability: 4,
    driver_skill: 4,
    defence: 'some',
    penalties: ['pinning'],
    strengths: 'Fast cycles on the near side',
  },
  version: 1,
  created_at: AT,
  updated_at: AT,
  client_created_at: AT,
  client_updated_at: AT,
  deleted_at: null,
}));

const entities = FIXTURE.pull.entities;
const PULL = {
  ...FIXTURE.pull,
  entities: {
    ...entities,
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
    scouting_entries: [...entities.scouting_entries, ...DONE],
  },
};

async function start(page: Page) {
  await signIn(page, 'lead', { overrides: { 'sync/pull': PULL } });
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
  await expect(page.getByText('5 of 22')).toBeVisible();
  await expect(page.getByRole('button', { name: /To do\s*17/ })).toHaveAttribute(
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
  await expect(page.getByText('6 of 22')).toBeVisible();

  // A done team reopens its entry, which says so.
  await page.getByRole('button', { name: /Done\s*6/ }).click();
  await page.getByRole('list', { name: 'Teams' }).getByRole('link', { name: /1574/ }).click();
  await expect(
    page.getByText('Editing your entry from 11:20 — your changes update it'),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await expect(page.getByRole('radio', { name: 'Some' })).toBeChecked();
  await shoot(page, 'super-reopened');
});
