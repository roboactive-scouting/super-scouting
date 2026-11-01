import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { ENTRIES, FIXTURE, pullWithSupers } from './fixtures';
import { shoot } from './shoot';

/** A long full name (Q38 1574's scouter): it wraps on a phone, never cut (UF.8). */
const LONG_NAME = 'Amit Ben-David Abramovich-Rosenthal';

/** The edit window's refused line, word for word as on Sync (SPEC-FINAL 7.6, v1.44). */
const REFUSED_LINE =
  'Not sent: Changed after the 5-minute edit window. A lead can save it for you.';

/**
 * The server takes nothing, so what is queued stays waiting to send; Amit's name is the long
 * one. The pull carries the super form and three super entries (task 1.52, 26-entry-search).
 */
const SUPER_PULL = pullWithSupers();
const HOLD_PUSH = {
  overrides: {
    'sync/push': { results: [] },
    'sync/pull': {
      ...SUPER_PULL,
      entities: {
        ...SUPER_PULL.entities,
        users: SUPER_PULL.entities.users.map((u) =>
          u.full_name === 'Amit Ben-David' ? { ...u, full_name: LONG_NAME } : u,
        ),
      },
    },
  },
};

/** A row or card lit as when hovered or pressed: keyboard focus draws the same tint and edge. */
const focusLink = (page: Page, name: RegExp) => async () => {
  await page.keyboard.press('Shift');
  await page.getByRole('link', { name }).first().focus();
};

/** The design's clock: Tuesday 17 March 2026, 12:00 in Tel Aviv, so the entries are "today". */
async function setClock(page: Page) {
  await page.clock.setFixedTime(new Date('2026-03-17T12:00:00+02:00'));
}

/**
 * The design's queue: the first three entries (Q38) wait to send, and the ninth (Q36, 5135)
 * was refused by the server. All four sit in the outbox; a refusal parks one.
 */
async function seedOutbox(page: Page) {
  const waiting = ENTRIES.slice(0, 3).map((e) => e.id);
  const refused = ENTRIES[8]!.id;
  await page.evaluate(
    async ({ waiting, refused }) => {
      const db = await new Promise<IDBDatabase>((done, fail) => {
        const open = indexedDB.open('robactive-scouting');
        open.onsuccess = () => done(open.result);
        open.onerror = () => fail(open.error);
      });
      const tx = db.transaction(['outbox', 'syncState'], 'readwrite');
      [...waiting, refused].forEach((id, i) => {
        tx.objectStore('outbox').put({
          op_id: `e2e-op-${i}`,
          entity: 'scouting_entry',
          row_id: id,
          action: 'create',
          base_version: null,
          payload: {},
          author_user_id: 'e2e',
          client_created_at: '2026-03-17T09:00:00.000Z',
          client_updated_at: '2026-03-17T09:00:00.000Z',
          seq: i + 1,
        });
      });
      tx.objectStore('syncState').put({
        row_id: refused,
        sync_state: 'pending',
        acked_at: null,
        origin: 'local',
        rejection: {
          code: 'edit-window-expired',
          message: 'changed after the 5-minute edit window. A lead can save it for you.',
          at: '2026-03-17T09:05:00.000Z',
        },
      });
      await new Promise((done) => (tx.oncomplete = done));
      db.close();
    },
    { waiting, refused },
  );
}

async function openEntries(page: Page) {
  await setClock(page);
  await signIn(page, 'lead', HOLD_PUSH);
  await seedOutbox(page);
  await page.goto('/entries');
}

test('entries: newest first, match and super, waiting arrows, the refused line', async ({
  page,
}) => {
  // axe walks the whole desktop table (all 209 fixture entries): slower than the default 30 s
  test.slow();
  await openEntries(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('heading', { level: 1, name: 'Entries' })).toBeVisible();
  const rows = page.getByRole('row');
  await expect(rows.nth(1)).toContainText('Q38');
  await expect(page.getByRole('button', { name: /^All \d+/ })).toBeVisible();
  // The refused entry is still in the outbox: the chip says 4, like the top bar (RB.19).
  await expect(page.getByRole('button', { name: /^Waiting 4/ })).toBeVisible();
  await expect(page.getByRole('banner').getByText('4 waiting')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Needs a look 2/ })).toBeVisible();
  await expect(page.getByText(REFUSED_LINE)).toBeVisible();
  await expect(page.getByLabel('waiting to send', { exact: true })).toHaveCount(3);
  // The kind switch: Both by default, with the counts (14 + 3 + the morning's entries).
  const both = page.getByRole('radio', { name: /^Both \d+$/ });
  await expect(both).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'Super 3' })).toBeVisible();
  // A super entry sits in the list by time: Match "—", the SUPER tag, no points.
  const superRow = rows.filter({ hasText: 'SUPER' }).first();
  await expect(superRow).toContainText('1690');
  await expect(superRow.getByRole('cell').first()).toHaveText('—');
  // Every row is a link to its preview: hovered, it is tinted with the accent edge.
  const falcons = rows.filter({ hasText: '4338' }).first();
  await falcons.hover();
  await expect(falcons).toHaveCSS('cursor', 'pointer');
  await expect(falcons).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await shoot(page, 'entries', 'desktop', { before: focusLink(page, /^Q38 4338 Falcons/) });
  // Phone: the long name is whole, on as many lines as it needs.
  await page.setViewportSize({ width: 375, height: 812 });
  const card = page.getByRole('main').getByRole('listitem').filter({ hasText: LONG_NAME }).first();
  await expect(card).toContainText(`${LONG_NAME} ·`);
  await expect(card.getByRole('link')).toHaveCount(1);
  const name = card.getByText(LONG_NAME, { exact: false });
  const [nameBox, cardBox] = [await name.boundingBox(), await card.boundingBox()];
  expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
  await shoot(page, 'entries', 'phone', { before: focusLink(page, /^Q38 1574 MisCar/) });
});

