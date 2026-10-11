import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { FIXTURE, FORM, matchId, teamId } from './fixtures';
import { shoot } from './shoot';

/**
 * Task 1.33: every simple field type on the Entry page (14-entry-parts/final,
 * entry-parts-fields-phone.png and entry-parts-desktop.png). The pull is the shared fixture's
 * with the match form swapped for one holding each type, laid out like the design: Teleop has
 * a counter, a number with its unit and range, and a multi select; Endgame a required select,
 * a star rating and a short text; Notes two sections, a slider rating, a star rating and a
 * computed total.
 */

const T0 = '2026-01-10T08:00:00.000Z';
const id = (n: number) => `0000000a-0000-4000-8000-${String(900 + n).padStart(12, '0')}`;

type Seed = {
  key: string;
  label: string;
  type: string;
  phase: 'auto' | 'teleop' | 'endgame' | 'post_match' | null;
  help?: string;
  unit?: string | null;
  required?: boolean;
  config?: Record<string, unknown>;
  expected_range?: { min: number; max: number } | null;
};

const SEEDS: Seed[] = [
  {
    key: 'auto_high',
    label: 'Pieces scored high',
    help: 'Upper goal',
    type: 'counter',
    phase: 'auto',
    config: { min: 0, step: 1 },
  },
  {
    key: 'auto_leave',
    label: 'Left the starting zone',
    type: 'toggle',
    phase: 'auto',
    unit: 'boolean',
  },
  {
    key: 'tele_high',
    label: 'Pieces scored high',
    help: 'Upper goal',
    type: 'counter',
    phase: 'teleop',
    config: { min: 0, step: 1 },
  },
  {
    key: 'tele_cycle',
    label: 'Cycle estimate',
    help: 'Your best guess of seconds per cycle',
    type: 'number',
    phase: 'teleop',
    unit: 'seconds',
    config: { min: 0 },
    expected_range: { min: 3, max: 60 },
  },
  {
    key: 'tele_from',
    label: 'Scored from',
    type: 'multi_select',
    phase: 'teleop',
    unit: 'enum',
    config: {
      options: [
        { value: 'near', label: 'Near' },
        { value: 'mid', label: 'Mid' },
        { value: 'far', label: 'Far' },
      ],
    },
  },
  {
    key: 'end_climb',
    label: 'Climb level',
    type: 'single_select',
    phase: 'endgame',
    unit: 'enum',
    required: true,
    config: {
      options: [
        { value: 'none', label: 'None' },
        { value: 'park', label: 'Parked' },
        { value: 'low', label: 'Low' },
        { value: 'high', label: 'High' },
      ],
    },
  },
  {
    key: 'end_stability',
    label: 'Climb stability',
    help: 'How steady it hung',
    type: 'rating',
    phase: 'endgame',
    config: { max: 5, style: 'stars' },
  },
  {
    key: 'end_on',
    label: 'What it climbed on',
    type: 'short_text',
    phase: 'endgame',
    unit: 'text',
  },
  { key: 'post_driver_section', label: 'Driver', type: 'section', phase: null, unit: null },
  {
    key: 'post_speed',
    label: 'Driving speed',
    help: '1 slow · 5 fast',
    type: 'rating',
    phase: 'post_match',
    config: { max: 5, style: 'slider' },
  },
  {
    key: 'post_driver',
    label: 'Driver skill',
    help: 'How well they drove',
    type: 'rating',
    phase: 'post_match',
    config: { max: 5, style: 'stars' },
  },
  { key: 'post_totals_section', label: 'Totals', type: 'section', phase: null, unit: null },
  {
    key: 'post_total',
    label: 'Total pieces scored',
    help: 'auto + teleop, high goal',
    type: 'computed',
    phase: 'post_match',
    config: {
      result_type: 'float',
      expression: {
        kind: 'op',
        op: '+',
        left: { kind: 'field', key: 'auto_high' },
        right: { kind: 'field', key: 'tele_high' },
      },
    },
  },
];

