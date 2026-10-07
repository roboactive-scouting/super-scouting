import { expect, test } from '@playwright/test';
import { signIn } from './api-mock';
import { shoot } from './shoot';

/** What `createUser` answers for the design's new account. */
const GAL = {
  id: '00000000-0000-4000-8000-0000000000aa',
  username: 'gal.l',
  full_name: 'Gal Levy',
  role: 'scouter',
  must_change_password: true,
  disabled_at: null,
  created_at: '2026-10-07T09:00:00.000Z',
};

/** The design's password, typed rather than generated so the pictures repeat. */
const PASSWORD = 'orbit-cedar-42';

test('users: one table, chips with counts, quick actions on hover', async ({ page }) => {
  await signIn(page, 'admin', { overrides: { createUser: GAL } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All 11' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scouters 7' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disabled 1' })).toBeVisible();
  const yael = page.getByRole('row', { name: /Yael Shapira/ });
  await expect(yael).toContainText('52');
  await yael.hover();
  await expect(yael.getByRole('button', { name: 'Reset password' })).toBeVisible();
  await shoot(page, 'users', 'desktop');

  await page.getByRole('button', { name: 'Add a user' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a user' });
  await dialog.getByLabel('Full name').fill('Gal Levy');
  await expect(dialog.getByLabel('Username')).toHaveValue('gal.l');
  await expect(dialog.getByRole('radio', { name: /Scouter/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await dialog.getByLabel('Initial password').fill(PASSWORD);
  await shoot(page, 'users-add', 'desktop');

  await dialog.getByRole('button', { name: 'Add user' }).click();
  await expect(dialog.getByText('Created Gal Levy · gal.l')).toBeVisible();
  await expect(dialog.getByText(PASSWORD)).toBeVisible();
  await expect(page.getByRole('row', { name: /Gal Levy/ })).toBeAttached();
  await shoot(page, 'users-created', 'desktop');
});

test('users: a phone gets the needs-a-computer panel', async ({ page }) => {
  await signIn(page, 'admin');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: /needs a computer/i })).toBeVisible();
  await shoot(page, 'users-gate', 'phone');
});
