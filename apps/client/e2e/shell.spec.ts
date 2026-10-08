import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type Route } from '@playwright/test';
import { goOffline, signIn } from './api-mock';
import { shoot } from './shoot';
import { touchDrag } from './touch';

/** The server takes nothing, so what is queued stays waiting to send. */
const HOLD_PUSH = { overrides: { 'sync/push': { results: [] } } };

/** `n` entry operations in this device's outbox, then a reload so the shell reads them. */
async function seedWaiting(page: Page, n: number) {
  await page.evaluate(async (count) => {
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const open = indexedDB.open('robactive-scouting');
      open.onsuccess = () => done(open.result);
      open.onerror = () => fail(open.error);
    });
    const tx = db.transaction('outbox', 'readwrite');
    for (let i = 0; i < count; i++) {
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
  }, n);
  await page.reload();
}

test('phone shell: bars, menu, and no Users on a phone', async ({ page }) => {
  await signIn(page, 'admin', HOLD_PUSH);
  await page.setViewportSize({ width: 375, height: 812 });
  await seedWaiting(page, 3);
  await expect(page.getByRole('link', { name: 'Entries, 3 waiting to send' })).toBeVisible();
  await expect(page.getByRole('banner').getByText('3 waiting')).toBeVisible();
  await shoot(page, 'shell-home', 'phone');
  await page.getByRole('button', { name: 'Open the menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu.getByRole('link', { name: 'Matches' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Users' })).toHaveCount(0);
  await expect(menu.getByText('3 waiting to send')).toBeVisible();
  const box = await menu.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(252.5);
  await shoot(page, 'shell-menu', 'phone');
});

test('phone bar: the current page is the raised button; elsewhere nothing is (UF.10)', async ({
  page,
}) => {
  await signIn(page, 'admin', HOLD_PUSH);
  await page.setViewportSize({ width: 375, height: 812 });
  await seedWaiting(page, 3);
  const bar = page.getByRole('navigation', { name: 'Main' });
  const raised = bar.locator('[data-raised]');
  const current = bar.locator('[aria-current="page"]');
  for (const [name, link, shot] of [
    ['Home', 'Home', 'shell-bar-home'],
    ['Scout', 'Scout', 'shell-bar-scout'],
    ['Entries', 'Entries, 3 waiting to send', 'shell-bar-entries'],
  ] as const) {
    await bar.getByRole('link', { name: link }).click();
    if (name === 'Scout') {
      // A fresh device asks for its station first (02-scout).
      const sheet = page.getByRole('dialog', { name: 'Choose your station' });
      await sheet.getByRole('button', { name: 'Blue 2', exact: true }).click();
      await sheet.getByRole('button', { name: 'Use Blue 2' }).click();
      await expect(sheet).toBeHidden();
    }
    await expect(raised).toHaveCount(1);
    await expect(current).toHaveAccessibleName(link);
    await expect(current.locator('[data-raised]')).toHaveCount(1);
    await shoot(page, shot, 'phone');
  }
  await page.getByRole('button', { name: 'Open the menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByText('Switch scouter').click();
  await expect(page.getByRole('banner').getByText('Switch scouter')).toBeVisible();
  await expect(raised).toHaveCount(0);
  await expect(current).toHaveCount(0);
  await expect(bar.getByRole('link')).toHaveText(['Home', 'Scout', /^Entries/]);
  await shoot(page, 'shell-bar-other', 'phone');
});

test('phone menu: a swipe left closes it; a swipe right or down does not (UF.4)', async ({
  page,
}) => {
  await signIn(page, 'admin', HOLD_PUSH);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Open the menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  const sync = menu.getByText(/All sent|waiting to send|Syncing|Offline/).first();
  await expect(sync).toBeVisible();
  await touchDrag(page, sync, { dx: 80 });
  await touchDrag(page, sync, { dy: 120 });
  await expect(menu).toBeVisible();
  await touchDrag(page, sync, { dx: -160 });
  await expect(menu).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
});

test('desktop account menu', async ({ page }) => {
  await signIn(page, 'lead', HOLD_PUSH);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedWaiting(page, 3);
  await expect(page.getByText('3 waiting to send')).toBeVisible();
  await page.getByRole('button', { name: /Noa Levi/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Change password' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Change password' }).hover();
  await shoot(page, 'shell-account-menu', 'desktop');
});

test('sync indicator: syncing, then offline, keeping the count (SPEC-FINAL 9.10)', async ({
  page,
}) => {
  await signIn(page, 'admin', HOLD_PUSH);
  await page.setViewportSize({ width: 375, height: 812 });
  await seedWaiting(page, 3);
  const bar = page.getByRole('banner');
  await expect(bar.getByText('3 waiting')).toBeVisible();

  // Hold the next push open, then start a sync: the pill says so while it runs.
  const held: Route[] = [];
  await page.route('http://api.test/sync/push', (route) =>
    route.request().method() === 'POST' ? void held.push(route) : route.fallback(),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(bar.getByText('Syncing · 3')).toBeVisible();
  // `shoot` waits for network idle, which a held request never reaches: a plain picture.
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: fileURLToPath(new URL('./__screens__/shell-syncing-phone.png', import.meta.url)),
  });
  await page.getByRole('button', { name: 'Open the menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu.getByText('Syncing · 3 waiting to send')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.unroute('http://api.test/sync/push');
  for (const route of held) await route.fallback();
  await expect(bar.getByText('3 waiting')).toBeVisible();

  await goOffline(page);
  await expect(bar.getByText('Offline · 3')).toBeVisible();
  await shoot(page, 'shell-offline');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Open the menu' }).click();
  await expect(menu.getByText('Offline · 3 waiting to send')).toBeVisible();
  await shoot(page, 'shell-offline-menu', 'phone');
});
