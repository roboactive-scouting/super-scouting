import { expect, test, type Page } from '@playwright/test';
import { goOffline, signIn } from './api-mock';
import { ENTRIES, EVENTS, EVENT_ID, FORM, matchId, teamId, userByName } from './fixtures';
import { shoot } from './shoot';

/**
 * The Sync page (17-sync final, SPEC-FINAL 9.10, task 1.43): the design's records, written
 * straight into this device's outbox, sync state and cache, as the entry screen and a QR
 * receive leave them. The server takes nothing (HOLD_PUSH), so what is queued stays waiting.
 */
const HOLD_PUSH = { overrides: { 'sync/push': { results: [] } } };

const EARLIER = EVENTS[0]!; // District #1 · Haifa
const NEW_MATCH = '00000005-0000-4000-8000-000000000041'; // Q41, made on this device
const EARLIER_MATCH = '00000005-0000-4000-8000-000000000171'; // Haifa's Q71
const YAEL = userByName('yael.s');
const NOA = userByName('noa.levi');

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

type Seed = {
  id: string;
  event?: string;
  match: string | null;
  team: number;
  alliance: 'red' | 'blue' | null;
  status: string | null;
  saved: string;
  by?: string;
  origin?: 'local' | 'qr';
  refused?: { code: string; message: string };
  seq: number;
};

/** Each record: its entry operation, its cached row, its sync state. */
function records(): Seed[] {
  return [
    {
      id: 'e2e-q41',
      match: NEW_MATCH,
      team: 5951,
      alliance: 'blue',
      status: 'played',
      saved: ago(1),
      seq: 2,
    },
    {
      id: 'e2e-q40',
      match: matchId(40),
      team: 8175,
      alliance: 'blue',
      status: 'played',
      saved: ago(4),
      seq: 3,
    },
    {
      id: 'e2e-q38',
      match: matchId(38),
      team: 4338,
      alliance: 'red',
      status: 'broke_down',
      saved: ago(7),
      by: YAEL.id,
      origin: 'qr',
      seq: 4,
    },
    {
      id: 'e2e-super',
      match: null,
      team: 1690,
      alliance: null,
      status: null,
      saved: ago(18),
      seq: 5,
    },
    {
      id: 'e2e-q36',
      match: matchId(36),
      team: 5135,
      alliance: 'blue',
      status: 'disabled',
      saved: ago(23),
      refused: { code: 'edit-window-expired', message: 'this entry is locked — ask a lead' },
      seq: 6,
    },
    {
      id: 'e2e-q71',
      event: EARLIER.id,
      match: EARLIER_MATCH,
      team: 2231,
      alliance: 'red',
      status: 'played',
      saved: ago(60 * 24 * 2 + 30),
      seq: 7,
    },
  ];
}

const discardedRecord = (id: string, team: [number, string], station: string, at: string) => ({
  id,
  discarded_at: ago(90),
  reason: 'An admin deleted the competition, season or form it belonged to.',
  row_id: `row-${id}`,
  event_id: 'ev-gone',
  event_name: 'Practice day',
  dismissed_at: null,
  summary: {
    form_kind: 'match',
    match: 'Q12',
    match_type: 'qualification',
    match_number: 12,
    alliance: station.startsWith('R') ? 'red' : 'blue',
    station,
    team: `${team[0]} ${team[1]}`,
    team_number: team[0],
    team_name: team[1],
    robot_status: 'played',
    scouter: 'Noa Levi',
    scouter_id: NOA.id,
    client_updated_at: at,
  },
});

