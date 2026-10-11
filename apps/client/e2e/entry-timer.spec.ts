import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { FIXTURE, FORM, matchId, teamId } from './fixtures';
import { shoot } from './shoot';

/**
 * Task 1.34: the sticky match timer, the Timer field and the Event-log field with its "where?"
 * map (14-entry-parts/final `entry-parts-timer-phone.png`, `entry-parts-desktop.png`;
 * 12-form-builder/final `timer-phone.png`, `maps-phone.png`, `form-builder-desktop-try.png`).
 * The pull is the shared fixture's with the match form swapped for one with a 3:00 timer (Auto
 * 0:15 · Teleop 2:15 · Endgame 0:30), an event log that asks where in Teleop and a Timer field in
 * Endgame. Time is Playwright's clock: it flows, and each state is reached by setting it.
 */

const T0 = '2026-01-10T08:00:00.000Z';
const id = (n: number) => `0000000a-0000-4000-8000-${String(950 + n).padStart(12, '0')}`;

type Seed = {
  key: string;
  label: string;
  type: string;
  phase: 'auto' | 'teleop' | 'endgame' | 'post_match';
  help?: string;
  unit?: string;
  config?: Record<string, unknown>;
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
    key: 'auto_low',
    label: 'Pieces scored low',
    help: 'Lower goal',
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
    key: 'tele_shots',
    label: 'Shots',
    help: 'Tap the goal each time it shoots, then where it shot from',
    type: 'event_log',
    phase: 'teleop',
    config: {
      event_types: [
        { value: 'high', label: 'High goal' },
        { value: 'low', label: 'Low goal' },
        { value: 'miss', label: 'Missed' },
      ],
      ask_position: true,
      mirror_axis: 'horizontal',
    },
  },
  {
    key: 'tele_low',
    label: 'Pieces scored low',
    help: 'Lower goal',
    type: 'counter',
    phase: 'teleop',
    config: { min: 0, step: 1 },
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
  {
    key: 'end_climb_time',
    label: 'Climb time',
    help: 'From starting the climb to hanging',
    type: 'timer',
    phase: 'endgame',
    unit: 'seconds',
    config: { allow_unsure: true },
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
    forms: FIXTURE.pull.entities.forms.map((f) => ({
      ...f,
      timer_config: {
        phases: [
          { phase: 'auto', seconds: 15 },
          { phase: 'teleop', seconds: 135 },
          { phase: 'endgame', seconds: 30 },
        ],
      },
    })),
    form_fields: FIELDS,
    scoring_rules: [],
  },
};

/** Also the whole phone page: the field sits below the fold at 812 px. */
const LONG = { long: true };

const setTheme = (page: Page, theme: 'light' | 'outdoor') =>
  page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);

/** Shoots `name` in light, then `name-outdoor`; `before` re-sets the state each time. */
async function bothThemes(
  page: Page,
  name: string,
  only?: 'phone' | 'desktop',
  before: () => Promise<void> = async () => undefined,
  opts: { long?: boolean } = {},
) {
  await setTheme(page, 'light');
  await before();
  await shoot(page, name, only, opts);
  await setTheme(page, 'outdoor');
  await before();
  await shoot(page, `${name}-outdoor`, only, opts);
  await setTheme(page, 'light');
}

