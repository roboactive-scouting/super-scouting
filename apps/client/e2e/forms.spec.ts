import { expect, test, type Page } from '@playwright/test';
import { goOffline, signIn } from './api-mock';
import { EXPORTS_NOW, FORMS_RPC, MATCH_FORM_ID, SEASONS_WITH_2027 } from './formFixtures';
import { shoot } from './shoot';

/** The forms list and the form builder (task 1.29), against the design's 2026 match form. */
const OVERRIDES = { listSeasons: { items: SEASONS_WITH_2027, next_cursor: null } };
const BUILDER = `/admin/forms/${MATCH_FORM_ID}`;

async function openBuilder(page: Page, path = BUILDER, overrides: Record<string, unknown> = {}) {
  await signIn(page, 'admin', { overrides: { ...OVERRIDES, ...overrides } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(path);
  await expect(page.getByRole('region', { name: 'Form' })).toBeVisible();
}

const canvas = (page: Page) => page.getByRole('region', { name: 'Form' });
const settings = (page: Page) => page.getByRole('region', { name: 'Field settings' });

test('forms: the season with its match form and versions; a phone gets the gate', async ({
  page,
}) => {
  await signIn(page, 'admin', { overrides: OVERRIDES });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/forms');
  await expect(page.getByRole('heading', { level: 1, name: 'Forms' })).toBeVisible();
  await expect(page.getByRole('button', { name: '2026 active' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '2027 no forms yet' })).toBeVisible();
  const card = page.getByRole('region', { name: 'Match form' });
  await expect(card.getByText('v3 · Published · Locked')).toBeVisible();
  await expect(card.getByText('08/10 · Noa Levi')).toBeVisible();
  await expect(card.getByRole('link', { name: 'Continue Draft v4' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Restore v2' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create super form' })).toBeVisible();
  // Task 1.31: Export beside Open builder, Delete form behind the head's ⋯, Import on a missing card.
  await expect(card.getByRole('button', { name: 'Export' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Form actions: Match form' })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Super form (not created)' })
      .getByRole('button', { name: 'Import' }),
  ).toBeVisible();
  await shoot(page, 'forms', 'desktop');

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('heading', { name: 'This needs a computer' })).toBeVisible();
  await shoot(page, 'forms-gate', 'phone');
});

test('forms: at 1024 px the card heads wrap whole: the name and its meaning never break word by word', async ({
  page,
}) => {
  await signIn(page, 'admin', { overrides: OVERRIDES });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/admin/forms');
  const card = page.getByRole('region', { name: 'Match form' });
  await expect(card.getByText('v3 · Published · Locked')).toBeVisible();
  for (const region of [card, page.getByRole('region', { name: 'Super form (not created)' })]) {
    const name = region.getByRole('heading', { level: 2 });
    const meaning = name.locator('xpath=following-sibling::p[1]');
    // The name on one line; the meaning on at most two, in a box wide enough for whole
    // phrases (before the fix each was squeezed to one or two words a line).
    expect((await name.boundingBox())!.height).toBeLessThan(32);
    expect((await meaning.boundingBox())!.height).toBeLessThan(40);
  }
  // The version timeline's lines too: v2's stays one line, its count and buttons beside or under.
  expect((await card.getByText('Published 20/09 · 14 fields').boundingBox())!.height).toBeLessThan(
    24,
  );
  await shoot(page, 'forms', 'laptop');
});

test('forms: a new season with no forms warns and offers Create', async ({ page }) => {
  await signIn(page, 'admin', { overrides: OVERRIDES });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/forms');
  await page.getByRole('button', { name: '2027 no forms yet' }).click();
  await expect(page.getByText('No match form is published for 2027.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create match form' })).toBeVisible();
  await expect(page.getByText('export it from 2026, then pick it under Import.')).toBeVisible();
  await shoot(page, 'forms-new-season', 'desktop');
});

