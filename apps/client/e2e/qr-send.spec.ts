import { expect, test, type Page } from '@playwright/test';
import { goOffline, signIn } from './api-mock';
import { ENTRIES, EVENT_ID, FORM, MATCHES, teamId, userByName } from './fixtures';
import { shoot } from './shoot';

/**
 * The QR sender (20-qr-send final, SPEC-FINAL 9.8, task 1.47) and the "shown by QR" mark it
 * leaves on Sync (17-sync final). The scouter's unsynced records are written straight into this
 * device's outbox, sync state and cache, as the entry screen leaves them; the server takes nothing
 * (HOLD_PUSH) and the device goes offline, as at a venue. The real `qrcode` draws the code.
 *
 * The frames move at five a second while the pictures are taken, so each shot holds whichever
 * frame was on screen: the tests read the counter with a pattern, never a fixed frame number.
 */
const HOLD_PUSH = { overrides: { 'sync/push': { results: [] } } };
const YAEL = userByName('yael.s');

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const id = (kind: number, n: number) =>
  `e2e0${kind}000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const NOTES = [
  'Fast cycler, clean intake from the source.',
  'Slow to line up on the reef; dropped two notes in teleop.',
  'Strong defence in the second half.',
  'Climbed high with 8 s left.',
  'Tipped once in auto, recovered.',
];

/**
 * `count` entries by Yael, newest first, then `supers` super entries. With 12 and 1 they are the
 * design's "12 entries · 1 super entry", over Q28–Q39.
 */
function operations(count: number, supers = 0) {
  const ops = [];
  for (let k = 0; k < count; k += 1) {
    const number = count <= 12 ? 28 + k : (k % 40) + 1;
    const match = MATCHES[number - 1]!;
    const slot = match.slots[Math.floor(k / 40) % match.slots.length]!;
    const saved = ago(2 + (count - k) * 3);
    const rowId = id(1, k);
    ops.push({
      op_id: id(2, k),
      entity: 'scouting_entry',
      row_id: rowId,
      action: 'create',
      base_version: null,
      payload: {
        id: rowId,
        form_version_id: FORM.version_id,
        form_kind: 'match',
        event_id: EVENT_ID,
        match_id: match.id,
        team_id: slot.team_id,
        alliance: slot.alliance,
        scouter_id: YAEL.id,
        robot_status: 'played',
        breakdown_seconds: null,
        data: { ...ENTRIES[k % ENTRIES.length]!.data, notes: NOTES[k % NOTES.length] },
      },
      author_user_id: YAEL.id,
      client_created_at: saved,
      client_updated_at: saved,
      seq: k + 1,
    });
  }
  for (let k = 0; k < supers; k += 1) {
    const rowId = id(3, k);
    const saved = ago(1 + k);
    ops.push({
      op_id: id(4, k),
      entity: 'scouting_entry',
      row_id: rowId,
      action: 'create',
      base_version: null,
      payload: {
        id: rowId,
        form_version_id: FORM.version_id,
        form_kind: 'super',
        event_id: EVENT_ID,
        match_id: null,
        team_id: teamId(1690),
        alliance: null,
        scouter_id: YAEL.id,
        robot_status: null,
        breakdown_seconds: null,
        data: { notes: 'Best driver at the event; smooth handoffs.' },
      },
      author_user_id: YAEL.id,
      client_created_at: saved,
      client_updated_at: saved,
      seq: count + k + 1,
    });
  }
  return ops;
}

async function seed(page: Page, ops: ReturnType<typeof operations>) {
  const rows = ops.map((op) => ({
    ...op.payload,
    entity: 'scouting_entries',
    version: 1,
    client_created_at: op.client_created_at,
    client_updated_at: op.client_updated_at,
    deleted_at: null,
  }));
  const states = ops.map((op) => ({
    row_id: op.row_id,
    sync_state: 'pending',
    acked_at: null,
    origin: 'local',
  }));
  await page.evaluate(
    async ({ ops, rows, states }) => {
      const db = await new Promise<IDBDatabase>((done, fail) => {
        const open = indexedDB.open('robactive-scouting');
        open.onsuccess = () => done(open.result);
        open.onerror = () => fail(open.error);
      });
      const tx = db.transaction(['outbox', 'rows', 'syncState'], 'readwrite');
      for (const op of ops) tx.objectStore('outbox').put(op);
      for (const row of rows) tx.objectStore('rows').put(row);
      for (const state of states) tx.objectStore('syncState').put(state);
      await new Promise((done) => (tx.oncomplete = done));
      db.close();
    },
    { ops, rows, states },
  );
}

/** Signed in as Yael with `ops` waiting on this device, offline, on /sync. */
async function openSync(page: Page, ops: ReturnType<typeof operations>) {
  await signIn(page, 'scouter', HOLD_PUSH);
  await page.waitForLoadState('networkidle');
  await seed(page, ops);
  await page.goto('/sync');
  await expect(page.getByRole('heading', { name: 'Sync', level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await goOffline(page);
}

/** Sync's More → Send by QR: the menu on a computer (the default 1280 px viewport). */
async function openSender(page: Page) {
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: /Send by QR/ }).click();
  await expect(page).toHaveURL(/\/sync\/qr\/send$/);
  return page.getByRole('dialog', { name: 'Send by QR' });
}

const counter = (page: Page) => page.getByRole('dialog').getByRole('status');

test('qr send: the moving code, looping by itself, over Sync on a computer', async ({ page }) => {
  test.slow();
  await openSync(page, operations(12, 1));
  const sender = await openSender(page);
  await expect(sender).toContainText('To the collector tablet. No internet needed.');
  await expect(sender).toContainText('12 entries · 1 super entry');
  await expect(sender).toContainText(/Q28–Q39 · saved before \d\d:\d\d/);
  await expect(counter(page)).toHaveText(/^Frame \d+ of \d+$/);
  await expect(sender.getByRole('button', { name: 'Done — back to Sync' })).toBeVisible();
  await expect(sender.getByRole('button', { name: /next batch/i })).toHaveCount(0);
  // The code is drawn: a version-40 canvas, black on white.
  const drawn = await sender
    .getByRole('img', { name: /QR code/ })
    .evaluate((c: HTMLCanvasElement) => c.width > 177 && c.width === c.height);
  expect(drawn).toBe(true);

  await shoot(page, 'qr-send');

  // The phone: a full-screen page, no top or bottom bar.
  await expect(page.getByRole('dialog', { name: 'Send by QR' })).toContainText(
    'Hold the phone still, about 20 cm from the tablet’s camera.',
  );
  await expect(page.getByRole('dialog')).toContainText('loops by itself');
});

test('qr send: above 200 records, batch 1 of 2, then Next batch and the last batch', async ({
  page,
}) => {
  test.slow();
  await openSync(page, operations(205));
  const sender = await openSender(page);
  await expect(sender).toContainText('Batch 1 of 2');
  await expect(sender).toContainText('200 of 205 records');
  await expect(sender.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
  await shoot(page, 'qr-send-batch');

  await page.getByRole('button', { name: /next batch/i }).click();
  await expect(page.getByRole('dialog')).toContainText('Batch 2 of 2');
  await expect(page.getByRole('dialog')).toContainText('the last 5 records');
  await expect(counter(page)).toHaveText(/^Frame 1 of 1$/);
  await expect(page.getByRole('button', { name: /next batch/i })).toHaveCount(0);
  await shoot(page, 'qr-send-last-batch');
});

test('qr send: nothing waiting says so, with Back to Sync', async ({ page }) => {
  await openSync(page, []);
  const sender = await openSender(page);
  await expect(sender).toContainText('Nothing to send');
  await expect(sender).toContainText('Everything on this device has already reached the cloud.');
  await expect(sender.getByRole('img', { name: /QR code/ })).toHaveCount(0);
  await shoot(page, 'qr-send-empty');
  // The phone says "this phone".
  await expect(page.getByRole('dialog')).toContainText(
    'Everything on this phone has already reached the cloud.',
  );
  await page.getByRole('button', { name: 'Back to Sync' }).click();
  await expect(page).toHaveURL(/\/sync$/);
});

test('qr send: Done goes back to Sync, where each record shown says "shown by QR", still waiting', async ({
  page,
}) => {
  test.slow();
  await openSync(page, operations(4, 1));
  await expect(page.getByRole('tab', { name: /^Waiting\s*5$/ })).toBeVisible();
  await openSender(page);
  await expect(counter(page)).toHaveText(/^Frame \d+ of \d+$/);
  await page.getByRole('button', { name: 'Done — back to Sync' }).click();
  await expect(page).toHaveURL(/\/sync$/);
  // Nothing was marked sent: the same five wait, each with the mark.
  await expect(page.getByRole('tab', { name: /^Waiting\s*5$/ })).toBeVisible();
  await expect(
    page.locator('[data-record]').filter({ hasText: /shown by QR \d\d:\d\d/ }),
  ).toHaveCount(5);
  await expect(
    page.getByRole('banner').getByRole('link', { name: /5 waiting to send/ }),
  ).toBeVisible();
  await shoot(page, 'sync-shown-by-qr');
  await expect(page.locator('[data-record]').first()).toContainText(/shown by QR \d\d:\d\d/);
});

test('qr send: Escape closes it on a computer', async ({ page }) => {
  await openSync(page, operations(2));
  await openSender(page);
  await expect(counter(page)).toHaveText(/^Frame \d+ of \d+$/);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/sync$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
