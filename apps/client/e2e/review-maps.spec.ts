import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { FIXTURE, FORM, matchId, teamId } from './fixtures';
import { shoot } from './shoot';

/**
 * UF.24: map fields on Review entry (14-entry-parts/round-3 `review-maps-phone.png`, frame 3 for
 * the view-only map; frames 1–2 drew mini maps the user turned down, so each map field is a
 * compact row with Tap to view). The pull is the shared fixture's with the match form swapped
 * for the round-3 design's fields; the entry's values come from a draft on the device, as the
 * mockup's: Q39 · 2630 Thunderbolts at Red 1, a start position, two auto paths (9 points) and
 * five teleop events, one of them (Defended, 1:05) without a place.
 */

const T0 = '2026-01-10T08:00:00.000Z';
const id = (n: number) => `0000000a-0000-4000-8000-${String(990 + n).padStart(12, '0')}`;

type Seed = {
  key: string;
  label: string;
  type: string;
  phase: 'auto' | 'teleop' | 'endgame' | 'post_match';
  unit?: string;
  config?: Record<string, unknown>;
};

const MIRROR = { mirror_axis: 'horizontal' };

const SIZES = {
  phone: { width: 375, height: 812 },
  desktop: { width: 1440, height: 900 },
} as const;

const SEEDS: Seed[] = [
  {
    key: 'auto_start',
    label: 'Starting position',
    type: 'position',
    phase: 'auto',
    unit: 'coordinate',
    config: { multi_point: false, ...MIRROR },
  },
  {
    key: 'auto_path',
    label: 'Auto path',
    type: 'cycle_path',
    phase: 'auto',
    unit: 'coordinate',
    config: { max_points_per_cycle: 10, ...MIRROR },
  },
  {
    key: 'auto_high',
    label: 'Pieces scored high',
    type: 'counter',
    phase: 'auto',
    config: { min: 0, step: 1 },
  },
  {
    key: 'tele_events',
    label: 'Teleop events',
    type: 'event_log',
    phase: 'teleop',
    config: {
      ask_position: true,
      ...MIRROR,
      event_types: [
        { value: 'high', label: 'Scored high' },
        { value: 'low', label: 'Scored low' },
        { value: 'miss', label: 'Missed' },
        { value: 'def', label: 'Defended' },
      ],
    },
  },
  {
    key: 'tele_high',
    label: 'Pieces scored high',
    type: 'counter',
    phase: 'teleop',
    config: { min: 0, step: 1 },
  },
  {
    key: 'tele_shots',
    label: 'Shooting position',
    type: 'position',
    phase: 'teleop',
    unit: 'coordinate',
    config: { multi_point: true, ...MIRROR },
  },
  {
    key: 'end_climb',
    label: 'Climb level',
    type: 'single_select',
    phase: 'endgame',
    unit: 'enum',
    config: {
      options: [
        { value: 'none', label: 'None' },
        { value: 'low', label: 'Low rung' },
        { value: 'high', label: 'High rung' },
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
  help_text: null,
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
  entities: {
    ...FIXTURE.pull.entities,
    forms: FIXTURE.pull.entities.forms.map((f) => ({ ...f, timer_config: { phases: [] } })),
    form_fields: FIELDS,
    scoring_rules: [],
  },
};

/** The mockup's marks, on the season image (x from the red end, y down): a red scout's own. */
const DATA = {
  auto_start: { x: 0.27, y: 0.3 },
  auto_path: [
    [
      { x: 0.27, y: 0.3 },
      { x: 0.3, y: 0.4 },
      { x: 0.45, y: 0.33 },
      { x: 0.41, y: 0.45 },
      { x: 0.37, y: 0.46 },
    ],
    [
      { x: 0.37, y: 0.53 },
      { x: 0.46, y: 0.68 },
      { x: 0.41, y: 0.6 },
      { x: 0.37, y: 0.54 },
    ],
  ],
  auto_high: 2,
  tele_events: [
    { type: 'high', t: 12, x: 0.26, y: 0.4 },
    { type: 'high', t: 31, x: 0.24, y: 0.62 },
    { type: 'miss', t: 40, x: 0.4, y: 0.7 },
    { type: 'def', t: 65 },
    { type: 'low', t: 82, x: 0.3, y: 0.56 },
  ],
  tele_high: 6,
  end_climb: 'high',
};

/** Signs in, leaves the design's entry as a draft on the device, and opens its confirmation. */
async function openConfirmation(page: Page) {
  await signIn(page, 'scouter', { overrides: { 'sync/pull': PULL } });
  await page.setViewportSize({ width: 375, height: 812 });
  // A page of the app first, so its database exists before the draft is written into it.
  await page.goto('/scout');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await page.evaluate(
    (record) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('robactive-scouting');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('drafts', 'readwrite');
          tx.objectStore('drafts').put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    {
      key: `${FORM.version_id}:${matchId(39)}:${teamId(2630)}`,
      row_id: '',
      payload: { robot_status: 'played', data: DATA, alliance: 'red' },
      updated_at: new Date().toISOString(),
    },
  );
  await page.goto(`/entry/${matchId(39)}/${teamId(2630)}?alliance=red`);
  await expect(page.getByRole('button', { name: 'Starting position: 1 spot' })).toBeVisible();
  await page.getByRole('button', { name: 'Review entry' }).click();
  return page.getByRole('dialog', { name: 'Confirm this entry' });
}

test('review entry: map fields are compact rows that open the map view only', async ({ page }) => {
  test.slow();
  const confirm = await openConfirmation(page);
  const start = confirm.getByRole('button', { name: 'Starting position: 1 spot' });
  const path = confirm.getByRole('button', { name: 'Auto path: 2 paths · 9 spots' });
  const events = confirm.getByRole('button', {
    name: 'Teleop events: 5 events · 4 on the map',
  });
  await expect(path).toBeVisible();
  await expect(events).toBeVisible();
  // An empty map field: a plain row with "—", no button.
  await expect(confirm.getByRole('button', { name: /^Shooting position/ })).toHaveCount(0);
  for (const row of [start, path, events]) {
    const box = (await row.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(48);
  }
  // The confirmation remounts when the layout changes (the entry page draws phone and computer
  // apart), so each width opens its own map.
  for (const width of ['phone', 'desktop'] as const) {
    await page.setViewportSize(SIZES[width]);
    const verb = width === 'phone' ? 'Tap' : 'Click';
    await expect(start).toContainText(`${verb} to view`);
    await shoot(page, 'review-map-rows', width);

    // The event log, view only: numbered spots, the chips with their times, "no place", Close.
    await events.click();
    const map = page.getByRole('dialog', { name: 'Teleop events' });
    await expect(map.getByText('View only')).toBeVisible();
    await expect(map.getByText('Q39 · 2630 · Teleop')).toBeVisible();
    // Phone: upright, the own (red) end at the bottom; computer: flat, the own end on the left.
    await expect(map.getByTestId('map-drawing')).toHaveAttribute(
      'data-rotation',
      width === 'phone' ? '270' : '0',
    );
    await expect(map.getByRole('listitem')).toHaveText([
      '1Scored high0:12',
      '2Scored high0:31',
      '3Missed0:40',
      '–Defended1:05no place',
      '5Scored low1:22',
    ]);
    await expect(map.getByRole('button', { name: /Undo|Skip|Save tap|Done|Remove/ })).toHaveCount(
      0,
    );
    // A tap on the field adds nothing.
    const box = (await map.getByTestId('map-drawing').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(map.locator('[data-mark="own"]')).toHaveCount(4);
    await shoot(page, 'review-map-events', width);

    // Close: back on the confirmation, at the row, every value kept.
    await map.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(map).toBeHidden();
    await expect(confirm).toBeVisible();
    await expect(events).toBeFocused();
    await expect(path).toBeVisible();

    // A path, view only; Escape closes it.
    await path.click();
    const routes = page.getByRole('dialog', { name: 'Auto path' });
    await expect(routes.getByText('View only')).toBeVisible();
    await expect(routes.locator('[data-path="done"]')).toHaveCount(2);
    await expect(routes.locator('[data-path-mark="start"]')).toHaveCount(2);
    await expect(routes.locator('[data-path-mark="end"]')).toHaveCount(2);
    await expect(routes.getByTestId('map-status')).toHaveText('2 paths · 9 spots');
    await expect(routes.getByRole('button', { name: /New path|Undo|Finish|Done/ })).toHaveCount(0);
    await shoot(page, 'review-map-path', width);
    await page.keyboard.press('Escape');
    await expect(routes).toBeHidden();
    await expect(confirm).toBeVisible();
    await expect(path).toBeFocused();
  }
});