async function seed(page: Page) {
  const seeds = records();
  const author = NOA.id;
  const ops = [
    {
      op_id: 'e2e-op-match-41',
      entity: 'match',
      row_id: NEW_MATCH,
      action: 'create',
      base_version: null,
      payload: { event_id: EVENT_ID, match_type: 'qualification', number: 41 },
      author_user_id: author,
      client_created_at: ago(2),
      client_updated_at: ago(2),
      seq: 1,
    },
    ...seeds.map((s) => ({
      op_id: `e2e-op-${s.id}`,
      entity: 'scouting_entry',
      row_id: s.id,
      action: 'create',
      base_version: null,
      payload: {
        id: s.id,
        form_version_id: FORM.version_id,
        form_kind: s.match === null ? 'super' : 'match',
        event_id: s.event ?? EVENT_ID,
        match_id: s.match,
        team_id: teamId(s.team),
        alliance: s.alliance,
        scouter_id: s.by ?? author,
        robot_status: s.status,
        breakdown_seconds: s.status === 'broke_down' ? 52 : null,
        data: {},
      },
      author_user_id: s.by ?? author,
      client_created_at: s.saved,
      client_updated_at: s.saved,
      seq: s.seq,
    })),
  ];
  const rows = [
    { ...EARLIER, entity: 'events', id: EARLIER.id },
    {
      entity: 'matches',
      id: NEW_MATCH,
      event_id: EVENT_ID,
      match_type: 'qualification',
      number: 41,
    },
    {
      entity: 'matches',
      id: EARLIER_MATCH,
      event_id: EARLIER.id,
      match_type: 'qualification',
      number: 71,
    },
    {
      entity: 'match_teams',
      id: 'e2e-slot-71',
      match_id: EARLIER_MATCH,
      team_id: teamId(2231),
      alliance: 'red',
      station: 1,
      deleted_at: null,
    },
    ...ops
      .filter((op) => op.entity === 'scouting_entry')
      .map((op) => ({
        ...op.payload,
        entity: 'scouting_entries',
        version: 1,
        client_created_at: op.client_created_at,
        client_updated_at: op.client_updated_at,
        deleted_at: null,
      })),
    // Two open conflicts on this event (SPEC-FINAL 9.5): the lead's link.
    ...['c-1', 'c-2'].map((id) => ({
      entity: 'sync_conflicts',
      id: `e2e-${id}`,
      event_id: EVENT_ID,
      resolved_at: null,
    })),
  ];
  const states = [
    { row_id: NEW_MATCH, sync_state: 'pending', acked_at: null, origin: 'local' },
    ...seeds.map((s) => ({
      row_id: s.id,
      sync_state: 'pending',
      acked_at: null,
      origin: s.origin ?? 'local',
      ...(s.refused ? { rejection: { ...s.refused, at: ago(20) } } : {}),
    })),
    // Sent: three of the event's entries this device pushed earlier today.
    ...ENTRIES.slice(0, 3).map((e, i) => ({
      row_id: e.id,
      sync_state: 'acked',
      acked_at: ago(30 + i * 5),
      origin: 'local',
    })),
  ];
  const discarded = [
    discardedRecord('gone-1', [3075, 'Ha-Dream Team'], 'R2', ago(60 * 26)),
    discardedRecord('gone-2', [1574, 'MisCar'], 'B1', ago(60 * 26 - 2)),
  ];
  await page.evaluate(
    async ({ ops, rows, states, discarded }) => {
      const db = await new Promise<IDBDatabase>((done, fail) => {
        const open = indexedDB.open('robactive-scouting');
        open.onsuccess = () => done(open.result);
        open.onerror = () => fail(open.error);
      });
      const tx = db.transaction(['outbox', 'rows', 'syncState', 'discarded'], 'readwrite');
      for (const op of ops) tx.objectStore('outbox').put(op);
      for (const row of rows) tx.objectStore('rows').put(row);
      for (const state of states) tx.objectStore('syncState').put(state);
      for (const record of discarded) tx.objectStore('discarded').put(record);
      await new Promise((done) => (tx.oncomplete = done));
      db.close();
    },
    { ops, rows, states, discarded },
  );
}

/** Signed in as the lead with the design's records on the device, on /sync. */
async function openSync(page: Page, opts = HOLD_PUSH) {
  await signIn(page, 'lead', opts);
  await page.waitForLoadState('networkidle');
  await seed(page);
  // Through the sync indicator, the way a person gets there (it is a link on every screen).
  await page.reload();
  await page.waitForLoadState('networkidle');
  // Opening a screen syncs (SPEC-FINAL 9.3); it must finish, or going offline cuts it off and
  // the bar says why.
  const pulled = page.waitForResponse((r) => r.url().includes('/sync/pull'));
  await page
    .getByRole('banner')
    .getByRole('link', { name: /waiting to send/ })
    .click();
  await expect(page).toHaveURL(/\/sync$/);
  await expect(page.getByRole('heading', { name: 'Sync', level: 1 })).toBeVisible();
  await pulled;
  await expect(page.getByRole('button', { name: 'Sync now' })).toBeEnabled();
}

const tab = (page: Page, name: RegExp) => page.getByRole('tab', { name });