test('entries: Super only, and a row opens the preview as a full page', async ({ page }) => {
  await openEntries(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('radio', { name: 'Super 3' }).click();
  const cards = page.getByRole('main').getByRole('listitem');
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    await expect(card).toContainText('SUPER');
    await expect(card).toContainText('whole event');
  }
  await expect(page.getByRole('button', { name: /^All 3/ })).toBeVisible();
  await shoot(page, 'entries-super', 'phone');
  await cards.first().getByRole('link').click();
  await expect(page).toHaveURL(/\/entries\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('1690');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('entries: Needs a look shows the refused and the not-in-line-up entries', async ({ page }) => {
  await openEntries(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: /^Needs a look/ }).click();
  await expect(page.getByText('Not in line-up')).toBeVisible();
  // The edit window's refusal says what happened, in one line (SPEC-FINAL 7.6, v1.44): the
  // refused line at both widths, in every theme.
  await expect(page.getByText(REFUSED_LINE)).toBeVisible();
  await expect(page.getByText(/locked/)).toHaveCount(0);
  await shoot(page, 'entries-look');
  // The kind switch counts follow the chip: no super entry needs a look.
  await expect(page.getByRole('radio', { name: 'Super 0' })).toBeVisible();
});

test('entries: search by scouter', async ({ page }) => {
  await openEntries(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('searchbox', { name: 'Search entries' }).fill('Noa');
  // Noa wrote a share of the fixture's entries: the chip's count is the list's length.
  const all = page.getByRole('button', { name: /^All [0-9]+/ });
  await expect(all).toBeVisible();
  const count = Number(/[0-9]+/.exec((await all.textContent()) ?? '')?.[0]);
  expect(count).toBeGreaterThan(0);
  const items = page.getByRole('main').getByRole('listitem');
  await expect(items).toHaveCount(count);
  await expect(items.filter({ hasNotText: 'Noa' })).toHaveCount(0);
  await shoot(page, 'entries-search', 'phone');
});

test('entries: searching "orbit" finds its match and super entries', async ({ page }) => {
  await openEntries(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('searchbox', { name: 'Search entries' }).fill('orbit');
  const items = page.getByRole('main').getByRole('listitem');
  await expect(items.filter({ hasText: 'SUPER' })).toHaveCount(1);
  await expect(items.filter({ hasNotText: 'Orbit' })).toHaveCount(0);
  await shoot(page, 'entries-search-orbit', 'phone');
});

test('entries: an empty device says so and offers Scout a match', async ({ page }) => {
  await setClock(page);
  await signIn(page, 'lead', {
    overrides: {
      'sync/pull': {
        ...FIXTURE.pull,
        entities: { ...FIXTURE.pull.entities, scouting_entries: [] },
      },
    },
  });
  await page.goto('/entries');
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByText('No entries yet')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Scout a match' })).toBeVisible();
  await shoot(page, 'entries-empty', 'phone');
});

test('entries: a failed sync says why above the list (UF.13)', async ({ page }) => {
  // About 14 s alone (a sign-in sync, then a held push); beside the builder specs in a full
  // parallel run it passed 30 s (Phase 1 D client, DEVIATIONS).
  test.slow();
  await setClock(page);
  await signIn(page, 'lead', {
    overrides: {
      ...HOLD_PUSH.overrides,
      'sync/push': { status: 400, code: 'invalid', message: 'Bad Request' },
    },
  });
  // The sign-in sync must finish first (pulled, outbox empty), or the 400 lands on it and the
  // competition never loads.
  await page.waitForLoadState('networkidle');
  await seedOutbox(page);
  await page.goto('/entries');
  const why = "Last try failed: The server refused this device's data · 12:00";
  await expect(page.getByRole('main').getByText(why)).toBeVisible();
  await shoot(page, 'entries-sync-failed');
});