/** Opens the entry as `alliance`'s scout with Played picked, the clock installed first. */
async function openEntry(page: Page, team: number, alliance: 'red' | 'blue') {
  await page.clock.install();
  await signIn(page, 'scouter', { overrides: { 'sync/pull': PULL } });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/entry/${matchId(39)}/${teamId(team)}?alliance=${alliance}`);
  await page.getByRole('radio', { name: 'Played' }).click();
}

test('sticky match timer: ready, running, last 10 s, over, and the desktop bar', async ({
  page,
}) => {
  test.slow();
  await openEntry(page, 2630, 'red');
  const timer = page.getByRole('region', { name: 'Match timer' });
  await expect(timer.getByRole('button', { name: 'Start match' })).toBeVisible();
  await expect(timer.getByText('3:00 match')).toBeVisible();
  await bothThemes(page, 'entry-timer-ready', 'phone');

  await timer.getByRole('button', { name: 'Start match' }).click();
  const t0 = await page.evaluate(() => Date.now());
  /** The match clock `seconds` in, as if that long had passed since Start match. */
  const at = (seconds: number) => async () => {
    await page.clock.setSystemTime(t0 + seconds * 1000);
    await page.clock.runFor(300);
  };

  // Running, in Teleop: 0:48 of 3:00, 1:42 left in the phase.
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await at(48)();
  await expect(timer.getByText('TELEOP')).toBeVisible();
  await expect(page.getByTestId('match-countdown')).toHaveText('1:42');
  await bothThemes(page, 'entry-timer-running', 'phone', at(48));

  // Scrolled: the timer stays pinned under the top bar while the page moves.
  await page.mouse.wheel(0, 400);
  const top = await timer.evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.round(top)).toBe(54);

  // Last 10 s of Endgame: amber; and the reset with its Undo toast.
  await page.getByRole('tab', { name: 'Endgame' }).click();
  await at(172)();
  await expect(timer.getByText('ENDGAME')).toBeVisible();
  await expect(page.getByTestId('match-countdown')).toHaveAttribute('data-warn', 'true');
  await bothThemes(page, 'entry-timer-last10', 'phone', at(172));
  await timer.getByRole('button', { name: 'Reset match timer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Match timer reset' })).toBeVisible();
  await bothThemes(page, 'entry-timer-reset', 'phone');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(timer.getByText('ENDGAME')).toBeVisible();

  // Over: "MATCH OVER", and entry carries on (every control still works).
  await at(190)();
  await expect(timer.getByText('MATCH OVER')).toBeVisible();
  await expect(timer.getByText('keep entering')).toBeVisible();
  await page.getByText('High bar', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'High bar' })).toBeChecked();
  await bothThemes(page, 'entry-timer-over', 'phone');

  // Desktop: one slim bar across the top of the form card, in Teleop.
  await page.setViewportSize({ width: 1440, height: 900 });
  // (The clock is moved back to 0:48 first: the bar was still, showing MATCH OVER.)
  await at(48)();
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await expect(page.getByTestId('match-countdown')).toHaveText('1:42left in teleop');
  await bothThemes(page, 'entry-timer-desktop', 'desktop', at(48));
});

test('timer field: ready, running, paused and unsure', async ({ page }) => {
  test.slow();
  await openEntry(page, 2630, 'red');
  await page.getByRole('tab', { name: 'Endgame' }).click();
  await page.getByText('High bar', { exact: true }).click();
  const start = page.getByRole('button', { name: 'Start Climb time' });
  await expect(start).toBeVisible();
  await bothThemes(page, 'timer-field-ready', undefined, undefined, LONG);

  await start.click();
  const t0 = await page.evaluate(() => Date.now());
  const ran = (seconds: number) => async () => {
    await page.clock.setSystemTime(t0 + seconds * 1000);
    await page.clock.runFor(200);
  };
  await ran(6.4)();
  await expect(page.getByText('Running')).toBeVisible();
  await bothThemes(page, 'timer-field-running', undefined, ran(6.4), LONG);

  await ran(8.2)();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Paused')).toBeVisible();
  await expect(page.getByTestId('timer-face')).toContainText('8.');
  await bothThemes(page, 'timer-field-paused', undefined, undefined, LONG);

  await page.getByText('Unsure — no time').click();
  await expect(page.getByRole('switch', { name: 'Unsure — no time' })).toBeChecked();
  await expect(page.getByText('No time recorded · unsure')).toBeVisible();
  await bothThemes(page, 'timer-field-unsure', undefined, undefined, LONG);
});

/**
 * Every tap target in the Shots field with the box a finger can hit: the element's own box grown
 * by its `::after` hit area where it has one (the chips' ✕, the small Undo button).
 */
async function tapTargets(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector('[aria-label="Shots taps, newest first"]')!;
    const group = list.closest('[role="group"]')!;
    return [...group.querySelectorAll('button')].map((el) => {
      const r = el.getBoundingClientRect();
      const after = getComputedStyle(el, '::after');
      const grown =
        after.position === 'absolute' && after.content !== 'none'
          ? {
              left: r.left + parseFloat(after.left),
              top: r.top + parseFloat(after.top),
              right: r.right - parseFloat(after.right),
              bottom: r.bottom - parseFloat(after.bottom),
            }
          : r;
      return {
        name: el.getAttribute('aria-label') ?? el.textContent ?? '',
        left: Math.min(r.left, grown.left),
        top: Math.min(r.top, grown.top),
        right: Math.max(r.right, grown.right),
        bottom: Math.max(r.bottom, grown.bottom),
      };
    });
  });
}

/** Taps on the map drawing at (fx, fy) of its box. */
async function tapMap(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId('map-drawing').boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test('event log: taps as chips, and "where?" for a red scout', async ({ page }) => {
  test.slow();
  await openEntry(page, 2630, 'red');
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await page.getByRole('button', { name: 'Start match', exact: true }).click();
  await page.clock.runFor(18_000);

  // High goal at 0:18, placed near the red hub.
  await page.getByRole('button', { name: /^High goal, \d+ taps?$/ }).click();
  const map = page.getByRole('dialog', { name: 'High goal · where?' });
  await expect(map.getByText(/Shots · tap at 0:1\d · optional/)).toBeVisible();
  await tapMap(page, 0.5, 0.7); // phone: own end at the bottom
  await map.getByRole('button', { name: 'Save tap' }).click();

  // Missed at 0:41, skipped: time only.
  await page.clock.runFor(23_000);
  await page.getByRole('button', { name: /^Missed, \d+ taps?$/ }).click();
  await page.getByRole('button', { name: 'Skip · no place' }).click();
  await expect(
    page.getByRole('list', { name: 'Shots taps, newest first' }).getByRole('listitem'),
  ).toHaveCount(2);
  await bothThemes(page, 'event-log-chips', undefined, undefined, LONG);

  // Enough taps to wrap the chips onto several rows on a phone: no two tap targets in the field
  // (buttons, chip ✕s with their 48 px hit areas, Undo) overlap or sit closer than 8 px (17.7).
  await page.setViewportSize({ width: 375, height: 812 });
  for (let i = 0; i < 4; i++) {
    await page.clock.runFor(3_000);
    await page.getByRole('button', { name: /^Missed, \d+ taps?$/ }).click();
    await page.getByRole('button', { name: 'Skip · no place' }).click();
  }
  const targets = await tapTargets(page);
  const chipTops = new Set(
    targets.filter((t) => t.name.startsWith('Remove')).map((t) => Math.round(t.top)),
  );
  expect(chipTops.size, 'the chips wrap onto more than one row').toBeGreaterThan(1);
  for (const t of targets) {
    expect(t.right - t.left, `${t.name}: width`).toBeGreaterThanOrEqual(47.5);
    expect(t.bottom - t.top, `${t.name}: height`).toBeGreaterThanOrEqual(47.5);
  }
  for (const [i, a] of targets.entries()) {
    for (const b of targets.slice(i + 1)) {
      const apart = Math.max(
        b.left - a.right,
        a.left - b.right,
        b.top - a.bottom,
        a.top - b.bottom,
      );
      expect(apart, `${a.name} / ${b.name}: px apart`).toBeGreaterThanOrEqual(7.5);
    }
  }
  await shoot(page, 'event-log-chips-rows', 'phone');

  // The next tap's map, with the earlier placed tap grey and a new spot, at both widths.
  await page.clock.runFor(16_000);
  await page.getByRole('button', { name: /^High goal, \d+ taps?$/ }).click();
  await expect(map).toBeVisible();
  await tapMap(page, 0.62, 0.62);
  await expect(page.locator('[data-mark="old"]')).toHaveCount(1);
  await expect(page.locator('[data-mark="own"]')).toHaveCount(1);
  await bothThemes(page, 'where-map-red', 'phone');
  // A computer: the entry page is laid out anew, so the map opens again from a fresh tap.
  await map.getByRole('button', { name: 'Save tap' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await page.getByRole('button', { name: /^High goal, \d+ taps?$/ }).click();
  await expect(map.getByTestId('map-drawing')).toHaveAttribute('data-rotation', '0');
  await tapMap(page, 0.3, 0.38); // flat: own end on the left
  await expect(page.locator('[data-mark="old"]')).toHaveCount(2);
  await bothThemes(page, 'where-map-red', 'desktop');
});

test('event log "where?" for a blue scout: own end at the bottom / left', async ({ page }) => {
  test.slow();
  await openEntry(page, 4590, 'blue');
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await page.getByRole('button', { name: /^Low goal, \d+ taps?$/ }).click();
  const map = page.getByRole('dialog', { name: 'Low goal · where?' });
  await expect(map.getByTestId('map-drawing')).toHaveAttribute('data-rotation', '90');
  await tapMap(page, 0.4, 0.72);
  await bothThemes(page, 'where-map-blue', 'phone');
  await map.getByRole('button', { name: 'Save tap' }).click();
  await expect(page.locator('[data-pin]')).toHaveCount(1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await page.getByRole('button', { name: /^High goal, \d+ taps?$/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'High goal · where?' }).getByTestId('map-drawing'),
  ).toHaveAttribute('data-rotation', '180');
  await tapMap(page, 0.3, 0.4); // flat, turned: blue's end on the left
  await bothThemes(page, 'where-map-blue', 'desktop');
});
