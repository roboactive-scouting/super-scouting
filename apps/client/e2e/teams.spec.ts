import { expect, test, type Page } from '@playwright/test';
import { goOffline, signIn } from './api-mock';
import { shoot } from './shoot';

/*
 * Team search (task 1.51; docs/design/pages/23-team-search/final, variant A2): the default list
 * at this event, typing with Show all, the event picker, the are-you-sure and offline. The
 * fixture's District #3 roster is ranked by the shared helper; 7845, 8223 and 9036 are the
 * season's teams at other events.
 */

/** The server takes nothing, so what is queued stays waiting to send (the design's "3 waiting"). */
const HOLD_PUSH = { overrides: { 'sync/push': { results: [] } } };

/** Three entry operations in this device's outbox, as the design's top bar shows. */
async function seedWaiting(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const open = indexedDB.open('robactive-scouting');
      open.onsuccess = () => done(open.result);
      open.onerror = () => fail(open.error);
    });
    const tx = db.transaction('outbox', 'readwrite');
    for (let i = 0; i < 3; i++) {
      tx.objectStore('outbox').put({
        op_id: `e2e-op-${i}`,
        entity: 'scouting_entry',
        row_id: `e2e-row-${i}`,
        action: 'create',
        base_version: null,
        payload: {},
        author_user_id: 'e2e',
        client_created_at: '2026-03-17T09:00:00.000Z',
        client_updated_at: '2026-03-17T09:00:00.000Z',
        seq: i + 1,
      });
    }
    await new Promise((done) => (tx.oncomplete = done));
    db.close();
  });
}

async function openTeams(page: Page) {
  await signIn(page, 'lead', HOLD_PUSH);
  await page.waitForLoadState('networkidle');
  await seedWaiting(page);
  await page.goto('/teams');
  await expect(page.getByRole('heading', { level: 1, name: 'Search teams' })).toBeVisible();
}

/** A row lit as when pressed or hovered: keyboard focus draws the same tint, edge and ›. */
const focusRow = (page: Page, name: string) => async () => {
  await page.keyboard.press('Shift');
  await page.getByRole('link', { name }).focus();
};

test('team search: the default list, at this event', async ({ page }) => {
  await openTeams(page);
  await expect(
    page.getByText('2026 season · 25 teams · ranks from District #3 · Tel Aviv'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^At this event 22/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: /^All 25/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Other events 3/ })).toBeVisible();
  await expect(page.getByLabel(/medal/)).toHaveCount(3);
  const orbit = page.getByRole('link', { name: '1690 Orbit, team page' });
  await expect(orbit).toHaveAttribute('href', /\/teams\//);
  await expect(page.getByText('3 more 2026 teams at other events')).toBeVisible();
  // The desktop table has no column naming other events (A2).
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('columnheader')).toHaveText([
    'Team',
    'Rank here',
    'Entries here',
    'Open',
  ]);
  // Our team's row is tinted and marked on a phone (the long phone shot shows it).
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('link', { name: '2096 RobActive, team page' })).toContainText('· us');
  await shoot(page, 'teams', undefined, {
    long: true,
    before: focusRow(page, '1690 Orbit, team page'),
  });
});

test('team search: typing, then Show all', async ({ page }) => {
  await openTeams(page);
  await page.getByRole('searchbox', { name: 'Search teams' }).fill('7');
  await expect(page.getByText('1 more team matches at other events')).toBeVisible();
  await expect(page.getByRole('link', { name: '7039 Ultimate, team page' })).toBeVisible();
  await shoot(page, 'teams-typing');
  await page.getByRole('button', { name: 'Show all ›' }).click();
  await expect(page.getByRole('button', { name: /^All 3/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('button', { name: '7845 Rogue Robotics: other event' }),
  ).toBeEnabled();
  await shoot(page, 'teams-show-all');
});

test('team search: the event picker, then are you sure', async ({ page }) => {
  await openTeams(page);
  await page.getByRole('button', { name: /^Other events/ }).click();
  await page.getByRole('button', { name: '7845 Rogue Robotics: other event' }).click();
  const pick = page.getByRole('dialog', { name: '7845 Rogue Robotics wasn’t at District #3' });
  await expect(pick.getByRole('radio')).toHaveCount(2);
  await pick.getByRole('radio', { name: /District #2/ }).click();
  await expect(pick.getByText('6 entries · Mar 2026')).toBeVisible();
  await shoot(page, 'teams-pick');
  await pick.getByRole('button', { name: 'Continue' }).click();
  const sure = page.getByRole('dialog', { name: 'Switch to another event?' });
  await expect(sure).toContainText(
    "Switch this session to District #2 · Be'er Sheva and open 7845 Rogue Robotics?",
  );
  await expect(sure.getByRole('button')).toHaveText(['Keep District #3', 'Switch and open']);
  await shoot(page, 'teams-sure');
  // No: nothing changes, the list is still this event's.
  await sure.getByRole('button', { name: 'Keep District #3' }).click();
  await expect(sure).toBeHidden();
  await expect(page).toHaveURL(/\/teams$/);
});

test('team search: offline, other events are held', async ({ page }) => {
  await openTeams(page);
  await goOffline(page);
  await page.getByRole('button', { name: /^All/ }).click();
  await page.getByRole('searchbox', { name: 'Search teams' }).fill('7');
  await expect(
    page.getByText('Other events need a connection; teams at District #3 still open.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '7845 Rogue Robotics: other event' }),
  ).toBeDisabled();
  // Teams at this event still open, ranked from the device.
  await expect(page.getByRole('link', { name: '7039 Ultimate, team page' })).toBeVisible();
  await expect(page.getByLabel('Rank 11')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search teams' }).fill('');
  await expect(page.getByLabel(/medal/)).toHaveCount(3);
  await page.getByRole('searchbox', { name: 'Search teams' }).fill('7');
  await shoot(page, 'teams-offline');
});
