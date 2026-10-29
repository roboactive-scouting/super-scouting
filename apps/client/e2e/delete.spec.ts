import { expect, test, type Page } from '@playwright/test';
import { signIn, type Role } from './api-mock';
import { deleteImpact } from './deleteFixtures';
import { ENTRIES, EVENT, MATCHES, SEASONS } from './fixtures';
import { deleteImpactOf, listFormsOf, MATCH_FORM_ID, VERSIONS } from './formFixtures';
import { shoot } from './shoot';

/*
 * The one DeleteDialog and where it opens (task 1.61; docs/design/pages/28-delete/final, variant
 * A): Season 2025's bill with "202" typed and the button off; version 1's Blocked face; on a
 * phone, one entry's "Are you sure?", Q41's Choice and Q41's bill with "Q4" typed; and the
 * triggers — the entry preview's Delete (a lead's, never a scouter's) and the forms list's trash
 * buttons on every version but the active one. The user's rule (2026-10-29): a superseded
 * version's bill, and the newest published version's Blocked face. The counts are the server's
 * (`getDeleteImpact`, mocked).
 */

const SEASON_2025 = SEASONS.find((s) => s.year === 2025)!;

/** Season 2025 as 28-delete final counts it. */
const SEASON_BILL = deleteImpact({
  kind: 'season',
  id: SEASON_2025.id,
  name: '2025',
  events: 3,
  event_names: ['ISR District #1', 'ISR District #4', 'ISR District Championship'],
  matches: 246,
  entries: 1912,
  match_entries: 1804,
  super_entries: 108,
  forms: 2,
  form_versions: 7,
  dashboards: 4,
  weight_presets: 2,
});

/** Q40–Q42 of the default event, as the phone final draws them (three fixture line-ups). */
const PHONE_MATCHES = [37, 38, 39].map((i, k) => ({ ...MATCHES[i]!, number: 40 + k }));
const Q41 = PHONE_MATCHES[1]!;
const Q41_IMPACT = deleteImpact({
  kind: 'match',
  id: Q41.id,
  name: 'Q41',
  matches: 1,
  entries: 6,
  match_entries: 6,
  stations: Q41.slots.map((s) => ({
    alliance: s.alliance,
    station: s.station,
    team_number: null,
    entries: 1,
  })),
  last_saved_at: '2026-03-17T11:18:00.000Z',
});

/** Q37 · 1690 Orbit, played (Amit's): the entry preview's design entry. */
const PLAYED = ENTRIES[5]!;

