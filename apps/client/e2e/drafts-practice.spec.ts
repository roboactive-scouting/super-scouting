import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { FIXTURE, FORM, matchId, teamId } from './fixtures';
import { shoot, THEMES } from './shoot';

/**
 * Task 1.37: draft recovery and practice mode (14-entry-parts/final `entry-parts-drafts-phone.png`).
 * The pull is the shared fixture's with the match form laid out like the design (Pieces scored
 * high / low per phase, a climb select, notes) and no match timer. The scout sits at Red 1; Q39's
 * Red 1 is 2630, so the unfinished entry is "Q39 · 2630 …, Red 1" where the design draws 1690.
 * The clock is 11:42 in Tel Aviv on the fixture's competition day.
 */

const T0 = '2026-01-10T08:00:00.000Z';
const id = (n: number) => `0000000c-0000-4000-8000-${String(n).padStart(12, '0')}`;

type Seed = {
  key: string;
  label: string;
  type: string;
  phase: 'auto' | 'teleop' | 'endgame' | 'post_match';
  help?: string;
  unit?: string;
  config?: Record<string, unknown>;
};

const COUNTER = { min: 0, step: 1 };
const SEEDS: Seed[] = [
  {
    key: 'auto_high',
    label: 'Pieces scored high',
    help: 'Upper goal',
    type: 'counter',
    phase: 'auto',
    config: COUNTER,
  },
  {
    key: 'auto_low',
    label: 'Pieces scored low',
    help: 'Lower goal',
    type: 'counter',
    phase: 'auto',
    config: COUNTER,
  },
  {
    key: 'tele_high',
    label: 'Pieces scored high',
    help: 'Upper goal',
    type: 'counter',
    phase: 'teleop',
    config: COUNTER,
  },
  {
    key: 'tele_low',
    label: 'Pieces scored low',
    help: 'Lower goal',
    type: 'counter',
    phase: 'teleop',
    config: COUNTER,
  },
  {
    key: 'end_climb',
    label: 'Climb level',
    help: 'Highest bar at the end of the match',
    type: 'single_select',
    phase: 'endgame',
    unit: 'enum',
    config: {
      options: [
        { value: 'none', label: 'None' },
        { value: 'park', label: 'Parked' },
        { value: 'low', label: 'Low bar' },
        { value: 'high', label: 'High bar' },
      ],
    },
  },
  { key: 'post_notes', label: 'Notes', type: 'long_text', phase: 'post_match', unit: 'text' },
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

const PULL = {
  ...FIXTURE.pull,
  entities: {
    ...FIXTURE.pull.entities,
    forms: FIXTURE.pull.entities.forms.map((f) => ({ ...f, timer_config: { phases: [] } })),
    form_fields: FIELDS,
    scoring_rules: [],
  },
};

/** 11:42 in Tel Aviv on the fixture's competition day. */
const AT = new Date('2026-03-17T09:42:00.000Z');

/**
 * Shoots `name` in light, then `name-outdoor` (shoot takes every theme since task 1.38), at each
 * width asked for; `before` re-sets a short-lived state (the Undo toast) before every picture.
 */
async function bothThemes(
  page: Page,
  name: string,
  widths: ('phone' | 'desktop')[] = ['phone', 'desktop'],
  before: () => Promise<void> = async () => undefined,
  opts: { long?: boolean } = {},
) {
  for (const width of widths) await shoot(page, name, width, { ...opts, before });
}

/** Signs in as a scouter at Red 1, with the design's form and the clock at 11:42. */
async function start(page: Page) {
  await page.clock.install({ time: AT });
  await signIn(page, 'scouter', { overrides: { 'sync/pull': PULL } });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/scout');
  const sheet = page.getByRole('dialog', { name: 'Choose your station' });
  await sheet.getByRole('button', { name: 'Red 1', exact: true }).click();
  await sheet.getByRole('button', { name: 'Use Red 1' }).click();
  await expect(sheet).toBeHidden();
}

/** Taps the plus of the `nth` "Pieces scored …" counter on screen `times` times. */
async function tap(page: Page, label: string, times: number) {
  for (let i = 0; i < times; i++) {
    await page
      .getByRole('button', { name: `${label} plus one` })
      .first()
      .click();
  }
}

test('draft recovery: the unfinished entry on Scout, Discard with Undo, and Resume', async ({
  page,
}) => {
  test.slow();
  await start(page);

  // Leave an entry unfinished: Played, two in Auto, then Teleop.
  await page.goto(`/entry/${matchId(39)}/${teamId(2630)}?alliance=red`);
  await page.getByRole('radio', { name: 'Played' }).click();
  await tap(page, 'Pieces scored high', 2);
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await tap(page, 'Pieces scored high', 4);
  await expect(page.getByText(/Draft saved on this device · 11:4\d/)).toBeVisible();

  // Next open of Scout: the Note at the top, the two cards at the foot.
  await page.goto('/scout');
  const offer = page.getByRole('region', { name: 'Unfinished entry' });
  await expect(offer).toContainText(
    /You have an unfinished entry: Q39 · 2630 .+, Red 1 — last change 11:4\d, on this device\./,
  );
  await expect(page.getByRole('link', { name: /Practice a match/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Super scouting/ })).toBeVisible();
  await bothThemes(page, 'scout-draft', undefined, undefined, { long: true });

  // Discard: the draft goes, with "Draft discarded · Undo"; Undo brings it back.
  const discard = async () => {
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Draft discarded' })).toBeVisible();
    await expect(offer).toBeHidden();
  };
  const undo = () => page.getByRole('button', { name: 'Undo' }).click();
  for (const theme of THEMES) {
    for (const width of ['phone', 'desktop'] as const) {
      await page.setViewportSize(
        width === 'phone' ? { width: 375, height: 812 } : { width: 1440, height: 900 },
      );
      await discard();
      await shoot(page, 'scout-draft-discarded', width, { themes: [theme] });
      await undo();
      await expect(offer).toBeVisible();
    }
  }

  // Resume opens it where it was: Teleop, with the four taps.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('tab', { name: 'Teleop', selected: true })).toBeVisible();
  await expect(page.getByLabel('Pieces scored high value').first()).toHaveText('4');
});

test('practice: the strip, the real form saving nothing, and Practice finished', async ({
  page,
}) => {
  test.slow();
  await start(page);
  // The robot Scout has picked (Q39 at Red 1) is the one practice opens.
  await page.getByLabel(/match number/i).fill('39');
  await page.getByRole('link', { name: /Practice a match/ }).click();
  await page.waitForURL(/\/entry\//);

  const strip = page.getByRole('status', { name: 'Practice mode' });
  await expect(strip).toContainText('PRACTICE');
  await expect(strip).toContainText('Nothing is saved');
  await expect(page.getByText('Practice · not saved')).toBeVisible();
  await page.getByRole('radio', { name: 'Played' }).click();
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await tap(page, 'Pieces scored high', 4);
  await tap(page, 'Pieces scored low', 1);
  await expect(page.getByRole('button', { name: 'Finish practice' })).toBeVisible();
  await expect(page.getByRole('button', { name: /review entry/i })).toHaveCount(0);
  await bothThemes(page, 'practice-entry');

  // Finish practice: the form's own rules, then the sheet (a dialog on a computer).
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Finish practice' }).click();
  const done = page.getByRole('dialog', { name: 'Practice finished' });
  await expect(done).toContainText('Nothing was saved or sent.');
  await bothThemes(page, 'practice-finished');

  // Exit practice: back on Scout, the strip gone, and no draft to offer from the practice.
  await page.setViewportSize({ width: 375, height: 812 });
  await done.getByRole('button', { name: 'Exit practice' }).click();
  await page.waitForURL('/scout');
  await expect(strip).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Unfinished entry' })).toHaveCount(0);
  const outbox = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('robactive-scouting');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const count = open.result.transaction('outbox').objectStore('outbox').count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => reject(count.error);
        };
      }),
  );
  expect(outbox, 'practice wrote nothing to the outbox').toBe(0);
});

test('practice: the strip on a screen that is not an entry', async ({ page }) => {
  await start(page);
  await page.getByRole('link', { name: /Practice a match/ }).click();
  await page.waitForURL(/\/entry\//);
  // In-app, as a scout would: a reload ends practice (it is a session flag, SPEC-FINAL 8.5).
  await page.getByRole('link', { name: '‹ Scout' }).click();
  await page.waitForURL('/scout');
  await expect(page.getByRole('status', { name: 'Practice mode' })).toContainText(
    'Nothing is saved',
  );
  await bothThemes(page, 'practice-scout', ['phone']);
});
