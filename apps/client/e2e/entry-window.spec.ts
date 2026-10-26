import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { EVENT_ID, FIXTURE, FORM, matchId, teamId, userByName } from './fixtures';
import { shoot } from './shoot';

/**
 * Phase 1 H side task 5 (SPEC-FINAL 7.6 v1.45): no edit after 5 minutes. Yael (a scouter) saved
 * Q39 · 2630 at 12:00 Tel Aviv and reopened it: in the last minute the Save bar counts down, at
 * 5:00 the form saves what can be saved, stamped 12:05:00, and becomes the entry read only with
 * the Success banner; an out-of-range change is not kept and is named. Opened again later, the
 * entry route shows it read only. Built from the Primary action bar, Success banner and Error
 * line parts (14-entry-parts final); no design page of its own.
 */

const CREATED = Date.parse('2026-03-17T10:00:00.000Z');
const ENTRY_ID = '0000000e-0000-4000-8000-000000009999';
const PATH = `/entry/${matchId(39)}/${teamId(2630)}?alliance=red`;

const ENTRY = {
  id: ENTRY_ID,
  form_version_id: FORM.version_id,
  form_kind: 'match' as const,
  event_id: EVENT_ID,
  match_id: matchId(39),
  team_id: teamId(2630),
  alliance: 'red' as const,
  scouter_id: userByName('yael.s').id,
  robot_status: 'played' as const,
  breakdown_seconds: null,
  data: {
    auto_notes: 9,
    auto_left_zone: true,
    teleop_notes: 12,
    endgame_climb: 'low',
    notes: 'Fast cycles on the near side',
  },
  version: 1,
  created_at: new Date(CREATED).toISOString(),
  updated_at: new Date(CREATED).toISOString(),
  client_created_at: new Date(CREATED).toISOString(),
  client_updated_at: new Date(CREATED).toISOString(),
  deleted_at: null,
};

const PULL = {
  ...FIXTURE.pull,
  entities: {
    ...FIXTURE.pull.entities,
    scouting_entries: [...FIXTURE.pull.entities.scouting_entries, ENTRY],
  },
};

type PushedOp = { client_updated_at: string; payload: { data: Record<string, unknown> } };

/**
 * A server for this one entry: a push applies (and is kept to read back), a pull answers the
 * entry as last pushed, so the device's copy stays the saved one.
 */
function server() {
  const pushed: PushedOp[] = [];
  const entry = () => ({ ...ENTRY, data: pushed.at(-1)?.payload.data ?? ENTRY.data });
  return {
    pushed,
    overrides: {
      'sync/pull': () => ({
        ...PULL,
        entities: {
          ...PULL.entities,
          scouting_entries: [...FIXTURE.pull.entities.scouting_entries, entry()],
        },
      }),
      'sync/push': (input: Record<string, unknown>) => {
        const ops = input.operations as (PushedOp & { op_id: string; row_id: string })[];
        pushed.push(...ops);
        return {
          results: ops.map((op) => ({
            op_id: op.op_id,
            status: 'applied',
            row_id: op.row_id,
            new_version: 2,
          })),
        };
      },
    },
  };
}

/** The page's clock to `ms` after the entry was saved, firing every timer on the way. */
async function runTo(page: Page, ms: number) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.runFor(Math.max(0, CREATED + ms - now));
}

/** Waits for the pulled entry to be on the device, then opens it. */
async function openEntry(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open('robactive-scouting');
            open.onsuccess = () => {
              const get = open.result
                .transaction('rows')
                .objectStore('rows')
                .get(['scouting_entries', id]);
              get.onsuccess = () => resolve(get.result !== undefined);
              get.onerror = () => resolve(false);
            };
            open.onerror = () => resolve(false);
          }),
        ENTRY_ID,
      ),
    )
    .toBe(true);
  await page.goto(PATH);
}

test('no edit after 5 minutes: the countdown, the save at 5:00, and the entry read only', async ({
  page,
}) => {
  test.slow();
  await page.clock.install({ time: CREATED + 3 * 60_000 + 30_000 });
  const api = server();
  await signIn(page, 'scouter', { overrides: api.overrides });
  await page.setViewportSize({ width: 375, height: 812 });
  await openEntry(page);
  await expect(page.getByLabel('Auto notes scored value')).toHaveText('9');
  await expect(page.getByRole('timer')).toHaveCount(0);

  // 4:15: "Editable for 0:45" above Review entry. Each picture puts the clock back to 4:15 (the
  // shots take real seconds); the mark's own timer is not moved by that.
  await runTo(page, 4 * 60_000 + 15_000);
  const timer = page.getByRole('timer');
  await expect(timer).toHaveText('Editable for 0:45');
  const at415 = async () => {
    await page.clock.setSystemTime(CREATED + 4 * 60_000 + 14_000);
    await page.clock.runFor(1_000);
    await expect(timer).toHaveText('Editable for 0:45');
  };
  await shoot(page, 'entry-window-countdown', undefined, { before: at415 });

  // Two more than the most (10): this change cannot be saved, the rest can.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Auto notes scored plus one' }).click();
  await page.getByRole('button', { name: 'Auto notes scored plus one' }).click();
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await page.getByRole('button', { name: 'Teleop notes scored plus one' }).click();

  // 5:00: saved and locked.
  await runTo(page, 5 * 60_000 + 500);
  const banner = page.getByRole('status').filter({ hasText: 'Saved — the 5 minutes are up.' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Not kept: Auto notes scored 11 is over 10.');
  await expect(page.getByText('Read only')).toBeVisible();
  await expect(page.getByRole('button', { name: /review entry/i })).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await shoot(page, 'entry-window-saved', undefined, { long: true });

  // What reached the server: one update, stamped 12:05:00 exactly (created + 5:00), with
  // Teleop's change and Auto's saved value.
  await expect
    .poll(async () => {
      await page.clock.runFor(5_000);
      return api.pushed.length;
    })
    .toBe(1);
  expect(api.pushed[0]!.client_updated_at).toBe('2026-03-17T10:05:00.000Z');
  expect(api.pushed[0]!.payload.data).toMatchObject({ auto_notes: 9, teleop_notes: 13 });

  // Opened again after the window (Home's Open and Sync's Open entry come here): read only.
  await page.goto(PATH);
  await expect(page.getByText('Only a lead or an admin can change it now.')).toBeVisible();
  await expect(page.getByRole('button', { name: /review entry/i })).toHaveCount(0);
  await expect(page.getByText(/locked/)).toHaveCount(0);
  // The saved values: Teleop's change kept, Auto's out-of-range one not.
  await expect(page.getByText('Teleop notes scored').locator('..')).toContainText('13');
  await expect(page.getByText('Auto notes scored').locator('..')).toContainText('9');
  await shoot(page, 'entry-window-readonly');
});

test("a lead's form for the same entry never counts down or locks", async ({ page }) => {
  await page.clock.install({ time: CREATED + 4 * 60_000 + 30_000 });
  await signIn(page, 'lead', { overrides: server().overrides });
  await page.setViewportSize({ width: 375, height: 812 });
  await openEntry(page);
  await expect(page.getByLabel('Auto notes scored value')).toHaveText('9');
  await runTo(page, 6 * 60_000);
  await expect(page.getByRole('timer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /review entry/i })).toBeVisible();
  await expect(page.getByText('Saved — the 5 minutes are up.')).toHaveCount(0);
});
