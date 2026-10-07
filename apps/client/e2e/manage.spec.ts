import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { shoot } from './shoot';

/** Manage on a computer, as the admin, on the fixture's 2026 season (District #3 default). */
async function openManage(page: Page) {
  await signIn(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/manage');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Season and event management' }),
  ).toBeVisible();
}

test('manage: Competitions — season chips, the season card and the event cards', async ({
  page,
}) => {
  await openManage(page);
  await expect(page.getByRole('tab', { name: /Teams & roster 22/ })).toBeVisible();
  const chips = page.getByRole('group', { name: 'Seasons' });
  await expect(chips.getByRole('button', { name: '2026 REBUILT · Active' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '2026 — REBUILT' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(5);
  await expect(
    page.getByRole('article').filter({ hasText: 'District #3 · Tel Aviv' }),
  ).toContainText('Default event');
  await shoot(page, 'manage-competitions', 'desktop');
});

test('manage: Teams & roster — the one-field add, roster cards and the registry', async ({
  page,
}) => {
  await openManage(page);
  await page.getByRole('tab', { name: /Teams & roster/ }).click();
  await expect(page.getByText('Working on')).toContainText(
    'Working on District #3 · Tel Aviv (default) · 2026',
  );
  await expect(page.getByLabel('Event')).toHaveValue(/.+/);
  await expect(page.getByRole('combobox', { name: 'Add a team to the roster' })).toBeVisible();
  await expect(page.getByText('22 teams · click a name to rename')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add 7845 Rogue Robotics to the roster' }),
  ).toBeVisible();
  await shoot(page, 'manage-roster', 'desktop');
});

test('manage: delete an event — the counts, the name typed back, then it is gone', async ({
  page,
}) => {
  await signIn(page, 'admin', {
    overrides: { deleteEvent: { deleted: false, events: 1, matches: 10, entries: 64, forms: 0 } },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/manage');
  await page.getByRole('button', { name: 'Rename District #1 · Haifa' }).click();
  await page.getByRole('button', { name: 'Delete District #1 · Haifa' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete this event?' });
  await expect(confirm).toContainText('This deletes 10 matches and 64 entries for good.');
  await expect(confirm).toContainText('supabase db dump');
  const go = confirm.getByRole('button', { name: 'Delete District #1 · Haifa for good' });
  await expect(go).toHaveAttribute('aria-disabled', 'true');
  await confirm.getByLabel(/Type District #1/).fill('District #1 · Haifa');
  await expect(go).not.toHaveAttribute('aria-disabled');
  await shoot(page, 'manage-delete', 'desktop');
  await go.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(4);
});
