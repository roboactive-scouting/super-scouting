import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { ENTRIES, FIXTURE } from './fixtures';
import { shoot } from './shoot';

/** A long full name (Q38 1574's scouter): it wraps on a phone, never cut (UF.8). */
const LONG_NAME = 'Amit Ben-David Abramovich-Rosenthal';

/**
 * The server takes nothing, so what is queued stays waiting to send; Amit's name is the long
 * one.
 */
const HOLD_PUSH = {
  overrides: {
    'sync/push': { results: [] },
    'sync/pull': {
      ...FIXTURE.pull,
      entities: {
        ...FIXTURE.pull.entities,
        users: FIXTURE.pull.entities.users.map((u) =>
          u.full_name === 'Amit Ben-David' ? { ...u, full_name: LONG_NAME } : u,
        ),
      },
    },
  },
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
          message: 'this entry is locked — ask a lead',
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

test('entries: newest first, waiting arrows, the refused line', async ({ page }) => {
  // axe walks the whole desktop table (all 209 fixture entries): slower than the default 30 s
  test.slow();
  await openEntries(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('heading', { level: 1, name: 'Entries' })).toBeVisible();
  const rows = page.getByRole('row');
  await expect(rows.nth(1)).toContainText('Q38');
  await expect(page.getByRole('button', { name: /^All \d+/ })).toBeVisible();
  // The refused entry is still in the outbox: the chip says 4, like the top bar (RB.19).
  await expect(page.getByRole('button', { name: /^Waiting to send 4/ })).toBeVisible();
  await expect(page.getByRole('banner').getByText('4 waiting')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Needs a look 2/ })).toBeVisible();
  await expect(page.getByText('Not synced:')).toBeVisible();
  await expect(page.getByLabel('waiting to send')).toHaveCount(3);
  // Rows open nothing yet (the entry preview is a later page): no pointer, no hover tint.
  const first = rows.nth(1);
  await first.hover();
  await expect(first).toHaveCSS('cursor', 'auto');
  await expect(first).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await shoot(page, 'entries', 'desktop');
  // Phone: the long name is whole, on as many lines as it needs.
  await page.setViewportSize({ width: 375, height: 812 });
  const card = page.getByRole('main').getByRole('listitem').filter({ hasText: LONG_NAME }).first();
  await expect(card).toContainText(`${LONG_NAME} ·`);
  await expect(card).toHaveCSS('cursor', 'auto');
  const name = card.getByText(LONG_NAME, { exact: false });
  const [nameBox, cardBox] = [await name.boundingBox(), await card.boundingBox()];
  expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
  await shoot(page, 'entries', 'phone');
});

test('entries: Needs a look shows the refused and the not-in-line-up entries', async ({ page }) => {
  await openEntries(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: /^Needs a look/ }).click();
  await expect(page.getByText('Not in line-up')).toBeVisible();
  await expect(page.getByText('Not synced:')).toBeVisible();
  await shoot(page, 'entries-look', 'phone');
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
