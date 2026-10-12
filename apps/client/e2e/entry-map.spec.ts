import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { FIXTURE, FORM, matchId, teamId } from './fixtures';
import { shoot } from './shoot';

/**
 * Task 1.35: the position picker and the cycle path, on the shared map (12-form-builder/final
 * `maps-phone.png`, `form-builder-desktop-try.png`, `form-builder-desktop-try-cycle.png`). The
 * pull is the shared fixture's with the match form swapped for one with two position fields in
 * Auto (a list of spots and one start point) and a cycle path in Teleop, all mirrored left ↔ right
 * for the blue alliance.
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
  config?: Record<string, unknown>;
};

const MIRROR = { mirror_axis: 'horizontal' };

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
    key: 'auto_score_spots',
    label: 'Scoring spots',
    help: 'Where it scored from',
    type: 'position',
    phase: 'auto',
    unit: 'coordinate',
    config: { multi_point: true, ...MIRROR },
  },
  {
    key: 'auto_start',
    label: 'Start position',
    help: 'Where the robot started',
    type: 'position',
    phase: 'auto',
    unit: 'coordinate',
    config: { multi_point: false, ...MIRROR },
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
    key: 'tele_cycle_routes',
    label: 'Cycle routes',
    help: 'The route of each cycle',
    type: 'cycle_path',
    phase: 'teleop',
    unit: 'coordinate',
    config: { max_points_per_cycle: 6, ...MIRROR },
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
  direction: 'neutral',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
  created_at: T0,
  updated_at: T0,
}));

const PULL = {
  ...FIXTURE.pull,
  entities: { ...FIXTURE.pull.entities, form_fields: FIELDS, scoring_rules: [] },
};

/** Shoots `name` in light, then `name-outdoor` (shoot takes every theme since task 1.38). */
async function bothThemes(
  page: Page,
  name: string,
  only?: 'phone' | 'desktop',
  opts: { long?: boolean } = {},
) {
  await shoot(page, name, only, opts);
}

/** Opens the entry as `alliance`'s scout with Played picked, at `width`. */
async function openEntry(page: Page, team: number, alliance: 'red' | 'blue', width = 375) {
  await signIn(page, 'scouter', { overrides: { 'sync/pull': PULL } });
  await page.setViewportSize(width === 375 ? { width, height: 812 } : { width, height: 900 });
  await page.goto(`/entry/${matchId(39)}/${teamId(team)}?alliance=${alliance}`);
  await page.getByRole('radio', { name: 'Played' }).click();
}

