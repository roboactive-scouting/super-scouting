import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { FIXTURE, FORM, matchId, teamId } from './fixtures';
import { shoot } from './shoot';

/**
 * Phase 1 H side task 3: an option button's label wraps only between words, never inside one.
 * "Parked" beside its ✓ in a four-column group broke as "Park / ed"; now the whole group drops to
 * two columns when its longest word does not fit at four (measured), and a group whose words fit
 * keeps four. The entry's end-game group holds "Parked", "Defense" and a Hebrew label.
 */

const T0 = '2026-01-10T08:00:00.000Z';
const id = (n: number) => `0000000a-0000-4000-8000-${String(950 + n).padStart(12, '0')}`;

const options = (labels: Record<string, string>) => ({
  options: Object.entries(labels).map(([value, label]) => ({ value, label })),
});

const SEEDS = [
  {
    key: 'auto_high',
    label: 'Pieces scored high',
    type: 'counter',
    phase: 'auto',
    unit: 'count',
    config: { min: 0, step: 1 },
  },
  {
    key: 'end_state',
    label: 'End game',
    type: 'single_select',
    phase: 'endgame',
    unit: 'enum',
    config: options({
      park: 'Parked',
      defense: 'Defense',
      deep: 'Deep climb',
      partial: 'חנייה חלקית',
    }),
  },
  {
    key: 'end_fouls',
    label: 'Fouls drawn',
    type: 'single_select',
    phase: 'endgame',
    unit: 'enum',
    config: options({ '0': '0', '1': '1', '2': '2', '3': '3+' }),
  },
] as const;

const FIELDS = SEEDS.map((s, i) => ({
  id: id(i + 1),
  form_version_id: FORM.version_id,
  key: s.key,
  label: s.label,
  help_text: null,
  type: s.type,
  section: null,
  display_order: i + 1,
  required: false,
  default_value: null,
  config: s.config,
  visibility_condition: null,
  deprecated: false,
  description: `${s.label} (fixture)`,
  unit: s.unit,
  phase: s.phase,
  direction: 'higher_is_better',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
  created_at: T0,
  updated_at: T0,
}));

const PULL = {
  ...FIXTURE.pull,
  entities: { ...FIXTURE.pull.entities, form_fields: FIELDS, scoring_rules: [] },
};

/**
 * Every word of every label in `group`, each with the number of line boxes it is drawn on: a word
 * split across two lines has two client rects.
 */
async function wordLines(group: Locator) {
  return group.evaluate((el) => {
    const out: { word: string; lines: number }[] = [];
    for (const span of el.querySelectorAll<HTMLElement>('label > span[dir="auto"]')) {
      const node = span.firstChild!;
      const text = node.textContent!;
      for (const m of text.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, m.index!);
        range.setEnd(node, m.index! + m[0].length);
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        out.push({ word: m[0], lines: tops.size });
      }
    }
    return out;
  });
}

/** How many cards sit on the group's first row. */
const firstRow = (group: Locator) =>
  group.evaluate((el) => {
    const tops = [...el.querySelectorAll('label')].map((l) =>
      Math.round(l.getBoundingClientRect().top),
    );
    return tops.filter((t) => t === tops[0]).length;
  });

async function noWordSplit(page: Page, group: Locator, labels: string[]) {
  // Every option chosen in turn: whichever card wears the ✓, its words stay whole.
  for (const label of labels) {
    await group.getByRole('radio', { name: label }).locator('..').click();
    await expect(group.locator('[data-chosen-mark]')).toHaveCount(1);
    const words = await wordLines(group);
    expect(words.length).toBeGreaterThan(0);
    for (const w of words)
      expect(w, `${label} chosen: "${w.word}" on one line`).toEqual({ word: w.word, lines: 1 });
  }
}

test('option labels never split a word: Parked, Defense and Hebrew at 375 and 1440', async ({
  page,
}) => {
  test.slow();
  await signIn(page, 'scouter', { overrides: { 'sync/pull': PULL } });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/entry/${matchId(39)}/${teamId(2630)}?alliance=red`);
  await page.getByRole('radio', { name: 'Played' }).click();
  await page.getByRole('tab', { name: 'Endgame' }).click();

  const endGame = page.getByRole('group', { name: 'End game' });
  const fouls = page.getByRole('group', { name: 'Fouls drawn' });
  const endLabels = ['Parked', 'Defense', 'Deep climb', 'חנייה חלקית'];
  const foulLabels = ['0', '1', '2', '3+'];

  // A phone: no word split, whichever option is chosen.
  await noWordSplit(page, endGame, endLabels);
  await noWordSplit(page, fouls, foulLabels);

  // A computer: the 440 px control column. "Defense" beside its ✓ does not fit a quarter of it,
  // so the whole end-game group takes two columns; the fouls' short words keep four.
  await page.setViewportSize({ width: 1440, height: 900 });
  await noWordSplit(page, endGame, endLabels);
  await expect(endGame.locator('[data-option-grid]')).toHaveAttribute('data-fit', '2');
  expect(await firstRow(endGame)).toBe(2);
  await expect(fouls.locator('[data-option-grid]')).toHaveAttribute('data-fit', '4');
  expect(await firstRow(fouls)).toBe(4);

  // The selected state in the shots: Parked (the word that used to break) and 3+.
  await endGame.getByRole('radio', { name: 'Parked' }).locator('..').click();
  await fouls.getByRole('radio', { name: '3+' }).locator('..').click();
  await shoot(page, 'option-labels-endgame', undefined, { long: true });
});
