import { expect, test, type Page } from '@playwright/test';
import { signIn, type MockOptions } from './api-mock';
import { EVENTS } from './fixtures';
import { shoot } from './shoot';

/** Manage on a computer, as the admin, on the fixture's 2026 season (District #3 default). */
async function openManage(page: Page, opts: Omit<MockOptions, 'role'> = {}) {
  await signIn(page, 'admin', opts);
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
  await expect(page.getByRole('button', { name: /^Move .*/ })).toHaveCount(5);
  await expect(page.getByRole('button', { name: /^Move .* (up|down)$/ })).toHaveCount(0);
  await shoot(page, 'manage-competitions', 'desktop');
});

test('manage: Competitions — an event moves by its grip, by keyboard and by pointer', async ({
  page,
}) => {
  const sent: string[][] = [];
  await openManage(page, {
    overrides: {
      reorderEvents: (input: Record<string, unknown>) => {
        const ids = input.event_ids as string[];
        sent.push(ids);
        return {
          items: ids.map((id, i) => ({ ...EVENTS.find((e) => e.id === id)!, sort_order: i + 1 })),
        };
      },
    },
  });
  const names = () => page.getByRole('article').locator('h3').allTextContents();
  const [haifa, beerSheva, , , championship] = EVENTS.map((e) => e.id);

  // Keyboard: Space picks up, an arrow moves (the cards are a three-column grid), Space drops.
  const haifaGrip = page.getByRole('button', { name: 'Move District #1 · Haifa' });
  await haifaGrip.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]!.slice(0, 2)).toEqual([beerSheva, haifa]);
  await expect
    .poll(names)
    .toEqual([
      "District #2 · Be'er Sheva",
      'District #1 · Haifa',
      'District #3 · Tel Aviv',
      'District #4 · Jerusalem',
      'Israel Championship',
    ]);
  await expect(haifaGrip).toBeFocused();
  await expect(haifaGrip).toHaveAttribute('aria-disabled', 'false');

  // Pointer: the last card's grip dragged onto the first card.
  const from = (await page
    .getByRole('button', { name: 'Move Israel Championship' })
    .boundingBox())!;
  const to = (await page.getByRole('article').first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]![0]).toBe(championship);
  await expect.poll(async () => (await names())[0]).toBe('Israel Championship');
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
