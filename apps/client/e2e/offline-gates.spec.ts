import { expect, test, type Page } from '@playwright/test';
import { goOffline, signIn } from './api-mock';
import { SEASONS_WITH_2027 } from './formFixtures';
import { MATCHES } from './fixtures';
import { shoot } from './shoot';

/*
 * SPEC-FINAL 9.6 (task 1.45): every server-only action is held offline, and the screen says
 * once that the data is safe on this device. Each screen whose offline look changed, offline,
 * at the widths it exists at, in every theme (shoot() takes Light and Outdoor by itself).
 */

const SAFE = /safe on this device/;
/** components/OfflineGate.tsx's line, the plan's sentence verbatim. */
const OFFLINE_GATE_LINE =
  'This needs a connection. Everything you have entered is safe on this device and will sync when you are back online.';

async function admin(page: Page, path: string, width = 1440, height = 900, overrides = {}) {
  await signIn(page, 'admin', { overrides });
  await page.setViewportSize({ width, height });
  await page.goto(path);
}

test('users offline: the list stays, every action waits, under the needs-the-server state', async ({
  page,
}) => {
  await admin(page, '/admin/users');
  await expect(page.getByRole('row', { name: /Yael Shapira/ })).toBeVisible();
  await goOffline(page);
  await expect(page.getByText(OFFLINE_GATE_LINE)).toBeVisible();
  await expect(page.getByText(SAFE)).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'This needs the server' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a user' })).toBeDisabled();
  await shoot(page, 'users-offline', 'desktop');
});

test('user offline: every section waits, under the needs-the-server state', async ({ page }) => {
  await admin(page, '/admin/users');
  await page.getByRole('link', { name: 'Yael Shapira' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Yael Shapira' })).toBeVisible();
  await goOffline(page);
  await expect(page.getByText(OFFLINE_GATE_LINE)).toBeVisible();
  await expect(page.getByText(SAFE)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Save name' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Reset password' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Disable account' })).toBeDisabled();
  await shoot(page, 'user-offline', 'desktop');
});

test('manage offline: Competitions and Matches hold every change; the line says the data is safe', async ({
  page,
}) => {
  await admin(page, '/admin/manage', 1440, 900, {
    listMatches: { items: MATCHES.slice(0, 10), next_cursor: null },
  });
  // The Matches tab first: an off-roster team's number is read from the server while online.
  await page.getByRole('tab', { name: /Matches/ }).click();
  await expect(page.getByRole('button', { name: 'Add 7845 to the roster' })).toBeEnabled();
  await goOffline(page);
  await expect(page.getByRole('button', { name: 'Create matches' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add 7845 to the roster' })).toBeDisabled();
  await shoot(page, 'manage-matches-offline', 'desktop');

  await page.getByRole('tab', { name: 'Competitions' }).click();
  await expect(page.getByText(/^No connection — changes cannot be saved/)).toContainText(
    'Your data is safe on this device.',
  );
  await expect(page.getByRole('button', { name: 'New season' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '+ New event' })).toBeDisabled();
  // One offline line on Competitions: the page's (task 1.45 follow-up).
  await expect(page.getByText(SAFE)).toHaveCount(1);
  await expect(page.getByText(/Changing the active season or event/)).toHaveCount(0);
  await shoot(page, 'manage-offline', 'desktop');
});

test('manage on a phone offline: Add matches waits; the line says the data is safe', async ({
  page,
}) => {
  await admin(page, '/admin/manage', 375, 812, {
    listMatches: { items: MATCHES.slice(0, 10), next_cursor: null },
  });
  await expect(page.getByRole('button', { name: /^Q10/ })).toBeVisible();
  await goOffline(page);
  await expect(page.getByText(SAFE)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Add matches' })).toBeDisabled();
  await shoot(page, 'manage-phone-offline', 'phone');
});

test('forms offline: every card action waits, under the needs-the-server state', async ({
  page,
}) => {
  await admin(page, '/admin/forms', 1440, 900, {
    listSeasons: { items: SEASONS_WITH_2027, next_cursor: null },
  });
  const card = page.getByRole('region', { name: 'Match form' });
  await expect(card.getByRole('button', { name: 'Restore v2' })).toBeVisible();
  await goOffline(page);
  await expect(page.getByText(OFFLINE_GATE_LINE)).toBeVisible();
  await expect(page.getByText(SAFE)).toHaveCount(1);
  await expect(card.getByRole('button', { name: 'Restore v2' })).toBeDisabled();
  await expect(card.getByRole('button', { name: 'Export' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Create super form' })).toBeDisabled();
  await shoot(page, 'forms-offline', 'desktop');
});

test('switch competition offline: only the default, with the line that the data is safe', async ({
  page,
}) => {
  await signIn(page, 'lead');
  await page.getByRole('button', { name: 'Switch competition' }).click();
  const sheet = page.getByRole('dialog', { name: 'Switch competition' });
  await expect(sheet.getByRole('button', { name: /District #1 · Haifa/ })).toBeVisible();
  await goOffline(page);
  await expect(sheet.getByText(/only the default competition is available offline/i)).toContainText(
    'Your data is safe on this device.',
  );
  await expect(sheet.getByRole('button', { name: /District #1 · Haifa/ })).toBeDisabled();
  await shoot(page, 'home-switch-offline');
});
