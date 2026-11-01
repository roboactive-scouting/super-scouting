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
  // The click scrolled BumbleB's row into view inside the table's own box; the design's frame
  // is the top of the table.
  await main.getByRole('region', { name: /^Ranking table/ }).evaluate((el) => el.scrollTo(0, 0));
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
  await main.getByRole('region', { name: /^Ranking table/ }).evaluate((el) => el.scrollTo(0, 0));
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

/*
 * The user's feedback from testing develop (2026-11-01): the sort badge spilled into the next
 * column, the computer's scrolling "works weird", the phone's Sort builder cut each figure's name
 * to "…", and the roster count was not said.
 */

/** Each sortable header of the open table: its words fit, and its content stays in its own cell. */
async function headersFit(page: Page) {
  return page
    .getByRole('main')
    .locator('thead tr:last-child th:has(button)')
    .evaluateAll((ths) =>
      ths.map((th) => {
        const content = th.querySelector('button')!.getBoundingClientRect();
        const cell = th.getBoundingClientRect();
        const style = getComputedStyle(th);
        return {
          name: th.textContent,
          fits: th.scrollWidth <= th.clientWidth,
          inside:
            content.left >= cell.left + parseFloat(style.paddingLeft) - 0.5 &&
            content.right <= cell.right - parseFloat(style.paddingRight) + 0.5,
        };
      }),
    );
}

test('ranking: every sortable header fits in its in-sort state, at 1440 and 1280 px', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRanking(page);
  const main = page.getByRole('main');
  // The roster under the event's name.
  await expect(main.getByText(/· 36 teams ·/)).toBeVisible();
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const category of ['Scoring', 'Availability']) {
      await main.getByRole('radio', { name: new RegExp(`^${category}`) }).click();
      const heads = main.locator('thead tr:last-child th:has(button)');
      const count = await heads.count();
      expect(count).toBeGreaterThanOrEqual(4);
      for (let i = 0; i < count; i++) {
        // The figure becomes the sort: bold, the numbered badge (and its status shape).
        await heads.nth(i).click();
        await expect(heads.nth(i)).toHaveAttribute('aria-sort', /ascending|descending/);
        for (const head of await headersFit(page)) {
          expect(head, `${width} px, ${category}, sorted by #${i + 1}: ${head.name}`).toEqual({
            name: head.name,
            fits: true,
            inside: true,
          });
        }
      }
    }
  }

  // Teleop the primary sort, Total its tie-breaker.
  await main.getByRole('radio', { name: /^Scoring/ }).click();
  await main.getByRole('columnheader', { name: /^Teleop/ }).click();
  await main.getByRole('button', { name: /^Sort Scoring:/ }).click();
  await main
    .getByRole('dialog', { name: 'Sort Scoring by' })
    .getByRole('button', { name: '+ Total' })
    .click();
  // The control toggles the builder shut.
  await main.getByRole('button', { name: /^Sort Scoring:/ }).click();
  await expect(main.getByRole('dialog', { name: 'Sort Scoring by' })).toBeHidden();
  await expect(main.getByRole('button', { name: /^Sort Scoring:/ })).toHaveAccessibleName(
    'Sort Scoring: Teleop, best first, then Total, best first',
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const head of await headersFit(page)) {
    expect(head.fits && head.inside, head.name ?? '').toBe(true);
  }
  await shoot(page, 'ranking-sorted-teleop', 'desktop');
});

/** The table's scroll box and the page's own scroll. */
const metrics = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector<HTMLElement>(
      '[role="region"][aria-label^="Ranking table"]',
    )!;
    const head = box.querySelector('thead')!.getBoundingClientRect();
    return {
      pageScroll: document.documentElement.scrollHeight - window.innerHeight,
      boxScroll: box.scrollHeight - box.clientHeight,
      // The header's top against the box's inside top (under its 1 px border).
      headGap: head.top - (box.getBoundingClientRect().top + box.clientTop),
    };
  });

