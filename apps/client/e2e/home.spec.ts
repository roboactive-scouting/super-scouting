import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { FIXTURE } from './fixtures';
import { RANK_ENTRIES, rankingEventWith } from './rankingFixture';
import { shoot } from './shoot';
import { touchDrag } from './touch';

/** The server takes nothing, so what is queued stays waiting to send. */
const HOLD_PUSH = { overrides: { 'sync/push': { results: [] } } };

/** The design's clock, so "2 min ago" and the other times read like the finals. */
async function setClock(page: Page) {
  await page.clock.setFixedTime(new Date('2026-03-17T09:43:00Z'));
}

/**
 * The device state of the finals: the station (Blue 2 for the lead, Red 3 for the scouter)
 * and three entries waiting to send, written straight into IndexedDB, then a reload so Home
 * reads them.
 */
async function seedDevice(page: Page, station: 'B2' | 'R3') {
  await page.evaluate(async (station) => {
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const open = indexedDB.open('robactive-scouting');
      open.onsuccess = () => done(open.result);
      open.onerror = () => fail(open.error);
    });
    const tx = db.transaction(['outbox', 'meta'], 'readwrite');
    tx.objectStore('meta').put({ key: 'scout.station', value: station });
    for (let i = 0; i < 3; i++) {
      tx.objectStore('outbox').put({
        op_id: `e2e-op-${i}`,
        entity: 'scouting_entry',
        row_id: `e2e-row-${i}`,
        action: 'create',
        base_version: null,
        payload: {},
        author_user_id: 'e2e',
        client_created_at: '2026-10-07T09:00:00.000Z',
        client_updated_at: '2026-10-07T09:00:00.000Z',
        seq: i + 1,
      });
    }
    await new Promise((done) => (tx.oncomplete = done));
    db.close();
  }, station);
  await page.reload();
}

