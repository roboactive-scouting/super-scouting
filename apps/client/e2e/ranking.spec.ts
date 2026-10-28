import { expect, test, type Page } from '@playwright/test';
import { goOffline, signIn } from './api-mock';
import { PULL, rankTeamsAnswer } from './rankingFixture';
import { shoot } from './shoot';

/*
 * The ranking (task 1.58; docs/design/pages/27-ranking/final, variant N): District #3 with its
 * 22-team roster plus 14 more (36 teams, three of them with no entries yet), scouted with
 * breakdowns, disabled robots and no-shows. Online, `rankTeams` answers with the shared builder
 * over the very rows the device holds (what the server does); offline the device computes the same
 * table itself. Computer: Scoring with BumbleB in the study panel; Availability with the Sort
 * builder holding Availability then Breakdowns. Phone: Scoring by default; offline, Availability
 * then Breakdowns; BumbleB's summary sheet.
 */

/** Signs in at 11:43 (Tel Aviv, 17 March 2026) with the ranking pull, and opens /ranking. */
async function openRanking(page: Page) {
  await page.clock.setFixedTime(new Date('2026-03-17T11:43:00+02:00'));
  await signIn(page, 'lead', {
    overrides: { 'sync/pull': PULL, rankTeams: rankTeamsAnswer },
  });
  await page.waitForLoadState('networkidle');
  await page.goto('/ranking');
}

test('ranking: Scoring with a team in the study panel, Availability with the Sort builder', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRanking(page);
  const main = page.getByRole('main');
  await expect(main.getByText(/From the server · as of/)).toBeVisible();
  const table = main.getByRole('table');
  // Every roster team, no pagination; the medals on the first three only.
  await expect(table.locator('tbody tr')).toHaveCount(36);
  await expect(table.getByRole('img', { name: /^Medal/ })).toHaveCount(3);
  // The no-data teams sort last, "—" in every figure.
  await expect(table.locator('tbody tr').last()).toContainText('No counted matches yet');
  // Value shading (task 1.59): Total, the figure in the sort, is a shaded chip on every team with
  // data; the phases and the rest print plain; a no-data cell is a bare dash.
  const shaded = table.locator('tbody [data-figure] [data-shade]');
  await expect(shaded).toHaveCount(33);
  await expect(shaded.first()).toHaveText(/\d/);
  await expect(table.locator('tbody [data-figure="average_points"] [data-shade]')).toHaveCount(33);
  await expect(table.locator('tbody [data-figure="teleop_points"] [data-shade]')).toHaveCount(0);
  // The sidebar marks Ranking; the bar order is the phone's.
  await expect(page.getByRole('link', { name: 'Ranking' }).first()).toHaveAttribute(
    'aria-current',
    'page',
  );
  await table.getByRole('row', { name: /3339 BumbleB/ }).click();
  const panel = main.getByRole('complementary', { name: 'Team study, 3339 BumbleB' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link', { name: /Open team page/ })).toBeVisible();
  // The click scrolled BumbleB's row into view; the design's frame is the top of the page.
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, 'ranking', 'desktop');

  // Availability, sorted by Availability then Breakdowns, the builder open.
  await panel.getByRole('button', { name: 'Close the team study' }).click();
  await main.getByRole('radio', { name: /^Availability/ }).click();
  await main.getByRole('button', { name: /^Sort Availability:/ }).click();
  const builder = main.getByRole('dialog', { name: 'Sort Availability by' });
  await builder.getByRole('button', { name: '+ Breakdowns' }).click();
  await expect(main.getByRole('button', { name: /^Sort Availability:/ })).toHaveAccessibleName(
    'Sort Availability: Availability, best first, then Breakdowns, fewest first',
  );
  await expect(builder.getByRole('button', { name: /^\+ / })).toHaveText([
    '+ No-shows',
    '+ Disabled',
  ]);
  // Availability and Breakdowns are shaded, No-shows and Disabled print plain.
  await expect(table.locator('tbody [data-figure="availability_rate"] [data-shade]')).toHaveCount(
    33,
  );
  await expect(table.locator('tbody [data-figure="breakdowns"] [data-shade]')).toHaveCount(33);
  await expect(table.locator('tbody [data-figure="no_shows"] [data-shade]')).toHaveCount(0);
  await shoot(page, 'ranking-availability', 'desktop');

  // The narrowest computer (1024 px): no sideways page scroll; the study opens in the sheet.
  await page.keyboard.press('Escape');
  await main.getByRole('radio', { name: /^Scoring/ }).click();
  await shoot(page, 'ranking', 'laptop');
  await page.setViewportSize({ width: 1024, height: 768 });
  await table.getByRole('row', { name: /1690 Orbit/ }).click();
  await expect(page.getByRole('dialog', { name: '1690 Orbit' })).toBeVisible();
  await expect(main.getByRole('complementary')).toHaveCount(0);
});

test('ranking: the phone — Scoring, offline Availability then Breakdowns, the summary sheet', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 375, height: 812 });
  await openRanking(page);
  const main = page.getByRole('main');
  const list = main.getByRole('list', { name: 'Teams, Scoring' });
  await expect(list.getByRole('listitem')).toHaveCount(36);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText([
    'Home',
    'Scout',
    'Search',
    'Ranking',
  ]);
  // The first figure of the sort, shaded, on every team with data (task 1.59).
  await expect(list.locator('[data-shade]')).toHaveCount(33);
  await shoot(page, 'ranking', 'phone');

  // BumbleB's summary after a tap.
  await list.getByRole('button', { name: /3339 BumbleB/ }).click();
  const sheet = page.getByRole('dialog', { name: '3339 BumbleB' });
  await expect(sheet.getByRole('link', { name: /Open team page/ })).toBeVisible();
  await shoot(page, 'ranking-summary', 'phone');
  await sheet.getByRole('button', { name: 'Close' }).click();

  // Offline: the device computes the same table and says so.
  await goOffline(page);
  await expect(main.getByText('Computed from the data on this device')).toBeVisible();
  await main.getByRole('radio', { name: 'Availability' }).click();
  await main.getByRole('button', { name: /^Sort Availability:/ }).click();
  const builder = page.getByRole('dialog', { name: 'Sort Availability by' });
  await builder.getByRole('button', { name: '+ Breakdowns' }).click();
  await builder.getByRole('button', { name: 'Close' }).click();
  await expect(main.getByRole('button', { name: /^Sort Availability:/ })).toHaveAccessibleName(
    'Sort Availability: Availability, best first, then Breakdowns, fewest first',
  );
  // The design's frame 2 is the top of the page: the event, the device notice, the list.
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, 'ranking-offline-availability', 'phone');
});
