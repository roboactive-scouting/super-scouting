import { expect, test } from '@playwright/test';
import { goOffline, mockApi, signIn } from './api-mock';
import { TEST_PASSWORD, userByName } from './fixtures';
import { shoot } from './shoot';

const SCOUTER = userByName('yael.s').username;

test('login: empty, at both widths', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Forgot it? Ask an admin to reset it.')).toBeVisible();
  await shoot(page, 'login');
});

test('login: a wrong password shows the error line', async ({ page }) => {
  await mockApi(page, {
    overrides: { login: { status: 401, code: 'unauthorized', message: 'invalid credentials' } },
  });
  await page.goto('/login');
  await page.getByLabel('Username').fill(SCOUTER);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('That username and password do not match.');
  await shoot(page, 'login-error', 'phone');
});

test('login: offline says so and uses the cached accounts', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login');
  await goOffline(page);
  await expect(page.getByText('No connection. Signing in will use the credentials')).toBeVisible();
  await shoot(page, 'login-offline', 'phone');
});

test('change password: forced after sign-in, no way back', async ({ page }) => {
  await mockApi(page, { role: 'scouter', mustChange: true });
  await page.goto('/login');
  await page.getByLabel('Username').fill(SCOUTER);
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/change-password');
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to scouting' })).toHaveCount(0);
  await page.getByLabel('Current password', { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill('orbit-cedar-42');
  await page.getByLabel('Confirm new password', { exact: true }).fill('orbit-cedar-42');
  await expect(page.getByRole('listitem').filter({ hasText: 'match' })).toHaveAttribute(
    'data-state',
    'ok',
  );
  await shoot(page, 'password-forced', 'phone');
});

test('change password: by choice, a mismatch is caught while typing', async ({ page }) => {
  await signIn(page, 'scouter');
  await page.goto('/change-password');
  await expect(page.getByRole('heading', { name: 'Change your password' })).toBeVisible();
  await page.getByLabel('Current password', { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill('orbit-cedar-42');
  await page.getByLabel('Confirm new password', { exact: true }).fill('orbit-cedar');
  await expect(page.getByRole('listitem').filter({ hasText: 'match' })).toHaveAttribute(
    'data-state',
    'no',
  );
  await expect(page.getByRole('link', { name: 'Back to scouting' })).toBeVisible();
  await shoot(page, 'password');
});

test('login: an expired session keeps the name and says nothing is lost', async ({ page }) => {
  // The server finds the token dead on the next authenticated call (here: the season list
  // behind Switch competition); the session is expired, the user kept.
  await signIn(page, 'scouter', {
    overrides: { listSeasons: { status: 401, code: 'unauthorized', message: 'token expired' } },
  });
  const dead = page.waitForResponse((r) => r.url().includes('listSeasons') && r.status() === 401);
  await page.getByRole('button', { name: 'Switch competition' }).click();
  await dead;
  // The app keeps working on an expired session (offline-first); sign-in is where it says so.
  await expect
    .poll(async () => {
      await page.goto('/login');
      // Sign in, or Home when the expiry is not stored yet: either way a page has settled.
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      return page.getByText(/Your sign-in expired/).isVisible();
    })
    .toBe(true);
  await expect(page.getByLabel('Username')).toHaveValue(SCOUTER);
  await shoot(page, 'login-expired');
});
