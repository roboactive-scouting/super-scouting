import { expect, test, type Page } from '@playwright/test';
import { goOffline, signIn } from './api-mock';
import { FIXTURE, TEST_PASSWORD, userByName } from './fixtures';
import { shoot } from './shoot';

/** The server takes nothing, so what is queued stays waiting to send. */
const HOLD_PUSH = { overrides: { 'sync/push': { results: [] } } };

/** `n` of Noa's entries in the outbox and station Blue 2 on the device, then a reload. */
async function seedDevice(page: Page, n: number) {
  const noa = userByName('noa.levi').id;
  await page.evaluate(
    async ({ count, author }) => {
      const db = await new Promise<IDBDatabase>((done, fail) => {
        const open = indexedDB.open('robactive-scouting');
        open.onsuccess = () => done(open.result);
        open.onerror = () => fail(open.error);
      });
      const tx = db.transaction(['outbox', 'meta'], 'readwrite');
      for (let i = 0; i < count; i++) {
        tx.objectStore('outbox').put({
          op_id: `e2e-op-${i}`,
          entity: 'scouting_entry',
          row_id: `e2e-row-${i}`,
          action: 'create',
          base_version: null,
          payload: {},
          author_user_id: author,
          client_created_at: '2026-10-07T09:00:00.000Z',
          client_updated_at: '2026-10-07T09:00:00.000Z',
          seq: i + 1,
        });
      }
      tx.objectStore('meta').put({ key: 'scout.station', value: 'B2' });
      await new Promise((done) => (tx.oncomplete = done));
      db.close();
    },
    { count: n, author: noa },
  );
  await page.reload();
}

/** Into the page the way a person gets there: the account menu (the app must not reload offline). */
async function openSwitch(page: Page) {
  await page.getByRole('button', { name: /Noa Levi/ }).click();
  await page.getByRole('menuitem', { name: 'Switch scouter' }).click();
  await expect(page.getByRole('heading', { name: 'Switch scouter' })).toBeVisible();
}

test('switch scouter: nobody chosen, then someone chosen', async ({ page }) => {
  await signIn(page, 'lead', HOLD_PUSH);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedDevice(page, 3);
  await openSwitch(page);
  await expect(page.getByText('Scouting now')).toBeVisible();
  await expect(page.getByText('Stays on this device')).toHaveCount(0);
  await shoot(page, 'switch', 'phone');

  await page.getByLabel("Who's scouting next?").selectOption({ label: 'Amit Ben-David · amit.bd' });
  await expect(page.getByLabel('Password for Amit Ben-David')).toBeFocused();
  await page.getByLabel('Password for Amit Ben-David').fill('12345');
  await expect(page.getByText('Stays on this device:')).toBeVisible();
  await expect(page.getByText('Blue 2')).toBeVisible();
  await shoot(page, 'switch-chosen');
});

test('switch scouter: a wrong password offline is cleared and keeps the focus', async ({
  page,
}) => {
  await signIn(page, 'lead', HOLD_PUSH);
  await page.setViewportSize({ width: 375, height: 812 });
  await seedDevice(page, 3);
  await openSwitchOnPhone(page);
  await goOffline(page);
  await page.getByLabel("Who's scouting next?").selectOption({ label: 'Amit Ben-David · amit.bd' });
  const password = page.getByLabel('Password for Amit Ben-David');
  await password.fill(`${TEST_PASSWORD}-wrong`);
  await page.getByRole('button', { name: 'Switch scouter' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'That username and password do not match.',
  );
  await expect(password).toHaveValue('');
  await expect(password).toBeFocused();
  await shoot(page, 'switch-error', 'phone');
});

async function openSwitchOnPhone(page: Page) {
  await page.getByRole('button', { name: 'Open the menu' }).click();
  await page
    .getByRole('dialog', { name: 'Menu' })
    .getByRole('link', { name: 'Switch scouter' })
    .click();
  await expect(page.getByRole('heading', { name: 'Switch scouter' })).toBeVisible();
}

test('switch scouter: a device with no accounts loaded says so', async ({ page }) => {
  await signIn(page, 'lead', {
    overrides: {
      'sync/pull': { ...FIXTURE.pull, entities: { ...FIXTURE.pull.entities, users: [] } },
    },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSwitch(page);
  await expect(page.getByText("This device has not loaded the team's accounts yet.")).toBeVisible();
  await expect(page.getByLabel("Who's scouting next?")).toHaveCount(0);
  await shoot(page, 'switch-noaccounts');
});
