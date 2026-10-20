import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { shoot } from './shoot';

/** The server takes nothing, so what is queued stays waiting to send. */
const HOLD_PUSH = { overrides: { 'sync/push': { results: [] } } };

/** `n` entry operations in this device's outbox (with their sync state), then a reload. */
async function seedWaiting(page: Page, n: number) {
  await page.evaluate(async (count) => {
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const open = indexedDB.open('robactive-scouting');
      open.onsuccess = () => done(open.result);
      open.onerror = () => fail(open.error);
    });
    const tx = db.transaction(['outbox', 'syncState'], 'readwrite');
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
      tx.objectStore('syncState').put({
        row_id: `e2e-row-${i}`,
        sync_state: 'pending',
        acked_at: null,
        origin: 'local',
      });
    }
    await new Promise((done) => (tx.oncomplete = done));
    db.close();
  }, n);
  await page.reload();
}

/** Opens Theme and picks `name` ("Light" / "Outdoor") through the app, then Done. */
async function pickTheme(page: Page, name: 'Light' | 'Outdoor') {
  await page.getByRole('button', { name: /^Theme/ }).click();
  const choice = page.getByRole('dialog', { name: 'Theme' });
  await choice.getByText(name, { exact: true }).click();
  await choice.getByRole('button', { name: 'Done' }).click();
  await expect(choice).toBeHidden();
}

/**
 * Settings (16-settings final): the rows, the Theme and Text size choices with their live
 * example, the app in Outdoor, and Wipe held while entries wait. Noa Levi (a scout lead) is the
 * design's user; 3 entries wait to send.
 */
test('settings: rows, theme and text size choices, outdoor, wipe held', async ({ page }) => {
  test.slow();
  await signIn(page, 'lead', HOLD_PUSH);
  await page.setViewportSize({ width: 375, height: 812 });
  await seedWaiting(page, 3);

  // The way in: the phone menu's "This device" group.
  await page.getByRole('button', { name: 'Open the menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu.getByRole('list', { name: 'This device' })).toBeVisible();
  await menu.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(page.getByText('Noa Levi · Scout lead')).toBeVisible();
  await expect(page.getByText('District #3 · Tel Aviv ·', { exact: false })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Wipe this device\s*held: 3 entries waiting to send/ }),
  ).toBeVisible();

  // 1 · the rows with their values, in Light; 4 · the whole app in Outdoor, chosen in the app.
  await shoot(page, 'settings', undefined, { themes: ['light'] });
  await pickTheme(page, 'Outdoor');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'outdoor');
  await expect(page.getByRole('button', { name: /^Theme\s*Outdoor/ })).toBeVisible();
  await shoot(page, 'settings', undefined, { themes: ['outdoor'] });
  // Saved on this device: still Outdoor after a reload, from the first paint.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'outdoor');
  await pickTheme(page, 'Light');

  // 2 · Theme: the live example, then a picture of each, in the theme being picked.
  await page.getByRole('button', { name: /^Theme/ }).click();
  const themeChoice = page.getByRole('dialog', { name: 'Theme' });
  await expect(
    themeChoice.getByRole('button', { name: 'Pieces scored high plus one' }),
  ).toBeVisible();
  await shoot(page, 'settings-theme', undefined, { themes: ['light'] });
  await themeChoice.getByText('Outdoor', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'outdoor');
  await shoot(page, 'settings-theme', undefined, { themes: ['outdoor'] });
  await themeChoice.getByText('Light', { exact: true }).click();
  await themeChoice.getByRole('button', { name: 'Done' }).click();

  // 3 · Text size: the example grows as a step is picked; the whole app with it.
  await page.getByRole('button', { name: /^Text size/ }).click();
  const sizeChoice = page.getByRole('dialog', { name: 'Text size' });
  await sizeChoice.getByRole('radio', { name: '130%' }).click();
  await expect(page.locator('html')).toHaveCSS('font-size', '20.8px');
  await shoot(page, 'settings-text-size');
  await sizeChoice.getByRole('radio', { name: '150%' }).click();
  await expect(page.locator('html')).toHaveCSS('font-size', '24px');
  await shoot(page, 'settings-text-size-150');
  await sizeChoice.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /^Text size\s*150%/ })).toBeVisible();
  await shoot(page, 'settings-150', undefined, { long: true });
  await page.getByRole('button', { name: /^Text size/ }).click();
  await sizeChoice.getByRole('radio', { name: '100%' }).click();
  await sizeChoice.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('html')).toHaveCSS('font-size', '16px');

  // 5 · Wipe is held while entries wait: Keep this device first, the wipe button disabled.
  await page.getByRole('button', { name: /^Wipe this device/ }).click();
  const wipe = page.getByRole('dialog', { name: 'Wipe this device?' });
  await expect(
    wipe.getByText(
      '3 entries are still waiting to send. Wipe is held until they are sent, so nothing is lost.',
    ),
  ).toBeVisible();
  await expect(wipe.getByRole('button', { name: 'Wipe this device' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await shoot(page, 'settings-wipe-held');
  await wipe.getByRole('button', { name: 'Keep this device' }).click();
  await expect(wipe).toBeHidden();
});

test('settings: on a computer it is in the sidebar under This device', async ({ page }) => {
  await signIn(page, 'scouter');
  await page.setViewportSize({ width: 1440, height: 900 });
  const sidebar = page.getByRole('list', { name: 'This device' });
  await sidebar.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Wipe this device\s*removes everything this app keeps here/ }),
  ).toBeVisible();
});

test('settings: Vibrate on taps is held where the phone cannot vibrate (iOS)', async ({ page }) => {
  // iOS Safari has no navigator.vibrate: take Chrome's away before the app loads.
  await page.addInitScript(() => {
    delete (Navigator.prototype as { vibrate?: unknown }).vibrate;
  });
  await signIn(page, 'lead');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/settings');
  const vibrate = page.getByRole('switch', { name: /Vibrate on taps/ });
  await expect(vibrate).toBeDisabled();
  await expect(vibrate).not.toBeChecked();
  await expect(page.getByText('this phone can’t vibrate')).toBeVisible();
  await shoot(page, 'settings-no-vibrate');
});
