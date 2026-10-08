import { expect, test } from '@playwright/test';
import { signIn } from './api-mock';
import { shoot } from './shoot';

test('signs in against the mock and lands on Home', async ({ page }) => {
  await signIn(page, 'lead');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // The ready Home, not the shell's loading state, which also has an h1.
  await expect(page.getByRole('link', { name: 'Scout a match' })).toBeVisible();
  await shoot(page, 'smoke-home');
});
