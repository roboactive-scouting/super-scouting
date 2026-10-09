import { expect, test, type Page } from '@playwright/test';
import { goOffline, signIn } from './api-mock';
import { EXPORTS_NOW, MATCH_FORM_ID, SEASONS_WITH_2027 } from './formFixtures';
import { shoot } from './shoot';

/** The forms list and the form builder (task 1.29), against the design's 2026 match form. */
const OVERRIDES = { listSeasons: { items: SEASONS_WITH_2027, next_cursor: null } };
const BUILDER = `/admin/forms/${MATCH_FORM_ID}`;

async function openBuilder(page: Page, path = BUILDER) {
  await signIn(page, 'admin', { overrides: OVERRIDES });
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
  await expect(settings(page).getByText('in place · no new version')).toBeVisible();
  await settings(page).getByRole('heading', { name: 'Scoring' }).scrollIntoViewIfNeeded();
  await shoot(page, 'builder-locked', 'desktop');
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