/** Taps the map drawing at (fx, fy) of its box. */
async function tapMap(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId('map-drawing').boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test('position: map buttons in the form, and the full-screen map for a red scout', async ({
  page,
}) => {
  test.slow();
  await openEntry(page, 2630, 'red');
  const spots = page.getByRole('button', { name: /^Scoring spots: / });
  const start = page.getByRole('button', { name: /^Start position: / });
  await expect(spots).toHaveAccessibleName('Scoring spots: Mark on the map');
  await expect(start).toHaveAccessibleName('Start position: Mark on the map');
  await bothThemes(page, 'map-buttons-empty', 'phone', { long: true });

  // Three spots, upright with red at the bottom: near the red end and around the red hub.
  await spots.click();
  const map = page.getByRole('dialog', { name: 'Scoring spots' });
  await expect(map.getByText('Q39 · 2630 · Auto')).toBeVisible();
  await tapMap(page, 0.3, 0.8);
  await tapMap(page, 0.65, 0.66);
  await tapMap(page, 0.4, 0.6);
  await expect(map.getByRole('button', { name: /^Spot \d$/ })).toHaveCount(3);
  // Tap spot 2: selected, with ✕ Remove above it.
  await map.getByRole('button', { name: 'Spot 2' }).click();
  await expect(map.getByRole('button', { name: 'Remove spot 2' })).toBeVisible();
  await expect(map.getByText('Spot 2 selected')).toBeVisible();
  await bothThemes(page, 'position-map-red', 'phone');

  // Tapping the map elsewhere keeps it; Done shows the count on the button.
  await tapMap(page, 0.5, 0.3);
  await expect(map.getByRole('button', { name: /^Spot \d$/ })).toHaveCount(3);
  await expect(map.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
  await map.getByRole('button', { name: 'Done' }).click();
  await expect(spots).toHaveAccessibleName('Scoring spots: 3 spots');
  await bothThemes(page, 'map-buttons', 'phone', { long: true });
});

test('position: the computer dialog, own end on the left; Delete removes the selection', async ({
  page,
}) => {
  test.slow();
  await openEntry(page, 2630, 'red', 1440);
  await page.getByRole('button', { name: /^Scoring spots: / }).click();
  const map = page.getByRole('dialog', { name: 'Scoring spots' });
  await expect(map.getByTestId('map-drawing')).toHaveAttribute('data-rotation', '0');
  await tapMap(page, 0.17, 0.3);
  await tapMap(page, 0.27, 0.66);
  await tapMap(page, 0.36, 0.44);
  await tapMap(page, 0.6, 0.5);
  await map.getByRole('button', { name: 'Spot 4' }).click();
  await page.keyboard.press('Delete');
  await expect(map.getByRole('button', { name: /^Spot \d$/ })).toHaveCount(3);
  await map.getByRole('button', { name: 'Spot 2' }).click();
  await expect(map.getByRole('button', { name: 'Remove spot 2' })).toBeVisible();
  await bothThemes(page, 'position-map-red', 'desktop');
  await map.getByRole('button', { name: 'Done' }).click();
  await bothThemes(page, 'map-buttons', 'desktop');
});

test('position for a blue scout: blue at the bottom, the spot stored mirrored', async ({
  page,
}) => {
  test.slow();
  await openEntry(page, 4590, 'blue');
  await page.getByRole('button', { name: /^Scoring spots: / }).click();
  const map = page.getByRole('dialog', { name: 'Scoring spots' });
  await expect(map.getByTestId('map-drawing')).toHaveAttribute('data-rotation', '90');
  await tapMap(page, 0.35, 0.78);
  await tapMap(page, 0.6, 0.62);
  await map.getByRole('button', { name: 'Spot 1' }).click();
  await expect(map.getByRole('button', { name: 'Remove spot 1' })).toBeVisible();
  await bothThemes(page, 'position-map-blue', 'phone');
});

test('cycle path: drawing a path, Clear path, Finish, and a blue scout removing one', async ({
  page,
}) => {
  test.slow();
  await openEntry(page, 2630, 'red');
  await page.getByRole('tab', { name: 'Teleop' }).click();
  const routes = page.getByRole('button', { name: /^Cycle routes: / });
  await routes.click();
  const map = page.getByRole('dialog', { name: 'Cycle routes' });
  // Path 1: from the red end up to the far source; path 2 a second route.
  for (const [x, y] of [
    [0.25, 0.85],
    [0.3, 0.6],
    [0.25, 0.3],
    [0.15, 0.08],
  ] as const)
    await tapMap(page, x, y);
  await map.getByRole('button', { name: 'Finish' }).click();
  await map.getByRole('button', { name: 'New path' }).click();
  for (const [x, y] of [
    [0.7, 0.85],
    [0.75, 0.55],
    [0.5, 0.25],
    [0.18, 0.1],
  ] as const)
    await tapMap(page, x, y);
  await map.getByRole('button', { name: 'Finish' }).click();
  // Path 3, being drawn: a stray point, cleared, and started again.
  await tapMap(page, 0.9, 0.5);
  await map.getByRole('button', { name: 'Clear path' }).click();
  await expect(map.getByText('0 of 6 points')).toBeVisible();
  for (const [x, y] of [
    [0.55, 0.85],
    [0.45, 0.4],
    [0.2, 0.12],
  ] as const)
    await tapMap(page, x, y);
  await expect(map.getByText('Drawing path 3')).toBeVisible();
  await expect(map.getByText('3 of 6 points')).toBeVisible();
  await bothThemes(page, 'cycle-map-drawing-red', 'phone');
  await map.getByRole('button', { name: 'Finish' }).click();
  await map.getByRole('button', { name: 'Done' }).click();
  await expect(routes).toHaveAccessibleName('Cycle routes: 3 paths');
  await bothThemes(page, 'map-buttons-cycle', 'phone');
});

test('cycle path: the computer dialog while drawing', async ({ page }) => {
  test.slow();
  await openEntry(page, 2630, 'red', 1440);
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await page.getByRole('button', { name: /^Cycle routes: / }).click();
  const map = page.getByRole('dialog', { name: 'Cycle routes' });
  for (const [x, y] of [
    [0.12, 0.3],
    [0.3, 0.4],
    [0.55, 0.3],
    [0.92, 0.08],
  ] as const)
    await tapMap(page, x, y);
  await map.getByRole('button', { name: 'Finish' }).click();
  // A tap on a finished path would select it: + New path starts the next one anywhere.
  await map.getByRole('button', { name: 'New path' }).click();
  for (const [x, y] of [
    [0.12, 0.7],
    [0.4, 0.62],
    [0.7, 0.4],
    [0.93, 0.1],
  ] as const)
    await tapMap(page, x, y);
  await map.getByRole('button', { name: 'Finish' }).click();
  await map.getByRole('button', { name: 'New path' }).click();
  for (const [x, y] of [
    [0.55, 0.28],
    [0.75, 0.15],
    [0.94, 0.07],
  ] as const)
    await tapMap(page, x, y);
  await expect(map.getByText('Drawing path 3')).toBeVisible();
  await expect(map.getByText('3 of 6 points')).toBeVisible();
  await bothThemes(page, 'cycle-map-drawing-red', 'desktop');
});

test('cycle path for a blue scout: tap a path to select it and ✕ Remove path', async ({ page }) => {
  test.slow();
  await openEntry(page, 4590, 'blue');
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await page.getByRole('button', { name: /^Cycle routes: / }).click();
  const map = page.getByRole('dialog', { name: 'Cycle routes' });
  await expect(map.getByTestId('map-drawing')).toHaveAttribute('data-rotation', '90');
  for (const route of [
    [
      [0.3, 0.85],
      [0.25, 0.5],
      [0.12, 0.1],
    ],
    [
      [0.7, 0.85],
      [0.6, 0.45],
      [0.2, 0.12],
    ],
  ]) {
    for (const [x, y] of route) await tapMap(page, x!, y!);
    await map.getByRole('button', { name: 'Finish' }).click();
  }
  // Path 1's line, between its first two points.
  await tapMap(page, 0.275, 0.675);
  await expect(map.getByRole('button', { name: 'Path 1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(map.getByRole('button', { name: 'Remove path 1' })).toBeVisible();
  await bothThemes(page, 'cycle-map-selected-blue', 'phone');
  await map.getByRole('button', { name: 'Remove path 1' }).click();
  await expect(map.getByTestId('map-status')).toHaveText('1 path');
});