async function openPreview(page: Page, role: Role, width: number, height: number) {
  await page.clock.setFixedTime(new Date('2026-03-17T12:00:00+02:00'));
  // The server takes nothing, so a delete stays waiting to send.
  await signIn(page, role, { overrides: { 'sync/push': { results: [] } } });
  await page.setViewportSize({ width, height });
  await page.waitForLoadState('networkidle');
  await page.goto(`/entries/${PLAYED.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** The phone finals show the end of the preview, where its buttons are. */
const toActions = (page: Page) =>
  page.getByRole('main').getByRole('link', { name: 'Team page' }).scrollIntoViewIfNeeded();

test('delete: Season 2025 — the bill, both backup lines, "202" typed and the button off', async ({
  page,
}) => {
  const asked: unknown[] = [];
  await signIn(page, 'admin', {
    overrides: {
      getDeleteImpact: (input: Record<string, unknown>) => {
        asked.push(input);
        return SEASON_BILL;
      },
    },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/manage');
  await page.getByRole('group', { name: 'Seasons' }).getByRole('button', { name: /^2025/ }).click();
  await page.getByRole('button', { name: 'Edit season' }).click();
  await page.getByRole('button', { name: 'Delete 2025' }).click();
  const bill = page.getByRole('dialog', { name: 'Delete Season 2025?' });
  await expect(bill).toBeVisible();
  // One surface: the Edit season dialog closed as the delete opened.
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect(asked).toEqual([{ kind: 'season', id: SEASON_2025.id }]);
  await expect(bill).toContainText('Delete Season 2025 · hard delete · cannot be undone');
  await expect(bill).toContainText('Counted on the server just now');
  await expect(bill).toContainText('1912 entries go');
  await expect(bill).toContainText('1804 match · 108 super');
  await expect(bill.locator('pre')).toHaveText(
    [
      'pnpm --filter @frc/db exec supabase db dump -f ~/frc-backups/prod-schema-$(date +%Y-%m-%d).backup.sql',
      'pnpm --filter @frc/db exec supabase db dump --data-only --use-copy -f ~/frc-backups/prod-data-$(date +%Y-%m-%d).backup.sql',
    ].join('\n'),
  );
  await expect(bill.getByRole('button', { name: 'Cancel' })).toBeFocused();
  const go = bill.getByRole('button', { name: 'Delete season 2025' });
  await bill.getByLabel(/type the name to confirm/i).fill('202');
  await expect(bill.getByText('No match yet')).toBeVisible();
  await expect(go).toBeDisabled();
  await shoot(page, 'delete-season', 'desktop');
});

test('delete: version 1 with entries is Blocked — two ways forward, nothing to type', async ({
  page,
}) => {
  await signIn(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/forms');
  const card = page.getByRole('region', { name: 'Match form' });
  await card.getByRole('button', { name: 'Delete version v1' }).click();
  const blocked = page.getByRole('dialog', {
    name: "Version 1 can't be deleted",
  });
  await expect(blocked).toContainText('Blocked');
  await expect(blocked).toContainText('12 entries are bound to it');
  await expect(blocked.getByRole('textbox')).toHaveCount(0);
  await expect(blocked.getByRole('button', { name: 'Keep version 1' })).toBeFocused();
  await expect(blocked.getByRole('button', { name: 'Delete the whole form…' })).toBeVisible();
  await shoot(page, 'delete-version-blocked', 'desktop');
  // The way forward opens the whole form's own bill.
  await blocked.getByRole('button', { name: 'Delete the whole form…' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete Match form?' })).toContainText(
    '264 entries go',
  );
});

test('delete: the forms list — a trash button on every version but the active one, the draft included', async ({
  page,
}) => {
  await signIn(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/forms');
  const card = page.getByRole('region', { name: 'Match form' });
  await expect(card.getByRole('button', { name: /^Delete version/ })).toHaveCount(3);
  await expect(card.getByRole('button', { name: 'Delete version v4' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Delete version v3' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Delete version v2' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Delete version v1' })).toBeVisible();
  for (const v of ['v4', 'v2']) {
    const box = await card.getByRole('button', { name: `Delete version ${v}` }).boundingBox();
    expect([box?.width, box?.height]).toEqual([36, 36]);
  }
  // The draft's trash sits where the older rows have theirs: the row's last button.
  const draft = await card.getByRole('button', { name: 'Delete version v4' }).boundingBox();
  const older = await card.getByRole('button', { name: 'Delete version v2' }).boundingBox();
  expect(draft?.x).toBe(older?.x);
  await shoot(page, 'delete-triggers-forms', 'desktop');
});

// The user's rule (2026-10-29): a published version goes on its own once a newer one is
// published. v2 with no entries is superseded by v3, so its trash opens the bill.
test('delete: a superseded version with no entries — the bill, "v2" typed, then deleted', async ({
  page,
}) => {
  const versions = VERSIONS.map((v) => (v.version_no === 2 ? { ...v, entry_count: 0 } : v));
  const sent: unknown[] = [];
  await signIn(page, 'admin', {
    overrides: {
      listForms: listFormsOf(versions),
      getDeleteImpact: deleteImpactOf(versions),
      deleteFormVersion: (input: Record<string, unknown>) => {
        sent.push(input);
        return { deleted: true };
      },
    },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/forms');
  const card = page.getByRole('region', { name: 'Match form' });
  await card.getByRole('button', { name: 'Delete version v2' }).click();
  const bill = page.getByRole('dialog', { name: 'Delete version 2 of Match form 2026?' });
  await expect(bill).toBeVisible();
  const go = bill.getByRole('button', { name: 'Delete version 2' });
  await expect(go).toBeDisabled();
  await bill.getByLabel(/type the name to confirm/i).fill('v2');
  await expect(go).toBeEnabled();
  await shoot(page, 'delete-version-bill', 'desktop');
  await go.click();
  await expect(bill).toHaveCount(0);
  expect(sent).toEqual([{ form_version_id: versions[2]!.id, confirm_name: 'v2' }]);
});

test('delete: the newest published version (an older one restored) is Blocked — publish a newer one', async ({
  page,
}) => {
  // v2 restored as active; v3, published after it, has no entries and nothing newer published.
  const versions = VERSIONS.map((v) =>
    v.version_no === 3
      ? { ...v, is_active: false, entry_count: 0 }
      : v.version_no === 2
        ? { ...v, is_active: true }
        : v,
  );
  await signIn(page, 'admin', {
    overrides: { listForms: listFormsOf(versions), getDeleteImpact: deleteImpactOf(versions) },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/forms');
  const card = page.getByRole('region', { name: 'Match form' });
  await expect(card.getByRole('button', { name: 'Delete version v2' })).toHaveCount(0);
  await card.getByRole('button', { name: 'Delete version v3' }).click();
  const blocked = page.getByRole('dialog', { name: "Version 3 can't be deleted" });
  await expect(blocked).toContainText('v3 is the newest published version');
  await expect(blocked).toContainText(
    'Publish a newer version first, then this one can be deleted. Or delete the whole form.',
  );
  await expect(blocked.getByRole('textbox')).toHaveCount(0);
  await expect(blocked.getByRole('button', { name: 'Keep version 3' })).toBeFocused();
  await expect(blocked.getByRole('button', { name: 'Delete the whole form…' })).toBeVisible();
  await shoot(page, 'delete-version-newest-blocked', 'desktop');
  await blocked.getByRole('button', { name: 'Open the builder' }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === `/admin/forms/${MATCH_FORM_ID}` && url.search === '?version=4',
  );
});

test('delete: the entry preview — a lead gets Delete after Team page and Edit', async ({
  page,
}) => {
  await openPreview(page, 'lead', 1440, 900);
  const main = page.getByRole('main');
  await expect(main.getByRole('button', { name: 'Delete' })).toBeVisible();
  await shoot(page, 'delete-triggers-entry', undefined, { before: () => toActions(page) });
});

test('delete: the entry preview — a scouter never sees Delete', async ({ page }) => {
  await openPreview(page, 'scouter', 1440, 900);
  await expect(page.getByRole('main').getByRole('link', { name: 'Team page' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await shoot(page, 'delete-triggers-entry-scouter', undefined, {
    before: () => toActions(page),
  });
});

test('delete: one entry on a phone — "Are you sure?", then it waits to send', async ({ page }) => {
  await openPreview(page, 'lead', 375, 812);
  await page.getByRole('main').getByRole('button', { name: 'Delete' }).click();
  const sure = page.getByRole('dialog', { name: 'Are you sure?' });
  await expect(sure).toContainText('Q37 · 1690');
  await expect(sure).toContainText(
    'This deletes 1 entry. It stops counting in statistics, lists and ranking once it syncs. There is no restore.',
  );
  await expect(sure.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await shoot(page, 'delete-entry-sure', 'phone');
  await sure.getByRole('button', { name: 'Delete entry' }).click();
  await page.waitForURL('**/entries');
});

test('delete: Q41 on a phone — the Choice sheet, then its bill with "Q4" typed', async ({
  page,
}) => {
  const sent: unknown[] = [];
  await signIn(page, 'admin', {
    overrides: {
      listMatches: { items: PHONE_MATCHES, next_cursor: null },
      getDeleteImpact: Q41_IMPACT,
      deleteMatch: (input: Record<string, unknown>) => {
        sent.push(input);
        return { id: Q41.id, deleted: true, entries: 6 };
      },
    },
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/manage');
  await expect(page.getByText(EVENT.name)).toBeVisible();
  await page.getByRole('button', { name: /^Q41/ }).click();
  await page.getByRole('button', { name: 'Delete match' }).click();
  const choice = page.getByRole('dialog', { name: 'Q41 has entries' });
  await expect(choice).toContainText('6 entries are saved to Q41');
  await expect(
    choice.getByRole('list', { name: 'The entries by station' }).getByRole('listitem'),
  ).toHaveCount(6);
  await expect(choice.getByRole('button', { name: 'Close' })).toBeFocused();
  await shoot(page, 'delete-match-choice', 'phone');

  await choice.getByRole('button', { name: 'Delete Q41 and its 6 entries…' }).click();
  const bill = page.getByRole('dialog', { name: 'Delete Q41 and its 6 entries?' });
  await expect(bill).toContainText('6 entries go, with Q41');
  await expect(bill).toContainText(`Red 1–3 and Blue 1–3, ${EVENT.name}.`);
  const field = bill.getByLabel(/type the name to confirm/i);
  await field.fill('Q4');
  const go = bill.getByRole('button', { name: 'Delete Q41' });
  await expect(go).toBeDisabled();
  await shoot(page, 'delete-match-bill', 'phone');
  await field.fill('Q41');
  await go.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(sent).toEqual([{ match_id: Q41.id, with_entries: true, confirm_name: 'Q41' }]);
  await expect(page.getByRole('button', { name: /^Q41/ })).toHaveCount(0);
});

test('delete: a version’s trash waits offline, like every hard delete', async ({ page }) => {
  await signIn(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/forms');
  const card = page.getByRole('region', { name: 'Match form' });
  await expect(card.getByRole('button', { name: 'Delete version v2' })).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
  });
  await expect(card.getByRole('button', { name: 'Delete version v2' })).toBeDisabled();
});