test('sync: Waiting, grouped by competition, with the lead’s conflicts link, offline', async ({
  page,
}) => {
  test.slow();
  await openSync(page);
  await goOffline(page);

  await expect(tab(page, /^Waiting\s*6$/)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('link', { name: /2 conflicts to review/ })).toHaveAttribute(
    'href',
    '/conflicts',
  );
  await expect(page.getByRole('status').filter({ hasText: 'Offline' }).first()).toBeVisible();
  await expect(page.getByText(/last sync \d\d:\d\d · sends by itself/)).toBeVisible();
  const rows = page.getByRole('row');
  await expect(rows.filter({ hasText: 'this event · 5' })).toHaveText(
    'District #3 · Tel Avivthis event · 5',
  );
  await expect(rows.filter({ hasText: 'earlier event · 1' })).toHaveText(
    'District #1 · Haifaearlier event · 1',
  );
  await expect(page.locator('[data-record="e2e-q41"]')).toContainText(
    'New match — sends with this entry',
  );
  await expect(page.locator('[data-record="e2e-q38"]')).toContainText('QR · from Yael');
  await expect(page.locator(`[data-record="${NEW_MATCH}"]`)).toHaveCount(0);
  await expect(page.getByText(/Not sent: This entry is locked — ask a lead\./)).toBeVisible();
  // The sidebar's Sync row carries the same count as the indicator.
  await expect(page.getByRole('link', { name: 'Sync, 6 waiting to send' })).toBeVisible();

  await shoot(page, 'sync-waiting', undefined, { long: true });

  // shoot() leaves the phone width: cards, grouped under the competition's heading.
  await expect(page.getByRole('region', { name: 'District #3 · Tel Aviv' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Offline · 6' })).toBeVisible();
});

test('sync: Problems — the refused record and the discarded notice', async ({ page }) => {
  test.slow();
  await openSync(page);
  await goOffline(page);
  await tab(page, /^Problems/).click();
  const panel = page.getByRole('tabpanel', { name: 'Problems' });
  await expect(panel.getByRole('link', { name: 'Open entry' })).toHaveAttribute(
    'href',
    `/entry/${matchId(36)}/${teamId(5135)}?alliance=blue`,
  );
  await expect(panel.getByText('It was changed after its 5 minutes were up.')).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Discarded entries' })).toContainText(
    '2 entries were removed from this device.',
  );
  await shoot(page, 'sync-problems');
});

test('sync: Sent, newest first', async ({ page }) => {
  await openSync(page);
  await goOffline(page);
  await tab(page, /^Sent/).click();
  await expect(page.getByRole('tabpanel', { name: 'Sent' }).getByText(/✓ sent/)).toHaveCount(3);
  await shoot(page, 'sync-sent');
});

test('sync: More holds the QR tools, the discarded log and the held escape hatch, as a sheet on a phone and a menu on a computer', async ({
  page,
}) => {
  await openSync(page);
  await goOffline(page);
  await page.getByRole('button', { name: 'More' }).click();
  // Send by QR (task 1.47), Receive by QR and Discard received QR data (task 1.48).
  await expect(page.getByRole('menuitem')).toHaveCount(4);
  await expect(page.getByRole('menuitem').first()).toHaveText(
    'Send by QRTo the collector tablet. No internet needed.',
  );
  await expect(page.getByRole('menuitem').nth(1)).toHaveText(
    'Receive by QROn the collector tablet: scan another phone.',
  );
  await expect(page.getByRole('menuitem').nth(2)).toHaveText(
    'Discarded records2 removed because their event was deleted.',
  );
  // The seeded QR copy (Q38, from Yael) has not reached the cloud: the escape hatch is held.
  await expect(page.getByRole('menuitem').nth(3)).toHaveText(
    'Discard received QR dataHeld: 1 received copy hasn’t reached the cloud.',
  );
  await expect(page.getByRole('menuitem').nth(3)).toHaveAttribute('aria-disabled', 'true');
  await shoot(page, 'sync-more-menu', 'desktop');
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'More' }).click();
  const sheet = page.getByRole('dialog', { name: 'More' });
  await expect(sheet.getByRole('link')).toHaveCount(3);
  await expect(sheet.getByRole('link', { name: /Send by QR/ })).toHaveAttribute(
    'href',
    '/sync/qr/send',
  );
  await expect(sheet.getByRole('link', { name: /Receive by QR/ })).toHaveAttribute(
    'href',
    '/sync/qr/receive',
  );
  await expect(sheet.getByRole('link', { name: /Discarded records/ })).toHaveAttribute(
    'href',
    '/sync/discarded',
  );
  await expect(sheet.getByRole('button', { name: /Discard received QR data/ })).toBeDisabled();
  await shoot(page, 'sync-more', 'phone');
});

test('sync: Sending — "Sent · 2 of 5", the button held, the acked rows ticked off', async ({
  page,
}) => {
  test.slow();
  await openSync(page);
  await page.waitForLoadState('networkidle');
  // Freeze a sync part-way, in the page itself (a held routed request would keep the network
  // busy, and shoot() waits for it to be idle): the server takes the first two entries, and the
  // pull that follows never answers within the pictures (its deadline is 30 s).
  await page.evaluate(() => {
    const real = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('/sync/pull')) return new Promise<Response>(() => undefined);
      if (url.includes('/sync/push')) {
        const body = JSON.parse(String(init?.body)) as {
          operations: { op_id: string; row_id: string; entity: string }[];
        };
        const take = body.operations.filter((o) => o.entity === 'scouting_entry').slice(0, 2);
        const results = take.map((o) => ({
          op_id: o.op_id,
          status: 'applied',
          row_id: o.row_id,
          new_version: 1,
        }));
        return new Response(JSON.stringify({ results }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return real(input, init);
    };
  });
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  await expect(page.getByText('2 of 5')).toBeVisible();
  await expect(tab(page, /^Waiting\s*4$/)).toBeVisible();
  await expect(page.locator('[data-record="e2e-q41"]')).toContainText(/✓ \d\d:\d\d/);
  await shoot(page, 'sync-sending');
});

test('sync: a scouter sees no conflicts link', async ({ page }) => {
  await signIn(page, 'scouter', HOLD_PUSH);
  await page.waitForLoadState('networkidle');
  await seed(page);
  await page.goto('/sync');
  await expect(tab(page, /^Waiting\s*6$/)).toBeVisible();
  await expect(page.getByRole('link', { name: /conflicts to review/ })).toHaveCount(0);
});
