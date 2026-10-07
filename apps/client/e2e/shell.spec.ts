import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { shoot } from './shoot';

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
  expect(box!.width).toBeLessThanOrEqual(252);
  await shoot(page, 'shell-menu', 'phone');
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
