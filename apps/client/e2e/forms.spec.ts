import { expect, test, type Page } from '@playwright/test';
import { goOffline, signIn } from './api-mock';
import { MATCH_FORM_ID, SEASONS_WITH_2027 } from './formFixtures';
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
  await shoot(page, 'builder-locked', 'desktop');
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

test('builder: a phone gets the needs-a-computer panel', async ({ page }) => {
  await signIn(page, 'admin', { overrides: OVERRIDES });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BUILDER}?version=4`);
  await expect(page.getByRole('heading', { name: 'This needs a computer' })).toBeVisible();
  await expect(page.getByText(/Open the form builder on a screen/)).toBeVisible();
  await shoot(page, 'builder-gate', 'phone');
});