test('builder: the draft by default, an event log field selected', async ({ page }) => {
  await openBuilder(page);
  await expect(page.getByRole('button', { name: /Draft v4 · not published/ })).toBeVisible();
  await expect(page.getByText('made from v3 · 2 fields added')).toBeVisible();
  await expect(page.getByText('Saved 11:48')).toBeVisible();
  await canvas(page)
    .getByRole('tab', { name: /Teleop/ })
    .click();
  await canvas(page).getByRole('button', { name: 'Shots, Event log' }).click();
  await expect(settings(page).getByRole('heading', { name: 'Shots' })).toBeVisible();
  await expect(canvas(page).getByText('4/ea pts')).toBeVisible();
  // The settings pane (task 1.30): Field and Meaning folded, the buttons, "where?", no scoring.
  await expect(
    settings(page).getByText('Teleop · not required · help:', { exact: false }),
  ).toBeVisible();
  await expect(settings(page).getByLabel('Button 1 label')).toHaveValue('High goal');
  await expect(
    settings(page).getByRole('switch', { name: /Ask where on the field/ }),
  ).toBeChecked();
  await expect(settings(page).getByText(/Event logs are not scored/)).toBeVisible();
  // UF.14: the way back, and Undo / Redo held with nothing to undo yet.
  await expect(page.getByRole('link', { name: 'Back to Forms' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
  await shoot(page, 'builder', 'desktop');
});

test('builder: a field dragged onto a phase tab joins it, missing its meaning, so Publish is held', async ({
  page,
}) => {
  await openBuilder(page);
  // Drag the Counter row from the palette onto the Teleop tab (Auto is on screen).
  const counter = page.getByRole('button', { name: /^Add Counter:/ });
  const teleop = canvas(page).getByRole('tab', { name: /Teleop/ });
  const from = (await counter.boundingBox())!;
  const to = (await teleop.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(canvas(page).getByText('Phase 2 of 4')).toBeVisible();
  await expect(canvas(page).getByText('tele_counter')).toBeVisible();

  const label = settings(page).getByLabel('Label');
  await label.fill('Pieces dropped');
  await expect(settings(page).getByText('tele_pieces_dropped')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish v4' })).toBeDisabled();
  await expect(
    page.getByText('“Pieces dropped” needs its meaning before v4 can be published'),
  ).toBeVisible();
  await expect(canvas(page).getByText('Needs meaning')).toBeVisible();
  await expect(page.getByText('● Unsaved changes')).toBeVisible();
  // Its meaning is missing: required controls say so, and the scoring sits under Teleop.
  await expect(settings(page).getByText('3 missing')).toBeVisible();
  await expect(settings(page).getByText('Needed to publish')).toHaveCount(3);
  await expect(settings(page).getByLabel('Points per unit')).toHaveValue('0');
  await shoot(page, 'builder-new-field', 'desktop');

  // UF.19: the blank Unit beside Category: both boxes on one line, each label on one line, and
  // "Needed to publish" under the Unit box.
  const unit = settings(page).getByLabel('Unit', { exact: true });
  const category = settings(page).getByLabel('Category');
  await unit.scrollIntoViewIfNeeded();
  const [u, c] = [(await unit.boundingBox())!, (await category.boundingBox())!];
  expect(Math.abs(u.y - c.y)).toBeLessThan(1);
  expect(Math.abs(u.height - c.height)).toBeLessThan(1);
  for (const line of await settings(page).locator('[data-pane-label]').all()) {
    if (await line.isVisible()) expect((await line.boundingBox())!.height).toBeLessThanOrEqual(19);
  }
  const needId = (await unit.getAttribute('aria-describedby'))!;
  const unitNeed = page.locator(`[id="${needId}"]`);
  await expect(unitNeed).toHaveText('Needed to publish');
  const need = (await unitNeed.boundingBox())!;
  expect(need.y).toBeGreaterThan(u.y + u.height - 1);
  await shoot(page, 'builder-new-field-meaning', 'desktop');

  // UF.14: the label and then the field itself go back, one step each.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(settings(page).getByText('tele_counter')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(canvas(page).getByText('tele_counter')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();
});

test('builder: the locked active version names its entries', async ({ page }) => {
  await openBuilder(page, `${BUILDER}?version=3`);
  await expect(page.getByText('v3 is locked: 214 entries were scouted with it.')).toBeVisible();
  // Draft v4 exists, so new fields go there: the palette is held.
  await expect(page.getByText('New fields go in draft v4')).toBeVisible();
  await canvas(page)
    .getByRole('tab', { name: /Endgame/ })
    .click();
  await canvas(page).getByRole('button', { name: 'Climb level, Single select' }).click();
  await expect(canvas(page).getByText('0–12 pts')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
  // The ordinal select: its options worst → best, and points per option in place.
  await expect(settings(page).getByRole('switch', { name: /Ordered/ })).toBeChecked();
  await expect(settings(page).getByText('Adding an option belongs in draft v4')).toBeVisible();
  await expect(settings(page).getByLabel('Points for High bar')).toHaveValue('12');
  // Each option row leads with its 6-dot grip (final review, U1); no ↑ ↓.
  await expect(
    settings(page).getByRole('button', { name: 'Move High bar', exact: true }),
  ).toBeVisible();
  await expect(settings(page).getByRole('button', { name: /^Move .* up$/ })).toHaveCount(0);
  await expect(settings(page).getByText('in place · no new version')).toBeVisible();
  await settings(page).getByRole('heading', { name: 'Scoring' }).scrollIntoViewIfNeeded();
  // UF.18: the canvas draws the four options as the phone does: two columns, each label on one
  // line ("High bar" no longer wraps).
  const climb = canvas(page).locator('[data-field-key="end_climb"]');
  const cards = await climb.locator('label').all();
  expect(cards).toHaveLength(4);
  const boxes = await Promise.all(cards.map(async (c) => (await c.boundingBox())!));
  expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(1);
  expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height);
  for (const card of cards) {
    const text = (await card.locator('span').last().boundingBox())!;
    expect(text.height).toBeLessThan(26);
  }
  await shoot(page, 'builder-locked', 'desktop');
});

test('builder: Try it draws a four-option select as the phone does; a click shows no focus ring', async ({
  page,
}) => {
  await openBuilder(page);
  await canvas(page).getByRole('button', { name: 'Try it' }).click();
  await canvas(page)
    .getByRole('tab', { name: /Endgame/ })
    .click();
  const high = canvas(page).getByText('High bar', { exact: true });
  await high.click();
  const card = canvas(page).locator('label', {
    has: page.getByRole('radio', { name: 'High bar' }),
  });
  await expect(page.getByRole('radio', { name: 'High bar' })).toBeChecked();
  // The ✓ sits inside the card, clear of its edge.
  const tile = (await card.boundingBox())!;
  const mark = (await card.locator('[data-chosen-mark]').boundingBox())!;
  expect(tile.x + tile.width - (mark.x + mark.width)).toBeGreaterThanOrEqual(12);
  expect((await high.boundingBox())!.height).toBeLessThan(26);
  // A mouse click: only the chosen border, no focus ring around it.
  await expect(card).toHaveCSS('outline-style', 'none');
  const pane = page.getByRole('region', { name: 'What this entry would save' });
  await expect(pane.getByRole('button', { name: 'Clear test values' })).toBeVisible();
  await expect(pane.getByText('one row per field and phase')).toBeVisible();
  await shoot(page, 'builder-try-select', 'desktop');
  // The keyboard brings the ring back.
  await page.keyboard.press('ArrowLeft');
  const low = canvas(page).locator('label', { has: page.getByRole('radio', { name: 'Low bar' }) });
  await expect(page.getByRole('radio', { name: 'Low bar' })).toBeChecked();
  await expect(low).toHaveCSS('outline-style', 'solid');
});

test('builder: a field dragged by its grip shows the move before the drop', async ({ page }) => {
  await openBuilder(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await canvas(page)
    .getByRole('tab', { name: /Teleop/ })
    .click();
  const keys = () =>
    canvas(page)
      .locator('[data-field-key]')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.fieldKey));
  expect((await keys()).slice(0, 3)).toEqual(['tele_high', 'tele_low', 'tele_shots']);
  const grip = canvas(page).getByRole('button', { name: 'Move Pieces scored high' });
  const from = (await grip.boundingBox())!;
  const x = from.x + from.width / 2;
  const y = from.y + from.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(x, y + i * 12);
  // Mid-drag: the lifted field follows the pointer, the two it passed have slid up.
  const lifted = canvas(page).locator('[data-field-key="tele_high"]');
  await expect(lifted).toHaveAttribute('data-dragging', 'true');
  for (const key of ['tele_low', 'tele_shots']) {
    await expect(canvas(page).locator(`[data-field-key="${key}"]`)).toHaveCSS(
      'transform',
      /matrix\(1, 0, 0, 1, 0, -1\d\d/,
    );
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'e2e/__screens__/builder-drag-desktop.png' });
  await page.mouse.up();
  await expect
    .poll(keys)
    .toEqual([
      'tele_low',
      'tele_shots',
      'tele_high',
      'tele_cycle_routes',
      'tele_defence',
      'tele_fouls',
    ]);
});

test('builder: a field position shows its blue-mirror preview over the game image', async ({
  page,
}) => {
  await openBuilder(page);
  await canvas(page).getByRole('button', { name: 'Scoring spots, Field position' }).click();
  await expect(settings(page).getByRole('radio', { name: 'A list of points' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(settings(page).getByRole('radio', { name: 'Left ↔ right' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(settings(page).getByRole('img', { name: 'Mirroring preview' })).toBeVisible();
  await expect(settings(page).getByText('blue is mirrored')).toBeVisible();
  await expect(settings(page).getByText(/Field positions are not scored/)).toBeVisible();
  await shoot(page, 'builder-position', 'desktop');
});

test('builder: a cycle path caps its points per cycle and previews the mirrored route', async ({
  page,
}) => {
  await openBuilder(page);
  await canvas(page)
    .getByRole('tab', { name: /Teleop/ })
    .click();
  await canvas(page).getByRole('button', { name: 'Cycle routes, Cycle path' }).click();
  await expect(settings(page).getByLabel('Points per cycle, at most')).toHaveValue('6');
  await expect(settings(page).getByRole('img', { name: 'Mirroring preview' })).toBeVisible();
  await expect(settings(page).getByText(/Cycle paths are not scored/)).toBeVisible();
  await shoot(page, 'builder-cycle', 'desktop');
});

test('builder: offline pauses editing and keeps unsaved changes', async ({ page }) => {
  await openBuilder(page);
  await canvas(page)
    .getByRole('tab', { name: /Teleop/ })
    .click();
  await page.getByRole('button', { name: /^Add Toggle:/ }).click();
  await goOffline(page);
  await expect(page.getByText("You're offline.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Publish v4' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Match timer' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'More', exact: true })).toBeDisabled();
  await expect(page.getByText('● Unsaved changes')).toBeVisible();
  await shoot(page, 'builder-offline', 'desktop');
});

test('builder: Try it fills the form as a scouter would and shows what it would save', async ({
  page,
}) => {
  await openBuilder(page);
  await canvas(page).getByRole('button', { name: 'Try it' }).click();
  await canvas(page).getByText('Left the start zone').click();
  const plus = canvas(page).getByRole('button', { name: 'Pieces scored high plus one' });
  for (let i = 0; i < 3; i++) await plus.click();
  const pane = page.getByRole('region', { name: 'What this entry would save' });
  await expect(pane.getByText('Nothing is saved or sent.')).toBeVisible();
  await expect(pane.getByTestId('try-saved-data')).toContainText('"auto_high": 3');
  await expect(canvas(page).getByText('auto_high')).toHaveCount(0);
  await shoot(page, 'builder-try', 'desktop');
});

test('builder: More holds Edit as JSON, Export, Import and Delete form', async ({ page }) => {
  await openBuilder(page);
  await canvas(page)
    .getByRole('tab', { name: /Teleop/ })
    .click();
  await canvas(page).getByRole('button', { name: 'Cycle routes, Cycle path' }).click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'More' });
  await expect(menu.getByRole('menuitem')).toHaveCount(4);
  await expect(menu.getByText('Advanced: the whole form as text.', { exact: false })).toBeVisible();
  await shoot(page, 'builder-more', 'desktop');
});

/** The form as the server sends it, with another match timer (task 1.32). */
const withTimer = (phases: { phase: string; seconds: number }[]) => ({
  getForm: () => ({ ...(FORMS_RPC.getForm!({}) as object), timer_config: { phases } }),
});

/** The builder behind the timer dialog as in the design: Teleop, with Shots selected. */
async function shotsSelected(page: Page) {
  await canvas(page)
    .getByRole('tab', { name: /Teleop/ })
    .click();
  await canvas(page).getByRole('button', { name: 'Shots, Event log' }).click();
}

test('builder: Match timer lists the phases with the bar, the match end and the in-place note', async ({
  page,
}) => {
  await openBuilder(page, BUILDER, {
    ...withTimer([
      { phase: 'auto', seconds: 15 },
      { phase: 'teleop', seconds: 120 },
      { phase: 'endgame', seconds: 30 },
    ]),
    updateForm: (input: Record<string, unknown>) => ({
      ...(FORMS_RPC.getForm!({}) as object),
      timer_config: input.timer_config,
    }),
  });
  await shotsSelected(page);
  await page.getByRole('button', { name: 'Match timer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Match timer' });
  const teleop = dialog.getByRole('textbox', { name: 'Teleop length in seconds' });
  await teleop.fill('135');
  await expect(dialog.getByText(/Match ends at/)).toHaveText('Match ends at 180 s (3:00)');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeEnabled();
  await shoot(page, 'builder-timer', 'desktop');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
});

test('builder: a form with no match timer offers the standard three', async ({ page }) => {
  await openBuilder(page, BUILDER, withTimer([]));
  await shotsSelected(page);
  await page.getByRole('button', { name: 'Match timer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Match timer' });
  await expect(dialog.getByText('This form has no match timer.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await shoot(page, 'builder-timer-empty', 'desktop');
});

test('builder: Edit as JSON names the line and column of a missing comma', async ({ page }) => {
  await openBuilder(page);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: /Edit as JSON/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit as JSON' });
  const editor = dialog.getByRole('textbox', { name: 'The form as JSON' });
  const lines = (await editor.inputValue()).split('\n');
  // The comma after Shots' first button ("High goal"), as in the design.
  const high = lines.findIndex((l) => l.includes('"label": "High goal"'));
  const close = lines.findIndex((l, i) => i > high && l.trim() === '},');
  lines[close] = lines[close]!.replace('},', '}');
  await editor.fill(lines.join('\n'));
  await expect(dialog.getByRole('alert')).toContainText(
    `Line ${close + 2}, column 11: a comma is missing at the end of line ${close + 1}.`,
  );
  await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await editor.evaluate((el, line) => {
    el.scrollTop = Math.max(0, (line - 9) * 20);
    el.dispatchEvent(new Event('scroll'));
  }, close + 2);
  await shoot(page, 'builder-json', 'desktop');
});

test('builder: Export picks the version and saves into Exports for 24 hours', async ({ page }) => {
  await openBuilder(page);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Export/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Export the match form' });
  await expect(dialog.getByRole('radio', { name: /Draft v4/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(dialog.getByText('Match form 2026 · draft v4')).toBeVisible();
  await shoot(page, 'builder-export', 'desktop');
  await dialog.getByRole('button', { name: 'Save export' }).click();
  await expect(dialog.getByRole('button', { name: 'Also download a copy' })).toBeVisible();
});

test('builder: Import into this form shows what it adds, changes and removes', async ({ page }) => {
  await page.clock.setFixedTime(EXPORTS_NOW);
  await openBuilder(page);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Import/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a form' });
  await expect(dialog.getByText('Choose another export')).toBeVisible();
  await expect(dialog.getByText('15 fields unchanged')).toBeVisible();
  await expect(dialog.getByText('tele_traps')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Import as draft v4' })).toBeEnabled();
  await shoot(page, 'builder-import', 'desktop');
});

test('builder: Delete form waits for the typed phrase', async ({ page }) => {
  await openBuilder(page);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: /Delete form/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete the match form?' });
  await expect(dialog.getByText('264 entries from the 2026 events')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  const confirm = dialog.getByRole('button', { name: 'Delete Match form 2026' });
  await expect(confirm).toHaveAttribute('aria-disabled', 'true');
  await dialog.getByLabel(/to confirm/).fill('delete match form');
  await expect(confirm).not.toHaveAttribute('aria-disabled', 'true');
  await shoot(page, 'builder-delete', 'desktop');
});

test('forms: Import into the new season shows the saved exports and what the file creates', async ({
  page,
}) => {
  await page.clock.setFixedTime(EXPORTS_NOW);
  await signIn(page, 'admin', { overrides: OVERRIDES });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/forms');
  await page.getByRole('button', { name: '2027 no forms yet' }).click();
  await page
    .getByRole('region', { name: 'Match form (not created)' })
    .getByRole('button', { name: 'Import' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Import the 2027 match form' });
  await expect(dialog.getByRole('radio')).toHaveCount(3);
  await expect(dialog.getByRole('radio', { name: /Match form 2026 · draft v4/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(dialog.getByText('deleted in 22 h')).toBeVisible();
  await expect(dialog.getByText('3:00')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Import as draft v1' })).toBeEnabled();
  await shoot(page, 'forms-import-new-season', 'desktop');
});

test('builder: a phone gets the needs-a-computer panel', async ({ page }) => {
  await signIn(page, 'admin', { overrides: OVERRIDES });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BUILDER}?version=4`);
  await expect(page.getByRole('heading', { name: 'This needs a computer' })).toBeVisible();
  await expect(page.getByText(/Open the form builder on a screen/)).toBeVisible();
  await shoot(page, 'builder-gate', 'phone');
});