test('home: a lead sees tiles and coverage at both widths; the switch-competition sheet', async ({
  page,
}) => {
  await setClock(page);
  await signIn(page, 'lead', HOLD_PUSH);
  await seedDevice(page, 'B2');
  await expect(
    page.getByRole('heading', { level: 1, name: 'District #3 · Tel Aviv' }),
  ).toBeVisible();
  await expect(page.getByText('Blue 2').first()).toBeVisible();
  await expect(page.getByText(/matches are missing a robot|Missing a robot/).first()).toBeVisible();
  await shoot(page, 'home');

  // Phone: one line about sending, and a lead has no admin tiles.
  await expect(page.getByText(/3 entries waiting to send/)).toBeVisible();
  const goTo = page.getByRole('region', { name: 'Go to' });
  await expect(goTo.getByRole('link', { name: /Matches|Manage|Users/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Switch competition' }).click();
  const sheet = page.getByRole('dialog', { name: 'Switch competition' });
  await expect(sheet.getByRole('button', { name: /District #1 · Haifa/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /District #3 · Tel Aviv/ })).toContainText(
    'Current · default',
  );
  await shoot(page, 'home-switch', 'phone');
  // The same choice on a computer is the centred dialog (RB.19: shot for the review).
  await shoot(page, 'home-switch', 'desktop');
  await expect(page.getByRole('dialog', { name: 'Switch competition' })).toBeVisible();
});

test('home: on a phone the switch-competition sheet has its ✕, and a drag down closes it (UF.4)', async ({
  page,
}) => {
  await setClock(page);
  await signIn(page, 'lead', HOLD_PUSH);
  await page.setViewportSize({ width: 375, height: 812 });
  const open = async () => {
    await page.getByRole('button', { name: 'Switch competition' }).click();
    const sheet = page.getByRole('dialog', { name: 'Switch competition' });
    await expect(sheet.getByRole('button', { name: /District #3 · Tel Aviv/ })).toBeVisible();
    return sheet;
  };
  let sheet = await open();
  await expect(
    sheet.locator('[data-drag-handle]').getByRole('button', { name: 'Close' }),
  ).toBeVisible();
  // The ✕ closes it (the shot of this sheet is 'home-switch', in the test above).
  await sheet.locator('[data-drag-handle]').getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
  // A slow drag down from the title closes it (this config runs with reduced motion).
  sheet = await open();
  await touchDrag(page, sheet.getByRole('heading', { name: 'Switch competition' }), { dy: 220 });
  await expect(sheet).toBeHidden();
  // So does a drag on the body while it is at the top; a drag up does not.
  sheet = await open();
  const body = sheet.getByText(/Only for this session/);
  await touchDrag(page, body, { dy: -60 });
  await expect(sheet).toBeVisible();
  await touchDrag(page, body, { dy: 220 });
  await expect(sheet).toBeHidden();
});

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('home: the phone sheet follows a drag, springs back from a short one, and leaves on a long one (UF.4)', async ({
    page,
  }) => {
    await setClock(page);
    await signIn(page, 'lead', HOLD_PUSH);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('button', { name: 'Switch competition' }).click();
    const sheet = page.getByRole('dialog', { name: 'Switch competition' });
    const title = sheet.getByRole('heading', { name: 'Switch competition' });
    await expect(sheet.getByRole('button', { name: /District #3 · Tel Aviv/ })).toBeVisible();
    await page.waitForTimeout(400); // the sheet's own slide in
    const resting = (await sheet.boundingBox())!.y;
    await touchDrag(page, title, { dy: 50 });
    await expect(sheet).toBeVisible();
    await expect.poll(async () => (await sheet.boundingBox())!.y).toBeCloseTo(resting, 0);
    await touchDrag(page, title, { dy: 260 });
    await expect(sheet).toBeHidden();
  });
});

test('home: the cached-data notice is flush with the page on a phone (UF.7)', async ({ page }) => {
  await setClock(page);
  await signIn(page, 'lead', HOLD_PUSH);
  // Loaded once; from then on the pull never answers: the device works from what it holds.
  await expect(
    page.getByRole('heading', { level: 1, name: 'District #3 · Tel Aviv' }),
  ).toBeVisible();
  await page.route(
    (url) => url.host === 'api.test' && url.pathname.endsWith('/sync/pull'),
    (route) => route.abort('internetdisconnected'),
  );
  await seedDevice(page, 'B2');
  const notice = page.getByText(/^Working from data already on this device/);
  await expect(notice).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  const strip = notice.locator('xpath=..');
  // The shell swaps to its phone layout on the resize; measure once it has.
  await expect.poll(async () => await strip.boundingBox()).toMatchObject({ x: 0, width: 375 });
  // No dark start edge against the top bar: the strip's white runs to the screen's edge.
  const edge = () => strip.evaluate((el) => getComputedStyle(el).borderInlineStartWidth);
  expect(await edge()).toBe('0px');
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await edge()).toBe('4px'); // desktop unchanged
  await shoot(page, 'home-cached');
});

test('home: tapping the station opens the station picker and saves the choice (UF.7)', async ({
  page,
}) => {
  await setClock(page);
  await signIn(page, 'lead', HOLD_PUSH);
  await seedDevice(page, 'B2');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: /Change station/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Choose your station' });
  await expect(sheet.getByRole('button', { name: 'Blue 2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await sheet.getByRole('button', { name: 'Red 3', exact: true }).click();
  await shoot(page, 'home-station', 'phone');
  await sheet.getByRole('button', { name: 'Use Red 3' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: /Change station/ })).toContainText('Red 3');
  await shoot(page, 'home-station-set', 'desktop');
});

test('home: an admin on desktop sees the Manage and Users tiles', async ({ page }) => {
  await setClock(page);
  await signIn(page, 'admin', HOLD_PUSH);
  await seedDevice(page, 'B2');
  await expect(
    page.getByRole('heading', { level: 1, name: 'District #3 · Tel Aviv' }),
  ).toBeVisible();
  const goTo = page.getByRole('region', { name: 'Go to' });
  await expect(goTo.getByRole('link', { name: /^Manage/ })).toBeVisible();
  await expect(goTo.getByRole('link', { name: /^Users/ })).toBeVisible();
  await shoot(page, 'home-admin', 'desktop');
});

test('home: an admin on a phone sees Matches and no Users tile', async ({ page }) => {
  await setClock(page);
  await signIn(page, 'admin', HOLD_PUSH);
  await seedDevice(page, 'B2');
  await expect(
    page.getByRole('heading', { level: 1, name: 'District #3 · Tel Aviv' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  const goTo = page.getByRole('region', { name: 'Go to' });
  await expect(goTo.getByRole('link', { name: /Matches/ })).toBeVisible();
  await expect(goTo.getByRole('link', { name: /^Users/ })).toHaveCount(0);
  await goTo.scrollIntoViewIfNeeded();
  await shoot(page, 'home-admin', 'phone');
});

test('home: a scouter has no admin tiles', async ({ page }) => {
  await setClock(page);
  await signIn(page, 'scouter', HOLD_PUSH);
  await seedDevice(page, 'R3');
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    page.getByRole('heading', { level: 1, name: 'District #3 · Tel Aviv' }),
  ).toBeVisible();
  const goTo = page.getByRole('region', { name: 'Go to' });
  await expect(goTo.getByRole('link', { name: /Switch scouter/ })).toBeVisible();
  await expect(goTo.getByRole('link', { name: /Matches|Manage|Users/ })).toHaveCount(0);
  await shoot(page, 'home-scouter', 'phone');
});

test.describe('on a touch phone', () => {
  test.use({ hasTouch: true });

  test('home: tapping a coverage square names the match; another moves it, elsewhere closes it (UF.21)', async ({
    page,
  }) => {
    await setClock(page);
    await signIn(page, 'lead', HOLD_PUSH);
    await seedDevice(page, 'B2');
    await page.setViewportSize({ width: 375, height: 812 });
    const coverage = page.getByRole('region', { name: 'Schedule coverage' });
    const tip = coverage.getByText(/ · \d+ scouted$/);
    await expect(coverage.getByRole('button', { name: 'Q37 · 4 scouted' })).toBeVisible();
    await expect(tip).toHaveCount(0);

    // A tap in the 3 px gap between two squares goes to the nearer one.
    const q6 = (await coverage.getByRole('button', { name: /^Q6 · / }).boundingBox())!;
    await page.touchscreen.tap(q6.x + q6.width + 1, q6.y + q6.height / 2);
    await expect(tip).toHaveText('Q6 · 6 scouted');

    // Another square moves it; the bubble stays inside the card.
    await coverage.getByRole('button', { name: 'Q37 · 4 scouted' }).tap();
    await expect(tip).toHaveText('Q37 · 4 scouted');
    await expect(tip).toHaveCount(1);
    const card = (await coverage.boundingBox())!;
    const bubble = (await tip.boundingBox())!;
    expect(bubble.x).toBeGreaterThanOrEqual(card.x);
    expect(bubble.x + bubble.width).toBeLessThanOrEqual(card.x + card.width);
    await shoot(page, 'home-coverage-tap', 'phone');

    // A tap elsewhere closes it.
    await page.getByRole('heading', { level: 1 }).tap();
    await expect(tip).toHaveCount(0);
  });
});

test('home: on a computer a coverage square names its match on hover and on focus (UF.21)', async ({
  page,
}) => {
  await setClock(page);
  await signIn(page, 'lead', HOLD_PUSH);
  await seedDevice(page, 'B2');
  const coverage = page.getByRole('region', { name: 'Schedule coverage' });
  const tip = coverage.getByText(/ · \d+ scouted$/);
  await coverage.getByRole('button', { name: 'Q19 · 5 scouted' }).hover();
  await expect(tip).toHaveText('Q19 · 5 scouted');
  await page.mouse.move(0, 0);
  await expect(tip).toHaveCount(0);
  await coverage.getByRole('button', { name: 'Q1 · 6 scouted' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(coverage.getByRole('button', { name: 'Q2 · 6 scouted' })).toBeFocused();
  await expect(tip).toHaveText('Q2 · 6 scouted');
});

/*
 * Task 1.58b: Our team and Top teams read the ranking page's own source. The ranking's event
 * (rankingFixture.ts, 36 teams), with 2096 a stronger robot than there — 9 teleop notes a match,
 * 30 in its last counted one (Q32) — so it is #3 of the 33 ranked teams and was #6 before Q32;
 * `rankTeams` is the shared builder over the same rows, `before_match_number` passed through.
 */
const US = (FIXTURE.pull.entities.teams as { id: string; number: number }[]).find(
  (t) => t.number === 2096,
)!.id;
const counted = (e: (typeof RANK_ENTRIES)[number]) =>
  e.robot_status === 'played' || e.robot_status === 'broke_down';
const LAST = RANK_ENTRIES.filter((e) => e.team_id === US && counted(e)).at(-1)!.id;
const STRONG = rankingEventWith(
  RANK_ENTRIES.map((e) =>
    e.team_id === US && counted(e)
      ? { ...e, data: { ...e.data, teleop_notes: e.id === LAST ? 30 : 9 } }
      : e,
  ),
);
/** The same event with 2096 not scouted at all: not ranked yet. */
const UNRANKED = rankingEventWith(RANK_ENTRIES.filter((e) => e.team_id !== US));

test('home: Our team and Top teams from the ranking, at both widths (task 1.58b)', async ({
  page,
}) => {
  await setClock(page);
  await signIn(page, 'lead', {
    overrides: { ...HOLD_PUSH.overrides, 'sync/pull': STRONG.pull, rankTeams: STRONG.rankTeams },
  });
  await seedDevice(page, 'B2');
  const ours = page.getByRole('region', { name: 'Our team' });
  await expect(ours).toContainText('#3 / 36');
  await expect(ours.getByText('Up 3 places since Q32')).toBeAttached();
  await expect(ours).toContainText('▲3 since Q32');
  const top = page.getByRole('region', { name: 'Top teams' });
  await expect(top.getByRole('listitem')).toHaveCount(5);
  await expect(top.locator('li[data-us]')).toHaveAttribute('data-team', '2096');
  await expect(top.getByRole('link', { name: 'Full ranking' })).toHaveAttribute('href', '/ranking');
  await shoot(page, 'home-ranking', undefined, { long: true });

  // Full ranking opens /ranking, where 2096 holds the same rank.
  await top.getByRole('link', { name: 'Full ranking' }).click();
  await page.waitForURL('/ranking');
  await expect(page.getByText(/from the server · as of/i).first()).toBeVisible();
  await expect(page.locator('[data-team="2096"]').first()).toContainText('3');
});

test('home: our team not ranked yet — no Our team card, three tiles; Top teams stays (task 1.58b)', async ({
  page,
}) => {
  await setClock(page);
  await signIn(page, 'lead', {
    overrides: {
      ...HOLD_PUSH.overrides,
      'sync/pull': UNRANKED.pull,
      rankTeams: UNRANKED.rankTeams,
    },
  });
  await seedDevice(page, 'B2');
  const top = page.getByRole('region', { name: 'Top teams' });
  await expect(top.getByRole('listitem')).toHaveCount(5);
  await expect(top.locator('li[data-us]')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Our team' })).toHaveCount(0);
  await shoot(page, 'home-ranking-unranked');
});