test('ranking: the computer fills the window — the table and the study scroll on their own', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRanking(page);
  const main = page.getByRole('main');
  const box = main.getByRole('region', { name: 'Ranking table, Scoring' });
  await expect(box).toBeVisible();

  for (const [width, height, only] of [
    [1440, 900, 'desktop'],
    [1280, 800, '1280'],
  ] as const) {
    await page.setViewportSize({ width, height });
    // From 1360 px a row opens the study beside the table; under it, a row opens the summary
    // sheet over the page, so the 1280 pictures show the table alone.
    const beside = width >= 1360;
    const panel = main.getByRole('complementary', { name: 'Team study, 3339 BumbleB' });
    if (beside) {
      await main.getByRole('row', { name: /3339 BumbleB/ }).click();
      await expect(panel).toBeVisible();
    }
    // The page itself does not scroll; the table's box does.
    let m = await metrics(page);
    expect(m.pageScroll, `${width}: the page scrolls`).toBeLessThanOrEqual(0);
    expect(m.boxScroll, `${width}: the table does not scroll`).toBeGreaterThan(0);

    await box.evaluate((el) => el.scrollTo(0, 0));
    await shoot(page, 'ranking-scroll-top', only);

    await box.evaluate((el) => el.scrollTo(0, (el.scrollHeight - el.clientHeight) / 2));
    m = await metrics(page);
    expect(Math.abs(m.headGap), `${width}: the header is not pinned`).toBeLessThanOrEqual(1);
    if (beside) {
      // The study scrolls on its own.
      expect(await panel.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
    }
    await shoot(page, 'ranking-scroll-middle', only);

    await box.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    if (beside) await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    m = await metrics(page);
    expect(Math.abs(m.headGap)).toBeLessThanOrEqual(1);
    expect(m.pageScroll).toBeLessThanOrEqual(0);
    // The event line and the controls are still in view; so is the last team and, beside it,
    // the study's footnote.
    await expect(main.getByRole('heading', { name: 'Ranking', level: 1 })).toBeInViewport();
    await expect(main.getByRole('button', { name: /^Sort Scoring:/ })).toBeInViewport();
    await expect(box.locator('tbody tr').last()).toBeInViewport();
    if (beside) {
      await expect(
        panel.getByText(/A breakdown counts as missed for availability/),
      ).toBeInViewport();
    }
    await shoot(page, 'ranking-scroll-bottom', only);
    if (beside) await panel.getByRole('button', { name: 'Close the team study' }).click();
  }

  // The keyboard reaches the box and scrolls it.
  await box.evaluate((el) => el.scrollTo(0, 0));
  await box.focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  // The narrowest computer: the table scrolls sideways inside its card, its header still pinned.
  await page.setViewportSize({ width: 1024, height: 768 });
  await main.getByRole('radio', { name: /^Availability/ }).click();
  const wide = main.getByRole('region', { name: 'Ranking table, Availability' });
  expect(await wide.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await wide.evaluate((el) => el.scrollTo(el.scrollWidth, (el.scrollHeight - el.clientHeight) / 2));
  expect(Math.abs((await metrics(page)).headGap)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);

  // A shell notice above the page (offline, a session override: a strip in the shell's column,
  // before the page): the page still fits the window, the area giving up the strip's height; and
  // takes it back once the strip goes.
  await page.setViewportSize({ width: 1440, height: 900 });
  const bottomGap = () =>
    page.evaluate(
      () => innerHeight - document.querySelector('main')!.getBoundingClientRect().bottom,
    );
  await expect.poll(bottomGap).toBe(0);
  await page.evaluate(() => {
    const content = document.querySelector('main')!.parentElement!;
    const strip = document.createElement('div');
    strip.id = 'e2e-notice';
    strip.style.height = '48px';
    content.parentElement!.insertBefore(strip, content);
  });
  await expect.poll(async () => (await metrics(page)).pageScroll).toBeLessThanOrEqual(0);
  await expect.poll(bottomGap).toBe(0);
  await page.evaluate(() => document.getElementById('e2e-notice')!.remove());
  await expect.poll(bottomGap).toBe(0);
});

test('ranking: the phone Sort builder names every figure in full, and the page scrolls smoothly', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 375, height: 812 });
  await openRanking(page);
  const main = page.getByRole('main');
  await expect(main.getByRole('list', { name: 'Teams, Scoring' })).toBeVisible();
  // The roster under the event's name.
  await expect(main.getByText(/· 36 teams · from the server/)).toBeVisible();

  // Scrolled top to bottom by the wheel: the page moves one way only, never more than the wheel,
  // and the sticky controls stay on the top bar the whole way (the user asked to report a jump).
  const steps: { y: number; bar: number }[] = [];
  const sticky = main.locator('.sticky').first();
  for (let i = 0; i < 40; i++) {
    const y = await page.evaluate(() => window.scrollY);
    const bar = (await sticky.boundingBox())!.y;
    steps.push({ y, bar });
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(30);
  }
  for (let i = 1; i < steps.length; i++) {
    expect(steps[i]!.y, `step ${i}: the page jumped back`).toBeGreaterThanOrEqual(steps[i - 1]!.y);
    expect(steps[i]!.y - steps[i - 1]!.y, `step ${i}: the page jumped`).toBeLessThanOrEqual(300);
  }
  const pinned = steps.filter((s) => s.y > 200).map((s) => Math.round(s.bar));
  expect(new Set(pinned).size, `the sticky controls moved: ${pinned.join(', ')}`).toBe(1);
  await page.evaluate(() => window.scrollTo(0, 0));

  for (const [category, tieBreakers] of [
    ['Scoring', ['Auto', 'Teleop', 'Endgame']],
    ['Availability', ['Breakdowns', 'No-shows', 'Disabled']],
  ] as const) {
    await main.getByRole('radio', { name: category }).click();
    await main.getByRole('button', { name: new RegExp(`^Sort ${category}:`) }).click();
    const sheet = page.getByRole('dialog', { name: `Sort ${category} by` });
    for (const name of tieBreakers) await sheet.getByRole('button', { name: `+ ${name}` }).click();
    const names = sheet.locator('[data-sort-step] [data-sort-name]');
    await expect(names).toHaveCount(4);
    for (const name of await names.all()) {
      const box = await name.evaluate((el) => ({
        text: el.textContent,
        fits: el.scrollWidth <= el.clientWidth,
        lines: Math.round(
          el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
        ),
      }));
      expect(box, `${category}: ${box.text}`).toEqual({ text: box.text, fits: true, lines: 1 });
    }
    await shoot(
      page,
      category === 'Scoring' ? 'ranking-sort-sheet' : 'ranking-sort-sheet-availability',
      'phone',
    );
    await sheet.getByRole('button', { name: 'Close' }).click();
  }
});
