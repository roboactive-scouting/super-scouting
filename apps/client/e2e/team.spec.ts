import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { ENTRIES, FORM, matchId, pullWithSupers, teamId, TEAMS } from './fixtures';
import type { PullResponse } from '@frc/shared';
import { showsThrough } from './pinned';
import { shoot } from './shoot';

/*
 * The team page (task 1.53; docs/design/pages/24-team/final, variant D2): 1690 Orbit at District
 * #3 with its nine matches (Q1 … Q37) — Q19 broke down, Q25 a no-show still holding stale values
 * — several scouters, notes (one in Hebrew) and its super entry. Computed on the device by the
 * shared engine from the pulled cache, scored by the fixture form's rules, so the points are real.
 * Computer: Stats and Matches. Phone: Stats, Stats scrolled (compact header), Matches, Progress
 * with a second chart, Notes, and a team with no entries (5987 Galaxia, its entries removed).
 * The form gains a Climb time timer (no declared direction: faster shades better) and a
 * post-match Driver skill rating here only, so the other specs' screens keep their form.
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

const numberOf = new Map(TEAMS.map((t) => [t.id, t.number]));

/**
 * Every played match's climb time and driver skill, fixed by match and team: a robot that did
 * not climb answered "unsure" (null), and a no-show records neither.
 */
function withTimerAndRating(e: (typeof ENTRIES)[number]): (typeof ENTRIES)[number] {
  if (e.robot_status === 'no_show') return e;
  const seed = matchNumber(e.match_id) * 7 + (numberOf.get(e.team_id) ?? 0);
  const climbed = e.data.endgame_climb !== undefined && e.data.endgame_climb !== 'none';
  return {
    ...e,
    data: {
      ...e.data,
      climb_time: climbed ? 6 + (seed % 120) / 10 : null,
      driver: 1 + (seed % 5),
    },
  };
}

/** Orbit's entries as the design draws them: a breakdown, a no-show, four notes. */
const TEAM_ENTRIES = ENTRIES.map((e) => {
  if (e.team_id !== ORBIT) return withTimerAndRating(e);
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
  return withTimerAndRating(out);
});

function matchNumber(id: string): number {
  for (let n = 1; n <= 40; n++) if (matchId(n) === id) return n;
  return 0;
}

/** The match form's last field, cloned: a timer in Endgame and a 1–5 rating in Post-match. */
function withTimerAndRatingFields(pull: PullResponse): PullResponse {
  const fields = pull.entities.form_fields as Record<string, unknown>[];
  const match = fields.filter((f) => f.form_version_id === FORM.version_id);
  const last = match[match.length - 1]!;
  const extra = (n: number, over: Record<string, unknown>) => ({
    ...last,
    id: `0000000a-0000-4000-8000-${String(900 + n).padStart(12, '0')}`,
    display_order: match.length + n,
    help_text: null,
    expected_range: null,
    is_ordinal: null,
    ...over,
  });
  return {
    ...pull,
    entities: {
      ...pull.entities,
      form_fields: [
        ...fields,
        extra(1, {
          key: 'climb_time',
          label: 'Climb time',
          type: 'timer',
          phase: 'endgame',
          unit: 'seconds',
          direction: null,
          description: 'Seconds from starting the climb to hanging',
          config: {},
        }),
        extra(2, {
          key: 'driver',
          label: 'Driver skill',
          type: 'rating',
          phase: 'post_match',
          unit: null,
          direction: 'higher_is_better',
          description: 'How well the driver handled the robot, 1 to 5',
          config: { max: 5 },
        }),
      ],
    },
  } as PullResponse;
}

const PULL = withTimerAndRatingFields(pullWithSupers(TEAM_ENTRIES));
const EMPTY_PULL = withTimerAndRatingFields(
  pullWithSupers(TEAM_ENTRIES.filter((e) => e.team_id !== GALAXIA)),
);

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
  const metrics = main.getByRole('table', { name: 'All metrics' });
  await expect(metrics).toBeVisible();
  // The timer in seconds and the rating, under Endgame and Post-match.
  await expect(metrics.locator('[data-metric="field:climb_time"]')).toContainText(/\d s$/);
  await expect(metrics.locator('[data-metric="field:driver"]')).toContainText('Driver skill');
  await expect(metrics.getByRole('columnheader', { name: 'Post-match' })).toBeVisible();
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

/*
 * Phase 1 I side task 2 (plan v1.30): nothing pinned floats. The page is scrolled 4 px at a time,
 * down through the phone header's compact switch until the tabs stick and on, then back up, with
 * motion ON so the header's padding transition runs, and the boxes are read on every frame:
 * - the team header sits on the shell's top bar (nothing shows between them);
 * - the tabs never ride over the header;
 * - once the tabs stick (the panel slides under them), they touch the header: no gap.
 */
