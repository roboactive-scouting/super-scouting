import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { shoot } from './shoot';

/**
 * The discarded-records log (19-discarded final, SPEC-FINAL 9.7, task 1.42). The records are
 * written straight into this device's log, as ackResults writes them after a `parent-deleted`
 * refusal; the design's people, teams and competitions. Times are UTC, shown in Asia/Jerusalem
 * (UTC+3 in October): removed Sun 11 Oct 08:02 and Thu 8 Oct 17:40.
 */
const summary = (o: Record<string, unknown>) => ({
  form_kind: 'match',
  match: 'Q12',
  match_type: 'qualification',
  match_number: 12,
  alliance: 'red',
  station: null,
  team: '',
  team_number: null,
  team_name: null,
  robot_status: 'played',
  scouter: 'Noa Levi',
  scouter_id: 'u-noa',
  client_updated_at: '',
  ...o,
});

const RECORDS = [
  {
    id: 'op-3075',
    discarded_at: '2026-10-11T05:02:00.000Z',
    reason: 'An admin deleted the competition, season or form it belonged to.',
    row_id: 'row-3075',
    event_id: 'ev-haifa',
    event_name: 'District #2 · Haifa',
    dismissed_at: null,
    summary: summary({
      station: 'R2',
      team: '3075 Ha-Dream Team',
      team_number: 3075,
      team_name: 'Ha-Dream Team',
      client_updated_at: '2026-10-09T11:20:00.000Z',
    }),
  },
  {
    id: 'op-1574',
    discarded_at: '2026-10-11T05:02:00.000Z',
    reason: 'An admin deleted the competition, season or form it belonged to.',
    row_id: 'row-1574',
    event_id: 'ev-haifa',
    event_name: 'District #2 · Haifa',
    dismissed_at: null,
    summary: summary({
      alliance: 'blue',
      station: 'B1',
      team: '1574 MisCar',
      team_number: 1574,
      team_name: 'MisCar',
      robot_status: 'broke_down',
      client_updated_at: '2026-10-09T11:22:00.000Z',
    }),
  },
  {
    id: 'op-4590',
    discarded_at: '2026-10-08T14:40:00.000Z',
    reason: 'An admin deleted the competition, season or form it belonged to.',
    row_id: 'row-4590',
    event_id: 'ev-practice',
    event_name: 'Practice day',
    dismissed_at: '2026-10-08T15:00:00.000Z',
    summary: summary({
      form_kind: 'super',
      match: null,
      match_type: null,
      match_number: null,
      alliance: null,
      team: '4590 GreenBlitz',
      team_number: 4590,
      team_name: 'GreenBlitz',
      robot_status: null,
      scouter: 'Omer Katz',
      scouter_id: 'u-omer',
      client_updated_at: '2026-10-08T13:55:00.000Z',
    }),
  },
];

async function seedLog(page: Page, records: unknown[]) {
  await page.evaluate(async (rows) => {
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const open = indexedDB.open('robactive-scouting');
      open.onsuccess = () => done(open.result);
      open.onerror = () => fail(open.error);
    });
    const tx = db.transaction(['discarded'], 'readwrite');
    for (const row of rows) tx.objectStore('discarded').put(row);
    await new Promise((done) => (tx.oncomplete = done));
    db.close();
  }, records);
}

test('discarded records: grouped by removal, newest first, read only', async ({ page }) => {
  test.slow();
  await signIn(page, 'lead');
  await seedLog(page, RECORDS);
  await page.goto('/sync/discarded');

  await expect(page.getByRole('heading', { name: 'Discarded records', level: 1 })).toBeVisible();
  await expect(
    page.getByText('An admin deleted the competition, season or form it belonged to.'),
  ).toBeVisible();
  const rows = page.getByRole('row');
  await expect(rows.nth(1)).toHaveText('Removed Sun 11 Oct, 08:02District #2 · Haifa');
  await expect(rows.nth(2)).toContainText('Q12');
  await expect(rows.nth(2)).toContainText('Red 2');
  await expect(rows.nth(2)).toContainText('Fri 9 Oct, 14:20');
  await expect(rows.nth(4)).toHaveText('Removed Thu 8 Oct, 17:40Practice day');
  await expect(rows.nth(5)).toContainText('SUPER');
  // A dismissed record is still in the log; nothing on the page acts on a record.
  await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);

  await shoot(page, 'discarded');

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('region', { name: /Removed Sun 11 Oct, 08:02/ })).toBeVisible();
  await expect(page.getByText('Entries removed from this phone', { exact: false })).toBeVisible();
});

test('discarded records: nothing discarded', async ({ page }) => {
  await signIn(page, 'lead');
  await page.goto('/sync/discarded');
  await expect(page.getByRole('heading', { name: 'Nothing has been discarded' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Sync' })).toHaveAttribute('href', '/sync');
  await shoot(page, 'discarded-empty');
});
