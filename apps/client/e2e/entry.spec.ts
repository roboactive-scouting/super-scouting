import { expect, test } from '@playwright/test';
import { signIn } from './api-mock';
import { matchId, teamId } from './fixtures';
import { shoot } from './shoot';
import { touchDrag } from './touch';

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

  // Phone: a swipe left on the pane goes to the next phase, a pager tap comes back.
  await touchDrag(page, page.getByRole('heading', { name: 'Teleop' }), { dx: -160 });
  await expect(page.getByRole('tab', { name: 'Endgame' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Previous phase: Teleop' }).click();
  await expect(page.getByRole('tab', { name: 'Teleop' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('radio', { name: 'No show' }).click();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByText(/never pulled down by zeros/)).toBeVisible();
  await shoot(page, 'entry-noshow', 'phone');

  // Broke down keeps the phases and adds the breakdown time (Entry final, phone frame 3).
  await page.getByRole('radio', { name: 'Broke down' }).click();
  await expect(page.getByLabel('Breakdown time (seconds from match start)')).toBeVisible();
  await shoot(page, 'entry-brokedown', 'phone');

  // Back to Played, so the confirm lists every field by phase.
  await page.getByRole('radio', { name: 'Played' }).click();
  await page.getByRole('button', { name: 'Review entry' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm this entry' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Q39 · 2630 Thunderbolts');
  await expect(dialog).toContainText('You can still edit it for 5 minutes after submitting.');
  await shoot(page, 'entry-confirm');
});

/**
 * UF.5: on a phone the whole page takes the phase swipe, the empty space below a short phase
 * too, with the pane following the finger (motion allowed here); a vertical drag scrolls and
 * a tap on a counter still counts.
 */
test('entry: a swipe on the empty page below the form changes phase', async ({ page }) => {
  await signIn(page, 'scouter');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`/entry/${matchId(39)}/${teamId(2630)}?alliance=red`);
  await page.getByRole('radio', { name: 'Played' }).click();
  await page.getByRole('tab', { name: 'Endgame' }).click();
  const selected = (name: string) => page.getByRole('tab', { name, selected: true });
  await expect(selected('Endgame')).toBeVisible();

  // Endgame is one field: a point halfway between the pane's foot and the Review entry bar
  // is on nothing but the page.
  const foot = (await page.getByText('swipe to change phase').boundingBox())!;
  const bar = (await page.getByRole('button', { name: 'Review entry' }).boundingBox())!;
  expect(bar.y - (foot.y + foot.height)).toBeGreaterThan(100);
  const empty = { x: 187, y: (foot.y + foot.height + bar.y) / 2 };
  const onBlank = await page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.closest('button, label, input, [role="tabpanel"]') ?? null,
    empty,
  );
  expect(onBlank).toBeNull();

  await touchDrag(page, empty, { dx: -170 });
  await expect(selected('Notes')).toBeVisible();
  await touchDrag(page, empty, { dx: 170 });
  await expect(selected('Endgame')).toBeVisible();
  // short of the threshold, slowly: springs back
  await touchDrag(page, empty, { dx: -60, steps: 12, stepMs: 40 });
  await expect(selected('Endgame')).toBeVisible();
  // mostly vertical: not a phase change
  await touchDrag(page, empty, { dx: -40, dy: -160 });
  await expect(selected('Endgame')).toBeVisible();

  // A tap on a counter still counts.
  await page.getByRole('tab', { name: 'Auto' }).click();
  await touchDrag(page, page.getByRole('button', { name: 'Auto notes scored plus one' }), {
    steps: 1,
  });
  await expect(page.getByLabel('Auto notes scored value')).toHaveText('1');

  // The review sheet closes on a drag down (UF.4), back to the form.
  await page.getByRole('button', { name: 'Review entry' }).click();
  const sheet = page.getByRole('dialog', { name: 'Confirm this entry' });
  await expect(sheet).toBeVisible();
  await touchDrag(page, sheet.getByRole('heading', { name: 'Confirm this entry' }), { dy: 220 });
  await expect(sheet).toBeHidden();
  await expect(page.getByLabel('Auto notes scored value')).toHaveText('1');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await shoot(page, 'entry-auto', 'phone');
});

/**
 * UF.18: the option buttons lay out by their own width. The Endgame climb select has four
 * options: two columns on a phone, four on a tablet held upright and on a wide computer; two on
 * a small desktop (1100 px), where the entry's main column is narrower than on the tablet. The
 * ✓ of the chosen one is clear of its card's edge, and a tap shows no focus ring.
 */
test('entry: a four-option select at phone, tablet and desktop widths', async ({ page }) => {
  await signIn(page, 'scouter');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`/entry/${matchId(39)}/${teamId(2630)}?alliance=red`);
  await page.getByRole('radio', { name: 'Played' }).click();
  await page.getByRole('tab', { name: 'Endgame' }).click();
  await page.getByText('High rung', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'High rung' })).toBeChecked();
  const cards = page.getByRole('group', { name: /climb/i }).locator('label');
  await expect(cards).toHaveCount(4);
  const columns = async () => {
    const ys = await cards.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    return new Set(ys.map((y) => Math.round(y))).size === 1 ? 4 : 2;
  };
  const chosen = page.locator('label', { has: page.getByRole('radio', { name: 'High rung' }) });
  const markClear = async () => {
    const tile = (await chosen.boundingBox())!;
    const mark = (await chosen.locator('[data-chosen-mark]').boundingBox())!;
    return tile.x + tile.width - (mark.x + mark.width);
  };
  expect(await columns()).toBe(4);
  expect(await markClear()).toBeGreaterThanOrEqual(12);
  await expect(chosen).toHaveCSS('outline-style', 'none');
  await shoot(page, 'entry-endgame', 'tablet');

  await page.setViewportSize({ width: 375, height: 812 });
  expect(await columns()).toBe(2);
  expect(await markClear()).toBeGreaterThanOrEqual(12);
  await page.setViewportSize({ width: 1100, height: 800 });
  expect(await columns()).toBe(2);
  expect(await markClear()).toBeGreaterThanOrEqual(12);
  await shoot(page, 'entry-endgame', 'small');
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await columns()).toBe(4);
  expect(await markClear()).toBeGreaterThanOrEqual(12);
  await shoot(page, 'entry-endgame');
});