const FIELDS = SEEDS.map((s, i) => ({
  id: id(i + 1),
  form_version_id: FORM.version_id,
  key: s.key,
  label: s.label,
  help_text: s.help ?? null,
  type: s.type,
  section: null,
  display_order: i + 1,
  required: s.required ?? false,
  default_value: null,
  config: s.config ?? {},
  visibility_condition: null,
  deprecated: false,
  description: s.type === 'section' ? null : `${s.label} (fixture)`,
  unit: s.unit === undefined ? 'count' : s.unit,
  phase: s.phase,
  direction: s.type === 'section' ? null : 'higher_is_better',
  category: null,
  expected_range: s.expected_range ?? null,
  include_in_ai_context: null,
  is_ordinal: null,
  created_at: T0,
  updated_at: T0,
}));

const PULL = {
  ...FIXTURE.pull,
  entities: { ...FIXTURE.pull.entities, form_fields: FIELDS, scoring_rules: [] },
};

async function bothThemes(page: Page, name: string, only?: 'phone' | 'desktop') {
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  await shoot(page, name, only, { long: true });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'outdoor'));
  await shoot(page, `${name}-outdoor`, only, { long: true });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
}

test('entry fields: every simple type, filled, at both widths and in both themes', async ({
  page,
}) => {
  test.slow();
  await signIn(page, 'scouter', { overrides: { 'sync/pull': PULL } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/entry/${matchId(39)}/${teamId(2630)}?alliance=red`);
  await page.getByRole('radio', { name: 'Played' }).click();

  // Auto: five high, left the zone.
  const autoPlus = page.getByRole('button', { name: 'Pieces scored high plus one' });
  for (let i = 0; i < 5; i++) await autoPlus.click();
  await page.getByText('Left the starting zone').click();

  // Teleop: four high, a 14 s cycle, Near and Far (then Mid, taken back by Undo).
  await page.getByRole('tab', { name: 'Teleop' }).click();
  const telePlus = page.getByRole('button', { name: 'Pieces scored high plus one' });
  for (let i = 0; i < 4; i++) await telePlus.click();
  // A counter is never a text box.
  await expect(page.getByRole('spinbutton', { name: 'Pieces scored high' })).toHaveCount(0);
  await page.getByLabel('Cycle estimate').fill('14');
  await expect(page.getByText('Between 3 and 60')).toBeVisible();
  await page.getByText('Near', { exact: true }).click();
  await page.getByText('Mid', { exact: true }).click();
  await page.getByRole('button', { name: 'Undo “Mid”' }).click();
  await page.getByText('Far', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Near' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Mid' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Far' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Undo “Far”' })).toBeVisible();

  // Desktop field row: the control sits in a 440 px column at the right of the card.
  const number = page.getByLabel('Cycle estimate');
  expect(Math.round((await number.boundingBox())!.width)).toBe(440);
  const multi = page.getByRole('group', { name: 'Scored from' });
  expect(Math.round((await multi.boundingBox())!.width)).toBe(440);
  await bothThemes(page, 'entry-fields-teleop');

  // Endgame: the required select unanswered, stability Good, a short text.
  await page.getByRole('tab', { name: 'Endgame' }).click();
  await expect(page.getByText('Required')).toBeVisible();
  await page.getByText('Good', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Good, 4 of 5' })).toBeChecked();
  await page.getByLabel('What it climbed on').fill('Left chain');
  await bothThemes(page, 'entry-fields-endgame');

  // Notes: speed 4 on the slider, driver skill OK, and the total worked out from the counters.
  await page.getByRole('tab', { name: 'Notes' }).click();
  await page.getByRole('slider', { name: 'Driving speed' }).fill('4');
  await page.getByText('OK', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Driver', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Totals', level: 3 })).toBeVisible();
  await expect(page.getByLabel('Total pieces scored')).toHaveText('9');
  await bothThemes(page, 'entry-fields-notes');
});
