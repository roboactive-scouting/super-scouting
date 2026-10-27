import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { ENTRIES, matchId, pullWithSupers, teamId } from './fixtures';
import { shoot } from './shoot';

/*
 * The team page (task 1.53; docs/design/pages/24-team/final, variant D2): 1690 Orbit at District
 * #3 with its nine matches (Q1 … Q37) — Q19 broke down, Q25 a no-show still holding stale values
 * — several scouters, notes (one in Hebrew) and its super entry. Computed on the device by the
 * shared engine from the pulled cache, scored by the fixture form's rules, so the points are real.
 * Computer: Stats and Matches. Phone: Stats, Stats scrolled (compact header), Matches, Progress
 * with a second chart, Notes, and a team with no entries (5987 Galaxia, its entries removed).
 */

const ORBIT = teamId(1690);
const GALAXIA = teamId(5987);

/** 17 March 2026 in Tel Aviv (UTC+2): `hh:mm` local as an ISO instant. */
const at = (hm: string) => {
  const [h, m] = hm.split(':').map(Number) as [number, number];
  return `2026-03-17T${String(h - 2).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
};

const NOTES: Record<number, [string, string]> = {
  37: ['Best match so far. Driver calm, lined up every shot.', '11:52'],
  34: ['הרובוט נתקע ליד הקיר באמצע הטלאופ וחזר אחרי בערך 10 שניות.', '10:31'],
  31: ['Played defense on 5951 for the last 40 s; drew one foul.', '09:40'],
  19: ['Lost a wheel at 1:10 and sat still until the end.', '09:12'],
};

/** Orbit's entries as the design draws them: a breakdown, a no-show, four notes. */
const TEAM_ENTRIES = ENTRIES.map((e) => {
  if (e.team_id !== ORBIT) return e;
  const n = matchNumber(e.match_id);
  let out = { ...e, data: { ...e.data } };
  if (n === 19) {
    out = {
      ...out,
      robot_status: 'broke_down',
      breakdown_seconds: 70,
      data: { ...out.data, teleop_notes: 1, endgame_climb: 'none' },
    };
  }
  if (n === 25) {
    // Stale values on a no-show: none of them may ever show (11.3).
    out = { ...out, robot_status: 'no_show' };
  }
  const note = NOTES[n];
  if (note) {
    out = {
      ...out,
      data: { ...out.data, notes: note[0] },
      client_updated_at: at(note[1]),
    };
  }
  return out;
});

function matchNumber(id: string): number {
  for (let n = 1; n <= 40; n++) if (matchId(n) === id) return n;
  return 0;
}

const PULL = pullWithSupers(TEAM_ENTRIES);
const EMPTY_PULL = pullWithSupers(TEAM_ENTRIES.filter((e) => e.team_id !== GALAXIA));

/** Signs in at the design's 12:00 (Tel Aviv, 17 March 2026) and opens a team's page. */
async function openTeam(page: Page, id: string, pull = PULL) {
  await page.clock.setFixedTime(new Date('2026-03-17T12:00:00+02:00'));
  await signIn(page, 'lead', { overrides: { 'sync/pull': pull } });
  await page.waitForLoadState('networkidle');
  await page.goto(`/teams/${id}`);
  await expect(page.locator('header h1')).toBeVisible();
}

test('team page: Stats and Matches on a computer and a phone', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTeam(page, ORBIT);
  const main = page.getByRole('main');
  await expect(page.locator('header').filter({ hasText: 'Average points' })).toContainText(
    /District #3 · Tel Aviv · 11 entries · last seen Q37/,
  );
  // The sidebar marks Search; the crumb reads "Search / 1690 Orbit".
  await expect(page.getByRole('link', { name: 'Search' }).first()).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.locator('header p').first()).toHaveText(/^Search\s*\/\s*1690 Orbit$/);
  await expect(main.getByRole('table', { name: 'All metrics' })).toBeVisible();
  await expect(main.getByRole('group', { name: 'Reliability' })).toContainText('Q19');
  await expect(main.getByRole('figure', { name: /Points per match/ })).toBeVisible();
  await expect(main.locator('[data-match-strip]')).toHaveCount(0);
  await expect(page.getByRole('img')).toHaveCount(0);
  await shoot(page, 'team');

  // Matches: the strip first, then the table with the scouter; the no-show is "—" throughout.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('tab', { name: /^Matches/ }).click();
  await expect(main.getByRole('navigation', { name: 'Match strip' })).toBeVisible();
  const table = main.getByRole('table', { name: 'Match by match' });
  const noShow = table.getByRole('row', { name: /^Q25 No show/ });
  await expect(noShow).toBeVisible();
  // Points and the four metric columns: all "—", never a 0 or the stale values.
  expect((await noShow.locator('td').allTextContents()).slice(2, 7)).toEqual([
    '—',
    '—',
    '—',
    '—',
    '—',
  ]);
  await shoot(page, 'team-matches', 'desktop');
  await table.getByRole('row').nth(1).getByRole('link').click();
  await expect(page).toHaveURL(/\/entries\//);
});

test('team page: the phone frames — scrolled, Matches, Progress with two charts, Notes', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 375, height: 812 });
  await openTeam(page, ORBIT);
  const main = page.getByRole('main');
  // Stats scrolled: the header shrinks to one line, the reliability strip above the rows.
  // Scrolled until the tabs stick, the panel's top right under them (the design's frame 2).
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect(page.locator('header[data-compact]')).toBeVisible();
  await page.evaluate(() => {
    const panel = document.querySelector('[role="tabpanel"]')!.getBoundingClientRect().top;
    const tabs = document.querySelector('[role="tablist"]')!.getBoundingClientRect().bottom;
    window.scrollBy(0, panel - tabs - 1);
  });
  await expect(page.locator('header[data-compact]')).toBeVisible();
  await shoot(page, 'team-scrolled', 'phone');

  await page.getByRole('tab', { name: /^Matches/ }).click();
  await expect(main.getByRole('navigation', { name: 'Match strip' })).toBeVisible();
  await expect(main.getByRole('list', { name: 'Match by match' })).toContainText('Q25');
  await expect(main.getByRole('table', { name: 'Match by match' })).toHaveCount(0);
  await shoot(page, 'team-matches', 'phone');

  await page.getByRole('tab', { name: /^Progress/ }).click();
  await expect(main.locator('[data-match-strip]')).toHaveCount(0);
  await main.getByRole('button', { name: /Add a chart under it/ }).click();
  await main
    .getByRole('region', { name: /^Chart 2/ })
    .getByRole('combobox', { name: 'Chart metric' })
    .selectOption({ label: 'Teleop notes scored' });
  await expect(main.getByRole('figure')).toHaveCount(2);
  await shoot(page, 'team-progress', 'phone');

  await page.getByRole('tab', { name: /^Notes/ }).click();
  await expect(main.getByText(NOTES[34]![0])).toHaveAttribute('dir', 'auto');
  await shoot(page, 'team-notes', 'phone');
  await expect(page.getByRole('img')).toHaveCount(0);
});

test('team page: a team with no entries yet', async ({ page }) => {
  await openTeam(page, GALAXIA, EMPTY_PULL);
  await expect(page.getByText('No entries for this team yet')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Scout a match' })).toBeVisible();
  await shoot(page, 'team-empty');
});
