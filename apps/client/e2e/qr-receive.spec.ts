import { expect, test, type Page } from '@playwright/test';
import { encodeBatch, frameToText } from '@frc/shared/qr';
import { goOffline, signIn } from './api-mock';
import { ENTRIES, EVENT_ID, FORM, MATCHES, teamId, userByName } from './fixtures';
import { shoot } from './shoot';

/**
 * The QR receiver (21-qr-receive final, SPEC-FINAL 9.8, task 1.48) on the collector tablet, and
 * what it leaves on Sync (17-sync final, phone image 6). CI has no camera: the e2e build swaps
 * `@zxing/browser` for `e2e/stubs/zxing-browser.ts` (vite.config.ts, E2E_QR_CAMERA), and these
 * tests hand the page real frames — `encodeBatch`'s, as the sender draws them — through
 * `window.__qrCamera.show`. Everything after the camera is the shipped code.
 */
const YAEL = userByName('yael.s');
const OMER = userByName('omer.k');
const AMIT = userByName('amit.bd');

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const id = (kind: number, n: number) =>
  `e2e0${kind}000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A cycle path as the entry map records it: many points, which is what makes a batch frames. */
const path = () =>
  Array.from({ length: 95 }, () => ({
    x: Math.round(Math.random() * 10_000) / 10_000,
    y: Math.round(Math.random() * 10_000) / 10_000,
    t: Math.round(Math.random() * 150_000),
  }));

/** `count` entries by `author` over Q28 onwards, then `supers` super entries. */
function operations(author: { id: string }, base: number, count: number, supers = 0) {
  const ops = [];
  for (let k = 0; k < count + supers; k += 1) {
    const isSuper = k >= count;
    const match = MATCHES[27 + (k % 12)]!;
    const slot = match.slots[(base + k) % match.slots.length]!;
    const saved = ago(3 + (count - k) * 3);
    const rowId = id(1, base + k);
    ops.push({
      op_id: id(2, base + k),
      entity: 'scouting_entry' as const,
      row_id: rowId,
      action: 'create' as const,
      base_version: null,
      payload: {
        id: rowId,
        form_version_id: FORM.version_id,
        form_kind: isSuper ? 'super' : 'match',
        event_id: EVENT_ID,
        match_id: isSuper ? null : match.id,
        team_id: isSuper ? teamId(1690) : slot.team_id,
        alliance: isSuper ? null : slot.alliance,
        scouter_id: author.id,
        robot_status: isSuper ? null : 'played',
        breakdown_seconds: null,
        data: isSuper
          ? { notes: 'Best driver at the event; smooth handoffs.' }
          : { ...ENTRIES[k % ENTRIES.length]!.data, auto_path: path(), teleop_path: path() },
      },
      author_user_id: author.id,
      client_created_at: saved,
      client_updated_at: saved,
      seq: k + 1,
    });
  }
  return ops;
}

/** Yael's 12 entries and 1 super entry: the design's "13 records · 12 entries, 1 super". */
const YAEL_BATCH = () => encodeBatch(operations(YAEL, 0, 12, 1), 0x5eed0001);

/** The camera reads one frame: its Base45 text, as the sender draws it. */
async function show(page: Page, frame: Uint8Array) {
  await page.waitForFunction(
    () => (window as { __qrCamera?: { running?: boolean } }).__qrCamera?.running,
  );
  await page.evaluate((data) => {
    (window as unknown as { __qrCamera: { show: (b: string) => void } }).__qrCamera.show(data);
  }, frameToText(frame));
}

const HOLD_PUSH = { overrides: { 'sync/push': { results: [] } } };

/** The lead on the collector tablet, offline as at the venue, on Sync. */
async function openSync(page: Page, opts: Parameters<typeof signIn>[2] = HOLD_PUSH) {
  await signIn(page, 'lead', opts);
  await page.waitForLoadState('networkidle');
  await page.goto('/sync');
  await expect(page.getByRole('heading', { name: 'Sync', level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
}

/** Sync's More → Receive by QR: the menu on a computer (the default 1280 px viewport). */
async function openReceiver(page: Page) {
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: /Receive by QR/ }).click();
  await expect(page).toHaveURL(/\/sync\/qr\/receive$/);
  return page.getByRole('dialog', { name: 'Receive by QR' });
}

const held = (page: Page) => page.locator('[data-frame][data-held="true"]');

test('qr receive: scanning — the ring, one cell per frame filling in any order', async ({
  page,
}) => {
  test.slow();
  await openSync(page);
  await goOffline(page);
  const receiver = await openReceiver(page);
  await expect(receiver.getByText('Scanning…')).toBeVisible();
  await expect(receiver.getByRole('switch', { name: 'Sound on' })).toBeVisible();
  // The rear camera at 1080p, on the zxing path (the stub removes any BarcodeDetector).
  const asked = await page.evaluate(() => ({
    constraints: (window as { __qrCamera?: { constraints?: unknown[] } }).__qrCamera?.constraints,
    native: 'BarcodeDetector' in window,
  }));
  expect(asked).toEqual({
    constraints: [
      {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      },
    ],
    native: false,
  });
  const frames = YAEL_BATCH();
  expect(frames.length).toBeGreaterThanOrEqual(8);
  // Seven of them, out of order, as a camera catches a looping code.
  const picked = [9, 0, 3, 6, 1, 7, 4].filter((i) => i < frames.length - 1);
  for (const i of picked) await show(page, frames[i]!);
  await expect(held(page)).toHaveCount(picked.length);
  await expect(page.locator('[data-frame]')).toHaveCount(frames.length);
  await expect(receiver).toContainText(
    `${picked.length} of ${frames.length} frames, in any order. A green screen and a beep mean it is done.`,
  );
  await shoot(page, 'qr-receive-scanning');
  // The phone: the whole screen, "Missing frames come round again."
  await expect(page.getByRole('dialog')).toContainText('Missing frames come round again.');
  await expect(held(page)).toHaveCount(picked.length);
});

test('qr receive: a complete batch — the green screen, the author and the count', async ({
  page,
}) => {
  test.slow();
  await openSync(page);
  await goOffline(page);
  await openReceiver(page);
  for (const frame of [...YAEL_BATCH()].reverse()) await show(page, frame);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Got it, Yael!' })).toBeVisible();
  await expect(dialog).toContainText('13');
  await expect(dialog).toContainText('records · 12 entries, 1 super');
  await expect(dialog).toContainText('Next phone, step up.');
  await expect(dialog).toContainText('The phone shows Next batch? Tap it there, then scan again.');
  await expect(dialog.getByRole('button', { name: 'Scan the next phone' })).toBeVisible();
  await shoot(page, 'qr-receive-done');
  await page.getByRole('button', { name: 'Done — back to Sync' }).click();
  await expect(page).toHaveURL(/\/sync$/);
  await expect(page.getByRole('tab', { name: /^Waiting\s*13$/ })).toBeVisible();
});

test('qr receive: three phones, then Sync’s Received by QR block and the held escape hatch', async ({
  page,
}) => {
  test.slow();
  await openSync(page);
  await goOffline(page);
  const dialog = await openReceiver(page);
  // Under ten waiting in all: the sidebar's count of ten or more is a known contrast gap
  // (rail-warn on rail, 3.27:1; reported with task 1.48), outside this task's screens.
  const phones: [ReturnType<typeof userByName>, number, number, string][] = [
    [AMIT, 200, 2, 'Amit'],
    [OMER, 100, 3, 'Omer'],
    [YAEL, 0, 4, 'Yael'],
  ];
  for (const [author, base, count, name] of phones) {
    for (const frame of encodeBatch(operations(author, base, count), 0x5eed0000 + base)) {
      await show(page, frame);
    }
    await expect(dialog.getByRole('heading', { name: `Got it, ${name}!` })).toBeVisible();
    if (name !== 'Yael') await page.getByRole('button', { name: 'Scan the next phone' }).click();
  }
  await page.getByRole('button', { name: 'Done — back to Sync' }).click();
  await expect(page).toHaveURL(/\/sync$/);

  const block = page.getByRole('region', { name: 'Received by QR' });
  await expect(block).toContainText('9 from 3 scouters');
  await expect(block.getByRole('listitem')).toHaveCount(3);
  await expect(block.getByRole('listitem').first()).toContainText(
    /^YSYael Shapiralast scan \d\d:\d\d4$/,
  );
  await expect(page.getByRole('tab', { name: /^Waiting\s*9$/ })).toBeVisible();
  await expect(page.locator('[data-record]').first()).toContainText('QR · from');
  await shoot(page, 'sync-received-by-qr');
  await expect(
    page.getByText('What this tablet has sent, and what is still waiting.'),
  ).toBeVisible();

  // More: Discard received QR data is held while any copy waits for the cloud.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'More' }).click();
  const discard = page.getByRole('menuitem', { name: /Discard received QR data/ });
  await expect(discard).toHaveText(
    'Discard received QR dataHeld: 9 received copies haven’t reached the cloud.',
  );
  await expect(discard).toHaveAttribute('aria-disabled', 'true');
  await shoot(page, 'sync-more-qr-held', 'desktop');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'More' }).click();
  const sheet = page.getByRole('dialog', { name: 'More' });
  await expect(sheet.getByRole('link', { name: /Receive by QR/ })).toHaveAttribute(
    'href',
    '/sync/qr/receive',
  );
  await expect(sheet.getByRole('button', { name: /Discard received QR data/ })).toBeDisabled();
  await shoot(page, 'sync-more-qr-held', 'phone');
});

test('qr receive: a damaged code starts again and saves nothing', async ({ page }) => {
  test.slow();
  await openSync(page);
  await goOffline(page);
  await openReceiver(page);
  const frames = YAEL_BATCH();
  const bad = frames[frames.length - 1]!.slice();
  bad[20] = bad[20]! ^ 0xff;
  for (const frame of [...frames.slice(0, -1), bad]) await show(page, frame);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toHaveText(
    'That code was damagedStarting again, hold still',
  );
  await expect(dialog).toContainText('Scanning again');
  await expect(dialog).toContainText('The pieces did not add up. Nothing was saved.');
  await expect(held(page)).toHaveCount(0);
  await expect(page.locator('[data-frame]')).toHaveCount(frames.length);
  await shoot(page, 'qr-receive-damaged');
  const queued = await page.evaluate(
    () =>
      new Promise<number>((done) => {
        const open = indexedDB.open('robactive-scouting');
        open.onsuccess = () => {
          const count = open.result.transaction('outbox').objectStore('outbox').count();
          count.onsuccess = () => done(count.result);
        };
      }),
  );
  expect(queued).toBe(0);
});

test('qr receive: a blocked camera says so, with Try again', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __qrCamera: { blocked: boolean } }).__qrCamera = { blocked: true };
  });
  await openSync(page);
  await goOffline(page);
  await openReceiver(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'The camera is blocked' })).toBeVisible();
  await expect(dialog).toContainText(
    'Allow the camera for this site in the browser’s settings, then try again.',
  );
  await expect(dialog.getByRole('button', { name: 'Try again' })).toBeVisible();
  await shoot(page, 'qr-receive-blocked');
  // Allowed now: Try again starts the camera.
  await page.evaluate(() => {
    (window as unknown as { __qrCamera: { blocked: boolean } }).__qrCamera.blocked = false;
  });
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(dialog.getByText('Scanning…')).toBeVisible();
});

test('qr receive: on the cloud’s ack the copies leave the outbox, with a success notice', async ({
  page,
}) => {
  test.slow();
  let accept = false;
  const push = (input: Record<string, unknown>) => ({
    results: accept
      ? (input.operations as { op_id: string; row_id: string }[]).map((o) => ({
          op_id: o.op_id,
          status: 'applied',
          row_id: o.row_id,
          new_version: 1,
        }))
      : [],
  });
  await openSync(page, { overrides: { 'sync/push': push } });
  await openReceiver(page);
  for (const frame of encodeBatch(operations(OMER, 100, 4), 0x5eed0004)) await show(page, frame);
  await expect(page.getByRole('heading', { name: 'Got it, Omer!' })).toBeVisible();
  await page.getByRole('button', { name: 'Done — back to Sync' }).click();
  await expect(page.getByRole('region', { name: 'Received by QR' })).toContainText(
    '4 from 1 scouter',
  );
  accept = true;
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText('4 received copies reached the cloud.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Received by QR' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /^Waiting\s*0$/ })).toBeVisible();
  await shoot(page, 'sync-qr-disposed');
  // Sent keeps them, still marked as received by QR; the rows stay on the tablet.
  await page.getByRole('tab', { name: /^Sent/ }).click();
  await expect(page.locator('[data-record]').filter({ hasText: 'QR · from Omer' })).toHaveCount(4);
});
