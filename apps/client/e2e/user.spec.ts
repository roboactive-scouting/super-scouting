import { expect, test } from '@playwright/test';
import { signIn } from './api-mock';
import { userByName } from './fixtures';
import { shoot } from './shoot';

async function open(page: Parameters<typeof signIn>[0], username: string, overrides = {}) {
  await signIn(page, 'admin', { overrides });
  await page.setViewportSize({ width: 1440, height: 900 });
  const { entries: _entries, ...user } = userByName(username);
  await page.goto(`/admin/users/${user.id}`);
  return user;
}

test('user: one column of sections, the role saves on pick', async ({ page }) => {
  const yael = userByName('yael.s');
  const { entries: _entries, ...user } = yael;
  await open(page, 'yael.s', { setUserRole: { ...user, role: 'lead' } });
  await expect(page.getByRole('heading', { level: 1, name: 'Yael Shapira' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Scouter/ })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Generate' })).toBeVisible();
  await shoot(page, 'user', 'desktop');

  await page.getByRole('radio', { name: /Scout lead/ }).click();
  await expect(
    page.getByText('Saved. Yael Shapira is now a lead. It applies from their next request.'),
  ).toBeVisible();
});

test('user: Disable asks first, in the filled-ink confirmation', async ({ page }) => {
  await open(page, 'yael.s');
  await page.getByRole('button', { name: 'Disable account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Disable this account?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Disable Yael Shapira' })).toBeVisible();
  await shoot(page, 'user-disable', 'desktop');
});

test('user: a disabled account shows one box with Enable account', async ({ page }) => {
  await open(page, 'roni.g');
  await expect(page.getByText('This account is disabled since 14/09/2026.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable account' })).toBeVisible();
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
  await shoot(page, 'user-disabled', 'desktop');
});
