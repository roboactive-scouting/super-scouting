import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { shoot } from './shoot';

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