type Seam = {
  y: number;
  frame: number;
  bar: number;
  headerTop: number;
  header: number;
  tabs: number;
  tabsBottom: number;
  panel: number;
};

async function walk(page: Page, to: number, step: number): Promise<Seam[]> {
  return page.evaluate(
    async ({ to, step }) => {
      const frame = () => new Promise((done) => requestAnimationFrame(done));
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const out: Seam[] = [];
      const ys: number[] = [];
      for (let y = 0; y <= to; y += step) ys.push(y);
      for (const y of [...ys, ...ys.slice(0, -1).reverse()]) {
        window.scrollTo(0, y);
        for (let f = 0; f < 4; f++) {
          await frame();
          // The shell's bar: the phone's top bar or the computer's crumb bar (the header with no h1).
          const bar = [...document.querySelectorAll('header')].find((h) => !h.querySelector('h1'))!;
          out.push({
            y: window.scrollY,
            frame: f,
            bar: bar.getBoundingClientRect().bottom,
            headerTop: box('header:has(h1)').top,
            header: box('header:has(h1)').bottom,
            tabs: box('[role="tablist"]').top,
            // The tab bar's bottom: the tablist's bar, with its 1 px rule.
            tabsBottom: document
              .querySelector('[role="tablist"]')!
              .parentElement!.getBoundingClientRect().bottom,
            panel: box('[role="tabpanel"]').top,
          });
        }
      }
      return out;
    },
    { to, step },
  );
}

for (const [layout, size] of [
  ['phone', { width: 375, height: 812 }],
  ['desktop', { width: 1440, height: 900 }],
] as const) {
  test.describe(() => {
    test.use({ reducedMotion: 'no-preference' });
    test(`team page: the tabs stay flush under the header while scrolling (${layout})`, async ({
      page,
    }) => {
      test.slow();
      await page.setViewportSize(size);
      await openTeam(page, ORBIT);
      // Settled first: a shell notice can sit over the page for a moment after it opens.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const bar = [...document.querySelectorAll('header')].find(
              (h) => !h.querySelector('h1'),
            )!;
            const head = document.querySelector('header:has(h1)')!;
            return head.getBoundingClientRect().top - bar.getBoundingClientRect().bottom;
          }),
        )
        .toBe(0);
      const seams = await walk(page, 480, 4);
      // The header sits on the shell's bar wherever the page is scrolled.
      const off = seams.filter((s) => Math.abs(s.headerTop - s.bar) > 0.5);
      // The tabs never ride over the header.
      const over = seams.filter((s) => s.tabs < s.header - 0.5);
      // Stuck (the panel has slid under the tabs): they touch the header.
      const stuck = seams.filter((s) => s.panel < s.tabsBottom - 0.5);
      const parted = stuck.filter((s) => Math.abs(s.tabs - s.header) > 0.5);
      console.log(
        `${layout}: ${seams.length} samples, ${stuck.length} stuck; header off its bar ${off.length}; ` +
          `tabs over the header ${over.length}; stuck with a gap ${parted.length}`,
        JSON.stringify(parted.slice(0, 4)),
      );
      expect(stuck.length).toBeGreaterThan(0);
      expect(off).toEqual([]);
      expect(over).toEqual([]);
      expect(parted).toEqual([]);

      // Stuck, nothing shows between the shell's bar, the header and the tabs: that band is all bar.
      const scrolled = async () => {
        await page.evaluate(() => window.scrollTo(0, 400));
        await expect(page.locator('[data-team-head]')).toBeVisible();
      };
      await scrolled();
      const head = (await page.locator('[data-team-head]').boundingBox())!;
      const tabsBar = (await page.getByRole('tablist').locator('..').boundingBox())!;
      expect(
        await showsThrough(
          page,
          { top: 0, bottom: tabsBar.y + tabsBar.height, left: head.x, right: head.x + head.width },
          ['header:not(:has(h1))', '[data-team-head]'],
        ),
      ).toEqual([]);
      // The phone's scrolled frame is shot by the phone frames test.
      if (layout === 'desktop') await shoot(page, 'team-scrolled', 'desktop', { before: scrolled });

      // A tab chosen while the block is stuck keeps it stuck, the new panel from its top.
      await page.evaluate(() => window.scrollTo(0, 600));
      await page.getByRole('tab', { name: /^Notes/ }).click();
      await expect(page.getByRole('tabpanel', { name: 'Notes' })).toBeVisible();
      const after = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        return {
          header: box('header:has(h1)').bottom,
          tabs: box('[role="tablist"]').top,
          // The tab bar's bottom: the tablist's bar, with its 1 px rule.
          tabsBottom: document
            .querySelector('[role="tablist"]')!
            .parentElement!.getBoundingClientRect().bottom,
          panel: box('[role="tabpanel"]').top,
        };
      });
      expect(Math.abs(after.tabs - after.header)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(after.panel - after.tabsBottom)).toBeLessThanOrEqual(0.5);
    });
  });
}
