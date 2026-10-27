import { expect, test, type Locator, type Page } from '@playwright/test';
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

  // 5 · Wipe is held while entries wait: Keep this device, and no wipe button (Phase 1 I side
  // task 3: the held line's Wipe anyway… is the one wipe).
  await page.getByRole('button', { name: /^Wipe this device/ }).click();
  const wipe = page.getByRole('dialog', { name: 'Wipe this device?' });
  await expect(
    wipe.getByText(
      '3 entries are still waiting to send. Wipe is held until they are sent, so nothing is lost.',
    ),
  ).toBeVisible();
  await expect(wipe.getByRole('button', { name: 'Wipe this device' })).toHaveCount(0);
  await shoot(page, 'settings-wipe-held');
  await wipe.getByRole('button', { name: 'Keep this device' }).click();
  await expect(wipe).toBeHidden();
});

type ActionRow = {
  labels: string[];
  left: number;
  right: number;
  lastRight: number;
  buttons: { width: number; height: number }[];
};

/** The boxes of a surface's action rows (SurfaceActions, Phase 1 I side task 3), in order. */
function actionRows(surface: Locator): Promise<ActionRow[]> {
  return surface.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>('[data-surface-actions]')].map((row) => {
      const box = row.getBoundingClientRect();
      const kids = [...row.children].map((c) => c.getBoundingClientRect());
      return {
        labels: [...row.children].map((c) => (c.textContent ?? '').trim()),
        left: Math.round(box.left),
        right: Math.round(box.right),
        lastRight: Math.round(kids.at(-1)!.right),
        buttons: kids.map((k) => ({ width: k.width, height: k.height })),
      };
    }),
  );
}

/** Every action in the rows is this many px tall (52 on a phone, 44 on a computer). */
function expectOneSize(rows: ActionRow[], height: number) {
  for (const b of rows.flatMap((r) => r.buttons)) expect(Math.round(b.height)).toBe(height);
}

/** One record in the discarded-records log (SPEC-FINAL 9.7), which a wipe keeps. */
async function seedDiscarded(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const open = indexedDB.open('robactive-scouting');
      open.onsuccess = () => done(open.result);
      open.onerror = () => fail(open.error);
    });
    const tx = db.transaction('discarded', 'readwrite');
    tx.objectStore('discarded').put({
      id: 'e2e-discarded-1',
      discarded_at: '2026-10-07T11:40:00.000Z',
      reason: 'an admin deleted the competition, season or form it belonged to',
      row_id: 'e2e-row-d',
      event_id: 'e2e-event-old',
      event_name: 'District #1 · Haifa',
      summary: {
        form_kind: 'match',
        match: 'Q12',
        match_type: 'qualification',
        match_number: 12,
        alliance: 'red',
        station: 'R2',
        team: '2096 ROBACTIVE',
        team_number: 2096,
        team_name: 'ROBACTIVE',
        robot_status: 'played',
        scouter: 'Noa Levi',
        scouter_id: null,
        client_updated_at: '2026-10-07T09:00:00.000Z',
      },
    });
    await new Promise((done) => (tx.oncomplete = done));
    db.close();
  });
}

/** How many records each store holds, read straight from IndexedDB. */
async function storeCounts(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const open = indexedDB.open('robactive-scouting');
      open.onsuccess = () => done(open.result);
      open.onerror = () => fail(open.error);
    });
    const names = ['rows', 'outbox', 'syncState', 'drafts', 'discarded'] as const;
    const tx = db.transaction([...names], 'readonly');
    const counts = await Promise.all(
      names.map(
        (name) =>
          new Promise<number>((done) => {
            const req = tx.objectStore(name).count();
            req.onsuccess = () => done(req.result);
          }),
      ),
    );
    db.close();
    return Object.fromEntries(names.map((name, i) => [name, counts[i]]));
  });
}

/**
 * The wipe with nothing waiting (task 1.49; 16-settings final, "not drawn"): the lead's code and
 * the typed phrase before the filled-ink button enables; a wrong code says so and wipes nothing;
 * the right one empties the device, keeps the discarded log and signs out.
 */
test('settings: the wipe asks for the lead’s code, refuses a wrong one, then wipes and signs out', async ({
  page,
}) => {
  test.slow();
  await signIn(page, 'lead');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/settings');
  await seedDiscarded(page);
  await expect(
    page.getByRole('button', { name: /Wipe this device\s*removes everything this app keeps here/ }),
  ).toBeVisible();
  // The first pull may still be landing: wait for the device's rows before counting them.
  await expect.poll(async () => (await storeCounts(page)).rows).toBeGreaterThan(0);
  const before = await storeCounts(page);

  await page.getByRole('button', { name: /^Wipe this device/ }).click();
  const wipe = page.getByRole('dialog', { name: 'Wipe this device?' });
  const code = wipe.getByLabel('Lead’s code');
  const phrase = wipe.getByRole('textbox', { name: 'Type wipe this device to confirm' });
  const confirm = wipe.getByRole('button', { name: 'Wipe this device' });
  await expect(code).toBeVisible();
  await expect(confirm).toHaveAttribute('aria-disabled', 'true');
  const fill = async (value: string) => {
    await code.fill(value);
    await phrase.fill('wipe this device');
  };

  // Allowed: the code and the phrase in, the filled-ink button on.
  await fill('WIPE2096');
  await expect(confirm).not.toHaveAttribute('aria-disabled');
  await shoot(page, 'settings-wipe-allowed', undefined, { before: () => fill('WIPE2096') });

  // A wrong code: said under the field, nothing wiped.
  await fill('WIPE2069');
  await confirm.click();
  await expect(wipe.getByRole('alert')).toHaveText(
    'That is not the lead’s code. Nothing was wiped.',
  );
  expect(await storeCounts(page)).toEqual(before);
  await shoot(page, 'settings-wipe-wrong-code', undefined, {
    before: async () => {
      if (await wipe.getByRole('alert').isVisible()) return;
      await fill('WIPE2069');
      await confirm.click();
      await expect(wipe.getByRole('alert')).toBeVisible();
    },
  });

  // The right code: everything goes but the discarded log, and the device signs out.
  await fill('WIPE2096');
  await confirm.click();
  await page.waitForURL('/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  expect(await storeCounts(page)).toEqual({
    rows: 0,
    outbox: 0,
    syncState: 0,
    drafts: 0,
    discarded: 1,
  });
});

