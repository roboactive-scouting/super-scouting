import { expect, test, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { MATCHES } from './fixtures';
import { shoot } from './shoot';
import { touchDrag } from './touch';

/**
 * Manage → Matches (RB.17): the typed line-up grid on a desktop, and the matches-only view
 * on a phone. The finals show Q1–Q10, so the event's list is cut to those ten.
 */
const TEN_MATCHES = {
  overrides: { listMatches: { items: MATCHES.slice(0, 10), next_cursor: null } },
};

async function openManage(page: Page, width: number, height: number) {
  await signIn(page, 'admin', TEN_MATCHES);
  await page.setViewportSize({ width, height });
  await page.goto('/admin/manage');
}

test('manage matches, desktop: toolbar, problem summary, typing into Q10', async ({ page }) => {
  await openManage(page, 1440, 900);
  await page.getByRole('tab', { name: /Matches/ }).click();
  await expect(page.getByText('Q7 and Q10 are missing robots')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add 7845 to the roster' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Q8 Red 2' })).toHaveValue('7845');
  await page.getByLabel('How many qualification matches?').fill('72');
  const red3 = page.getByRole('combobox', { name: 'Q10 Red 3' });
  await red3.click();
  await red3.pressSequentially('6');
  await expect(page.getByRole('option', { name: /6230 Team Koi/ })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await shoot(page, 'manage', 'desktop');

  // The ✎ on a row opens the match's edit dialog (Manage final; RB.19: shot for the review).
  // Q10 Red 3 back to empty first: a half-typed "6" would be committed (and refused) on blur.
  await red3.fill('');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Edit match 7 (qualification)' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Q7' });
  await expect(edit).toBeVisible();
  await shoot(page, 'manage-edit', 'desktop');
});

test('manage matches, phone: list, edit sheet, add sheet', async ({ page }) => {
  await openManage(page, 375, 812);
  await expect(page.getByRole('heading', { name: 'Matches' })).toBeVisible();
  await expect(page.getByText('This needs a computer')).toHaveCount(0);
  const q10 = page.getByRole('button', { name: /^Q10/ });
  await expect(q10).toContainText('4 empty');
  await shoot(page, 'manage-phone-list', 'phone', { long: true });

  await q10.click();
  const edit = page.getByRole('dialog', { name: 'Edit Q10' });
  const red3 = edit.getByRole('combobox', { name: 'Red 3' });
  await red3.click();
  await red3.pressSequentially('62');
  await expect(edit.getByText('1 on the roster')).toBeVisible();
  await shoot(page, 'manage-phone-edit', 'phone');

  await page.keyboard.press('Escape'); // the suggestion list
  await page.keyboard.press('Escape'); // the sheet
  await expect(edit).toHaveCount(0);
  await page.getByRole('button', { name: 'Add matches' }).click();
  const add = page.getByRole('dialog', { name: 'Add matches' });
  await add.getByLabel('How many qualification matches?').fill('72');
  await expect(add.getByRole('button', { name: 'Create 72 matches' })).toBeVisible();
  await shoot(page, 'manage-phone-add', 'phone');
});

test("manage matches, desktop: the phone's match-type filter above the grid", async ({ page }) => {
  // Two practice matches beside the ten qualification ones, so the filter has something to show.
  const practice = MATCHES.slice(0, 2).map((m, i) => ({
    ...m,
    // A uuid of its own (the mock checks every answer against its schema).
    id: m.id.replace(/^0/, '9'),
    match_type: 'practice' as unknown as 'qualification',
    number: i + 1,
  }));
  await signIn(page, 'admin', {
    overrides: {
      listMatches: { items: [...practice, ...MATCHES.slice(0, 10)], next_cursor: null },
    },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/manage');
  await page.getByRole('tab', { name: /Matches/ }).click();
  const filter = page.getByRole('radiogroup', { name: 'Show matches' });
  await expect(filter.getByRole('radio', { name: 'Qualification' })).toBeChecked();
  await expect(page.getByRole('group', { name: 'Q1', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'P1', exact: true })).toHaveCount(0);
  await filter.getByRole('radio', { name: 'Practice' }).click();
  await expect(page.getByRole('group', { name: 'P1', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'P2', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Q1', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Match type')).toHaveValue('practice');
  await shoot(page, 'manage-filter', 'desktop');
});

test('manage matches, phone: the edit sheet fits, opens at the top, focuses nothing, drags closed', async ({
  page,
}) => {
  await openManage(page, 375, 812);
  await page.getByRole('button', { name: /^Q7/ }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Q7' });
  await expect(edit).toBeVisible();
  await shoot(page, 'manage-phone-edit-open', 'phone');
  const state = await edit.evaluate((panel) => ({
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    panelOverflow: panel.scrollWidth - panel.clientWidth,
    panelRight: Math.round(panel.getBoundingClientRect().right),
    scrollTop: panel.scrollTop,
    active: document.activeElement?.tagName,
    activeIsPanel: document.activeElement === panel,
  }));
  expect(state).toEqual({
    pageOverflow: 0,
    panelOverflow: 0,
    panelRight: 375,
    scrollTop: 0,
    active: 'DIV',
    activeIsPanel: true,
  });
  // A drag down from the sheet's body (not only its handle) closes it: no field holds focus.
  await touchDrag(page, edit.getByText('Line-up · type a team number'), { dy: 240 });
  await expect(edit).toHaveCount(0);
});
