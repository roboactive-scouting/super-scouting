import { expect, test, type Page } from '@playwright/test';
import { signIn, type Role } from './api-mock';
import { shoot } from './shoot';

/**
 * The Scout page (02-scout/final). A fresh browser context has no station on the device, so
 * the page asks for one first. Q1-Q34 are fully scouted in the fixture; Q37 holds entries
 * (Red 1 2630, Red 2 1690, Blue 3 6738) and its Blue 2 is 5987; Q39 is the next match with
 * nothing scouted (Red 2630 · 3316 · 3339, Blue 4320 · 4590 · 5135); 1574 MisCar is on the
 * roster but not in Q39.
 */
async function useStation(page: Page, role: Role) {
  await signIn(page, role);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/scout');
  const sheet = page.getByRole('dialog', { name: 'Choose your station' });
  await sheet.getByRole('button', { name: 'Blue 2', exact: true }).click();
  await sheet.getByRole('button', { name: 'Use Blue 2' }).click();
  await expect(sheet).toBeHidden();
}

/** The picked tile's "BLUE 2" and its YOUR STATION tag never overlap (RB.19). */
async function expectTagBesideLabel(page: Page) {
  const tile = page.getByRole('radio', { name: /YOUR STATION/ });
  const label = await tile.getByText('BLUE 2', { exact: true }).boundingBox();
  const tag = await tile.getByText('YOUR STATION', { exact: true }).boundingBox();
  if (!label || !tag) throw new Error('tile label or tag not laid out');
  const apart =
    label.x + label.width <= tag.x + 0.5 ||
    tag.x + tag.width <= label.x + 0.5 ||
    label.y + label.height <= tag.y + 0.5 ||
    tag.y + tag.height <= label.y + 0.5;
  expect(apart, `label ${JSON.stringify(label)} overlaps tag ${JSON.stringify(tag)}`).toBe(true);
}

/** On a short page the action bar still sits on the bottom bar, with no gap (THEME). */
async function expectBarFlushOnNav(page: Page) {
  const bar = await page
    .getByRole('button', { name: /^Start entry/ })
    .locator('..')
    .boundingBox();
  const nav = await page.locator('nav[aria-label="Main"]').last().boundingBox();
  if (!bar || !nav) throw new Error('action bar or bottom bar not laid out');
  expect(Math.abs(bar.y + bar.height - nav.y)).toBeLessThanOrEqual(1);
}

test('scout: choose a station, the line-up, and a team not in it', async ({ page }) => {
  await signIn(page, 'lead');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/scout');

  const sheet = page.getByRole('dialog', { name: 'Choose your station' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Blue 2', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Use Blue 2' })).toBeEnabled();
  await shoot(page, 'scout-station', 'phone');

  await sheet.getByRole('button', { name: 'Use Blue 2' }).click();
  await expect(sheet).toBeHidden();
  await page.getByLabel('Match number').fill('39');
  await expect(page.getByRole('radio', { name: /YOUR STATION/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /YOUR STATION/ })).toContainText('4590');
  await expect(page.getByRole('button', { name: /^Start entry · 4590/ })).toBeEnabled();
  await shoot(page, 'scout');
  await expectTagBesideLabel(page);
  await expectBarFlushOnNav(page);
  // A larger OS text size: the tag wraps under the label rather than covering it.
  const bigText = await page.addStyleTag({ content: 'html{font-size:125%}' });
  await expectTagBesideLabel(page);
  await bigText.evaluate((el) => (el as Element).remove());

  // Another robot asks first.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('radio', { name: /RED 1/ }).click();
  const ask = page.getByRole('dialog', { name: 'Scout Red 1 instead?' });
  await expect(ask).toContainText('Your station stays Blue 2.');
  await ask.getByRole('button', { name: 'Keep Blue 2' }).click();
  await expect(ask).toBeHidden();

  await page.getByRole('button', { name: /Team not here\?/ }).click();
  await expect(page.getByRole('heading', { name: 'Which team are you watching?' })).toBeVisible();
  await page.getByRole('searchbox').fill('1574');
  await page.getByRole('radio', { name: /1574/ }).click();
  await expect(page.getByText('Not in line-up')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Start entry · 1574/ })).toBeEnabled();
  await shoot(page, 'scout-roster', 'phone');
  await expectBarFlushOnNav(page);
});

test('scout: robots already scouted on this device, and the saved banner', async ({ page }) => {
  await useStation(page, 'lead');
  await page.getByLabel('Match number').fill('37');
  // A lead may reopen any entry at any time: ticked, not locked.
  const done = page.getByRole('radio', { name: /2630/ });
  await expect(done).toContainText('Scouted');
  await expect(done).toBeEnabled();
  await expect(page.getByRole('radio', { name: /YOUR STATION/ })).toContainText('5987');

  // What EntryRoute hands back after a submit: router state on this same page.
  await page.evaluate(() => {
    const state = {
      usr: { saved: { matchLabel: 'Q36', teamLabel: '5135 Black Unicorns', edited: false } },
      key: 'e2e-saved',
      idx: (history.state?.idx ?? 0) + 1,
    };
    history.pushState(state, '', location.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
  });
  await expect(page.getByRole('status', { name: 'Entry saved' })).toContainText('Q36');
  await shoot(page, 'scout-done');
});

test('scout: a scouter sees another scout’s old entries locked', async ({ page }) => {
  await useStation(page, 'scouter');
  await page.getByLabel('Match number').fill('37');
  const locked = page.getByRole('radio', { name: /2630/ });
  await expect(locked).toContainText('Scouted · locked');
  await expect(locked).toBeDisabled();
  await shoot(page, 'scout-locked');
});
