import { expect, test } from '@playwright/test';
import { signIn } from './api-mock';
import { matchId, teamId } from './fixtures';
import { shoot } from './shoot';

/**
 * The Entry page (01-entry/final). Q39 · 2630 Thunderbolts sits at Red 1 and has no entry in
 * the fixture, so the page opens empty for the scouter, and the confirm shows the
 * five-minute edit line (a lead or admin, or a re-edit, would not see it).
 */
test('entry: phase tabs, swipe, no-show and the confirm', async ({ page }) => {
  await signIn(page, 'scouter');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/entry/${matchId(39)}/${teamId(2630)}?alliance=red`);
  await expect(page.getByRole('heading', { name: /Q39 · 2630 Thunderbolts/ })).toBeVisible();

  await page.getByRole('radio', { name: 'Played' }).click();
  const plus = page.getByRole('button', { name: 'Auto notes scored plus one' });
  await plus.click();
  await plus.click();
  await page.getByText('Left the starting zone').click();
  await expect(page.getByText(/Draft saved on this device · \d\d:\d\d/)).toBeVisible();
  await page.getByRole('tab', { name: 'Teleop' }).click();
  await expect(page.getByRole('heading', { name: 'Teleop' })).toBeVisible();
  await expect(page.getByText('Phase 2 of 4')).toBeVisible();
  await shoot(page, 'entry');

  // Phone: a swipe left on the pane goes to the next phase, a swipe right comes back.
  const heading = page.getByRole('heading', { name: 'Teleop' });
  const box = (await heading.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(300, y);
  await page.mouse.down();
  await page.mouse.move(200, y, { steps: 5 });
  await page.mouse.move(150, y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('tab', { name: 'Endgame' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Previous phase: Teleop' }).click();
  await expect(page.getByRole('tab', { name: 'Teleop' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('radio', { name: 'No show' }).click();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByText(/never pulled down by zeros/)).toBeVisible();
  await shoot(page, 'entry-noshow', 'phone');

  // Back to Played, so the confirm lists every field by phase.
  await page.getByRole('radio', { name: 'Played' }).click();
  await page.getByRole('button', { name: 'Review entry' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm this entry' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Q39 · 2630 Thunderbolts');
  await expect(dialog).toContainText('You can still edit it for 5 minutes after submitting.');
  await shoot(page, 'entry-confirm');
});
