import { expect, test } from '@playwright/test';
import { signIn } from './api-mock';
import { FIXTURE, FORM, matchId, teamId } from './fixtures';
import { setTextScale, shoot } from './shoot';

/**
 * Task 1.36: the range block and required fields (14-entry-parts/final,
 * `entry-parts-rules-phone.png`, `entry-parts-desktop.png`, `entry-parts-desktop-review.png`).
 * The pull is the shared fixture's with the match form swapped for one laid out like the
 * design: Teleop has a counter, "Cycle estimate" (seconds, expected 3–60) and a multi select;
 * Endgame a required "Climb level" and a star rating; Notes a rating and a computed total.
 */

const T0 = '2026-01-10T08:00:00.000Z';
const id = (n: number) => `0000000a-0000-4000-8000-${String(970 + n).padStart(12, '0')}`;

type Seed = {
  key: string;
  label: string;
  type: string;
  phase: 'auto' | 'teleop' | 'endgame' | 'post_match';
  help?: string;
  unit?: string;
  required?: boolean;
  config?: Record<string, unknown>;
  expected_range?: { min: number; max: number };
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
    type: 'rating',
    phase: 'endgame',
    config: { max: 5, style: 'stars' },
  },
  {
    key: 'post_driver',
    label: 'Driver skill',
    help: 'How well they drove',
    type: 'rating',
    phase: 'post_match',
    config: { max: 5, style: 'stars' },
  },
  {
    key: 'post_notes',
    label: 'Anything else',
    type: 'long_text',
    phase: 'post_match',
    unit: 'text',
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
  description: `${s.label} (fixture)`,
  unit: s.unit ?? 'count',
  phase: s.phase,
  direction: 'higher_is_better',
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

test('entry rules: the range block as you type, the problems list, and Go to', async ({ page }) => {
  test.slow();
  await signIn(page, 'scouter', { overrides: { 'sync/pull': PULL } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/entry/${matchId(39)}/${teamId(2630)}?alliance=red`);
  await page.getByRole('radio', { name: 'Played' }).click();
  await page.getByRole('button', { name: 'Pieces scored high plus one' }).click();
  await page.getByRole('tab', { name: 'Teleop' }).click();
  const plus = page.getByRole('button', { name: 'Pieces scored high plus one' });
  for (let i = 0; i < 4; i++) await plus.click();

  // As it is typed: the amber edge and the limit in words; the value is kept.
  const cycle = page.getByLabel('Cycle estimate');
  await cycle.fill('140');
  await expect(page.getByText('Most is 60 seconds — check this number')).toBeVisible();
  await expect(cycle).toHaveValue('140');
  await expect(cycle).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Between 3 and 60')).toHaveCount(0);
  await page.getByText('Near', { exact: true }).click();
  await page.getByText('Far', { exact: true }).click();
  // Desktop: the side panel rings Teleop and says what is left to fix.
  const panel = page.getByRole('complementary', { name: 'This entry' });
  await expect(panel.getByRole('button', { name: /Teleop/ })).toContainText('1 to fix');
  await cycle.blur();
  await shoot(page, 'entry-rules-range');

  // Review entry stays pressable; it opens the problems instead of the confirmation.
  await page.setViewportSize({ width: 1440, height: 900 });
  await panel.getByRole('button', { name: 'Review entry' }).click();
  const dialog = page.getByRole('dialog', { name: '2 things to fix first' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Teleop · 140 is over the most, 60');
  await expect(dialog).toContainText('Endgame · required, not answered');
  await shoot(page, 'entry-rules-problems');
  // Task 1.38: the largest in-app text size (150 %) must not break the layout (SPEC-FINAL 17.7).
  await setTextScale(page, 1.5);
  await shoot(page, 'entry-rules-problems-150');
  await setTextScale(page, 1);

  // Go to lands on the field, marked; on a phone the sheet does the same.
  await page
    .getByRole('dialog', { name: '2 things to fix first' })
    .getByRole('button', { name: 'Go to Climb level' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Endgame' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Required — pick one')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'None' })).toBeFocused();
  await shoot(page, 'entry-rules-goto');

  // Fixing both lets Review entry confirm.
  await page.getByText('Low', { exact: true }).click();
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await page.getByLabel('Cycle estimate').fill('14');
  await expect(page.getByText(/check this number/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Review entry' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Confirm this entry' })).toBeVisible();
});
