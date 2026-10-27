import { expect, test, type Page } from '@playwright/test';
import { signIn, type Role } from './api-mock';
import { ENTRIES, pullWithSupers, SUPER_ENTRIES } from './fixtures';
import { shoot } from './shoot';

/*
 * The entry preview (task 1.52; docs/design/pages/25-entry-preview/final, variant B with D's
 * buttons): a played match entry seen by a lead, at both widths and scrolled to the end; a
 * no-show seen by its scouter; a super entry seen by its own scouter; and a scouter's own match
 * entry past its 5 minutes (no Edit). Everything is read from the device: the fixture's form
 * scores, so the points and the band are real.
 */

/** Q37 · 1690 Orbit, played (Amit's): the design's entry, with its notes. */
const PLAYED = {
  ...ENTRIES[5]!,
  data: {
    ...ENTRIES[5]!.data,
    notes: 'Best match so far. Driver calm, lined up every shot; climbed with 15 s left.',
  },
};
/** Q37 · 6738 Excalibur, a no-show: Yael's own. */
const NO_SHOW = ENTRIES[6]!;
/** Q38 · 4338 Falcons, broke down: Yael's own, saved at 11:41 — past its 5 minutes at 12:00. */
const PAST_WINDOW = ENTRIES[2]!;
/** Super · 1690 Orbit: Yael's own super entry (Edit at any time). */
const SUPER = SUPER_ENTRIES[0]!;

const PULL = pullWithSupers(ENTRIES.map((e) => (e.id === PLAYED.id ? PLAYED : e)));

/** The server takes nothing, so three entries stay waiting to send (the design's top bar). */
const SERVER = { overrides: { 'sync/push': { results: [] }, 'sync/pull': PULL } };

async function seedWaiting(page: Page) {
  await page.evaluate(
    async (ids) => {
      const db = await new Promise<IDBDatabase>((done, fail) => {
        const open = indexedDB.open('robactive-scouting');
        open.onsuccess = () => done(open.result);
        open.onerror = () => fail(open.error);
      });
      const tx = db.transaction('outbox', 'readwrite');
      ids.forEach((id, i) =>
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
        }),
      );
      await new Promise((done) => (tx.oncomplete = done));
      db.close();
    },
    ENTRIES.slice(0, 3).map((e) => e.id),
  );
}

/** Signs in at the design's 12:00 (Tel Aviv, 17 March 2026) and opens one entry's preview. */
async function openPreview(page: Page, role: Role, id: string) {
  await page.clock.setFixedTime(new Date('2026-03-17T12:00:00+02:00'));
  await signIn(page, role, SERVER);
  await page.waitForLoadState('networkidle');
  await seedWaiting(page);
  await page.goto(`/entries/${id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('entry preview: a played match entry seen by a lead', async ({ page }) => {
  test.slow();
  await openPreview(page, 'lead', PLAYED.id);
  await page.setViewportSize({ width: 1440, height: 900 });
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(/Q37\s*1690\s*Orbit/);
  for (const word of ['Played', 'Red 2', 'Match entry', 'Read only', 'scouted points']) {
    await expect(main.getByText(word, { exact: true })).toBeVisible();
  }
  await expect(main.getByText('52', { exact: true })).toBeVisible();
  await expect(main.getByText('Scouted by Amit Ben-David')).toBeVisible();
  await expect(main.getByText('17/03/2026 11:32')).toBeVisible();
  await expect(main.getByText('form v1')).toBeVisible();
  const band = main.getByRole('region', { name: 'Score breakdown' });
  await expect(band).toContainText('Where the 52 points came from');
  await expect(band).toContainText(/avg \d+\.\d/);
  await expect(main.getByRole('heading', { level: 2 })).toHaveText([
    /^Autonomous\s*\d+ pts$/,
    /^Teleop\s*\d+ pts$/,
    /^Endgame\s*\d+ pts$/,
    'Post-match',
  ]);
  // The desktop crumb, and Entries marked in the sidebar.
  await expect(page.getByText('Q37 · 1690 Orbit')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Entries' }).first()).toHaveAttribute(
    'aria-current',
    'page',
  );
  // A lead may edit: Team page and Edit.
  await expect(main.getByRole('link', { name: 'Team page' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Edit' })).toHaveAttribute(
    'href',
    /^\/entry\/.+\?alliance=red$/,
  );
  await shoot(page, 'entry-preview', 'desktop');
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(main.getByRole('button', { name: 'Entries' })).toBeVisible();
  await shoot(page, 'entry-preview', 'phone', { long: true });
  // Scrolled to the end: Post-match, then Team page and Edit.
  await main.getByRole('link', { name: 'Edit' }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shoot(page, 'entry-preview-end', 'phone');
});

test('entry preview: a no-show seen by its scouter has a note, no rows and no Edit', async ({
  page,
}) => {
  await openPreview(page, 'scouter', NO_SHOW.id);
  const main = page.getByRole('main');
  await expect(main.getByText('The robot did not show up.')).toBeVisible();
  await expect(main.getByText('not counted')).toBeVisible();
  await expect(main.locator('dd, dt')).toHaveCount(0);
  await expect(main.getByRole('region', { name: 'Score breakdown' })).toHaveCount(0);
  await expect(main.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  await expect(main.getByRole('link', { name: 'Team page' })).toBeVisible();
  await shoot(page, 'entry-preview-noshow');
});

test('entry preview: a super entry has no score, and its own scouter may edit it', async ({
  page,
}) => {
  await openPreview(page, 'scouter', SUPER.id);
  const main = page.getByRole('main');
  await expect(main.getByText('Whole event')).toBeVisible();
  await expect(main.getByText('SUPER', { exact: true })).toBeVisible();
  await expect(main.getByText('scouted points')).toHaveCount(0);
  await expect(main.getByRole('region', { name: 'Score breakdown' })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Start position: 1 spot' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', /^\/super\//);
  await shoot(page, 'entry-preview-super');
});

test('entry preview: a scouter’s own match entry past its 5 minutes has no Edit', async ({
  page,
}) => {
  await openPreview(page, 'scouter', PAST_WINDOW.id);
  const main = page.getByRole('main');
  await expect(main.getByText('Broke down', { exact: true })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Team page' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  await shoot(page, 'entry-preview-locked');
});