/**
 * Wipe anyway (SPEC-FINAL 9.9 v1.39; Phase 1 H side task 2): while held, the sheet offers Send
 * by QR first and Wipe anyway…; the second confirmation asks for the lead's code and the typed
 * count; a wrong count is refused (removing nothing); the right one logs each lost record and
 * wipes the device.
 */
test('settings: Wipe anyway, from the held wipe, logs each lost record then wipes', async ({
  page,
}) => {
  test.slow();
  await signIn(page, 'lead', HOLD_PUSH);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/settings');
  await seedWaiting(page, 3);
  const openWipe = async () => {
    await page.getByRole('button', { name: /^Wipe this device/ }).click();
    return page.getByRole('dialog', { name: 'Wipe this device?' });
  };

  // Send by QR first opens the sender.
  let wipe = await openWipe();
  await wipe.getByRole('link', { name: 'Send by QR first' }).click();
  await expect(page).toHaveURL(/\/sync\/qr\/send$/);
  await expect(page.getByRole('dialog', { name: 'Send by QR' })).toBeVisible();

  // The held sheet: the held line, then the two ways out; the normal wipe is not drawn, so the
  // footer is Keep this device alone (Phase 1 I side task 3).
  await page.goto('/settings');
  wipe = await openWipe();
  await expect(wipe.getByRole('link', { name: 'Send by QR first' })).toBeVisible();
  await expect(wipe.getByRole('button', { name: 'Wipe anyway…' })).toBeVisible();
  await expect(wipe.getByRole('button', { name: 'Wipe this device' })).toHaveCount(0);
  // One size and one edge for every action (side task 3): on a phone both rows run edge to edge
  // of the same box; on a computer they end at the same right edge. Every button one height.
  const phoneRows = await actionRows(wipe);
  expect(phoneRows.map((r) => r.labels)).toEqual([
    ['Send by QR first', 'Wipe anyway…'],
    ['Keep this device'],
  ]);
  expectOneSize(phoneRows, 52);
  expect(phoneRows[1]!.left).toBe(phoneRows[0]!.left);
  expect(phoneRows[1]!.right).toBe(phoneRows[0]!.right);
  // Equal widths in the two-button row.
  const [qr, anywayBox] = phoneRows[0]!.buttons;
  expect(Math.abs(qr!.width - anywayBox!.width)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopRows = await actionRows(page.getByRole('dialog', { name: 'Wipe this device?' }));
  expectOneSize(desktopRows, 44);
  expect(desktopRows[1]!.lastRight).toBe(desktopRows[0]!.lastRight);
  await page.setViewportSize({ width: 375, height: 812 });
  await shoot(page, 'settings-wipe-anyway-held');

  // The second confirmation: the loss, the code, the count typed; Keep this device first.
  await wipe.getByRole('button', { name: 'Wipe anyway…' }).click();
  const anyway = page.getByRole('dialog', { name: 'Wipe anyway?' });
  await expect(anyway).toContainText(
    '3 records have not reached the cloud. Wiping now deletes them for good.',
  );
  const code = anyway.getByLabel('Lead’s code');
  const count = anyway.getByRole('textbox', { name: 'Type 3 to confirm' });
  const confirm = anyway.getByRole('button', { name: 'Wipe anyway' });
  await expect(confirm).toHaveAttribute('aria-disabled', 'true');
  await code.fill('WIPE2096');
  await count.fill('2');
  await expect(confirm).toHaveAttribute('aria-disabled', 'true');
  const fill = async () => {
    await code.fill('WIPE2096');
    await count.fill('3');
  };
  await fill();
  await expect(confirm).not.toHaveAttribute('aria-disabled');
  // Keep this device and Wipe anyway: one height, sharing the row (side task 3).
  expectOneSize(await actionRows(anyway), 52);
  await page.setViewportSize({ width: 1440, height: 900 });
  expectOneSize(await actionRows(anyway), 44);
  await page.setViewportSize({ width: 375, height: 812 });
  await shoot(page, 'settings-wipe-anyway-confirm', undefined, { before: fill });

  // A wrong code: nothing removed, nothing logged.
  const before = await storeCounts(page);
  await code.fill('WIPE2069');
  await confirm.click();
  await expect(anyway.getByRole('alert')).toHaveText(
    'That is not the lead’s code. Nothing was wiped.',
  );
  expect(await storeCounts(page)).toEqual(before);

  // The right code and count: one log row per lost record, and the device is empty.
  await fill();
  await confirm.click();
  await page.waitForURL('/login');
  expect(await storeCounts(page)).toEqual({
    rows: 0,
    outbox: 0,
    syncState: 0,
    drafts: 0,
    discarded: 3,
  });
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
