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

/** Above the pinned Start entry bar, never under it (UF.6). */
async function expectClearOfBar(page: Page, what: ReturnType<Page['getByRole']>) {
  const bar = await page
    .getByRole('button', { name: /^Start entry/ })
    .locator('..')
    .boundingBox();
  const box = await what.boundingBox();
  if (!bar || !box) throw new Error('action bar or target not laid out');
  expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
}

/**
 * The picked tile is filled with its alliance's strong colour, never the accent tint
 * (THEME "Station tile", amended 2026-10-08). The tokens' light values, as the browser computes them.
 */
const RED_STRONG = 'rgb(154, 47, 41)';
const BLUE_STRONG = 'rgb(37, 81, 170)';
const ACCENT_TINT = 'rgb(229, 242, 236)';
async function expectPickedFill(tile: ReturnType<Page['getByRole']>, fill: string) {
  await expect(tile).toHaveCSS('background-color', fill);
  await expect(tile).not.toHaveCSS('background-color', ACCENT_TINT);
  await expect(tile).toHaveCSS('color', 'rgb(255, 255, 255)');
}

const scrollToEnd = (page: Page) =>
  page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

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
  await expectPickedFill(page.getByRole('radio', { name: /BLUE 2/ }), BLUE_STRONG);
  await expect(page.getByText('YOUR STATION', { exact: true })).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(page.getByText('YOUR STATION', { exact: true })).toHaveCSS('color', BLUE_STRONG);
  await shoot(page, 'scout');
  await expectTagBesideLabel(page);
  await expectBarFlushOnNav(page);
  await scrollToEnd(page);
  await expectClearOfBar(page, page.getByRole('button', { name: /Team not here\?/ }));
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
  await expectPickedFill(page.getByRole('radio', { name: /BLUE 2/ }), BLUE_STRONG);

  // Scouting Red 1 instead fills Red 1 in the red strong colour; Blue 2 returns to its tint.
  await page.getByRole('radio', { name: /RED 1/ }).click();
  await ask.getByRole('button', { name: 'Scout Red 1' }).click();
  await expect(ask).toBeHidden();
  const red = page.getByRole('radio', { name: /RED 1/ });
  await expect(red).toBeChecked();
  await expectPickedFill(red, RED_STRONG);
  await expect(page.getByRole('radio', { name: /BLUE 2/ })).not.toHaveCSS(
    'background-color',
    BLUE_STRONG,
  );
  await shoot(page, 'scout-red');

  await page.getByRole('button', { name: /Team not here\?/ }).click();
  await expect(page.getByRole('heading', { name: 'Which team are you watching?' })).toBeVisible();
  await page.getByRole('searchbox').fill('1574');
  await page.getByRole('radio', { name: /1574/ }).click();
  await expect(page.getByText('Not in line-up')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Start entry · 1574/ })).toBeEnabled();
  await shoot(page, 'scout-roster');
  await expectBarFlushOnNav(page);
  // The whole roster is longer than the screen: scrolled to the end, the flag note clears the bar.
  await page.getByRole('searchbox').fill('');
  await scrollToEnd(page);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expectClearOfBar(page, page.getByText(/isn't in Q39's line-up/));
  await shoot(page, 'scout-roster-end', 'phone');

  // Desktop: with the whole roster listed, Start entry stays pinned at the window's foot.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(900);
  const start = await page.getByRole('button', { name: /^Start entry · 1574/ }).boundingBox();
  if (!start) throw new Error('Start entry not laid out');
  expect(start.y + start.height).toBeLessThanOrEqual(900);
  expect(start.y + start.height).toBeGreaterThan(800);
  await shoot(page, 'scout-roster-long', 'desktop');
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
      usr: {
        saved: {
          matchType: 'qualification',
          number: 36,
          matchLabel: 'Q36',
          teamLabel: '5135 Black Unicorns',
          edited: false,
        },
      },
      key: 'e2e-saved',
      idx: (history.state?.idx ?? 0) + 1,
    };
    history.pushState(state, '', location.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
  });
  await expect(page.getByRole('status', { name: 'Entry saved' })).toContainText('Q36');
  await shoot(page, 'scout-done');
  // With the banner the page outgrows a phone: reached by keyboard, the button clears the bar.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const notHere = page.getByRole('button', { name: /Team not here\?/ });
  await notHere.focus();
  await expectClearOfBar(page, notHere);
});

test('scout: a scouter sees another scout’s old entries locked', async ({ page }) => {
  await useStation(page, 'scouter');
  await page.getByLabel('Match number').fill('37');
  const locked = page.getByRole('radio', { name: /2630/ });
  await expect(locked).toContainText('Scouted · locked');
  await expect(locked).toBeDisabled();
  await shoot(page, 'scout-locked');
});
