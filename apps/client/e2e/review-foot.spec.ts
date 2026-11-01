import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './api-mock';
import { FIXTURE, FORM, matchId, teamId } from './fixtures';
import { shoot } from './shoot';

/**
 * Phase 1 I side task 1 (plan v1.29): the Review sheet's buttons sit on a solid foot. A long
 * entry (30 counters over four phases) is left as a draft on the device and its Review sheet
 * opened, then scrolled halfway: the pinned foot reaches the sheet's bottom edge with nothing
 * under it, wears its `--line` hairline while answers pass under it, and at the end of the list
 * the last answer sits wholly above it. The foot is the shared surface's (`Sheet` / `Dialog`
 * `foot`), so the phone sheet and the computer dialog are both checked.
 */

const T0 = '2026-01-10T08:00:00.000Z';
const id = (n: number) => `0000000a-0000-4000-8000-${String(1200 + n).padStart(12, '0')}`;

const SIZES = {
  phone: { width: 375, height: 812 },
  desktop: { width: 1440, height: 900 },
} as const;

const PHASES = [
  ['auto', 'Auto', 8],
  ['teleop', 'Teleop', 12],
  ['endgame', 'Endgame', 6],
  ['post_match', 'After', 4],
] as const;

const SEEDS = PHASES.flatMap(([phase, name, count]) =>
  Array.from({ length: count }, (_, i) => ({
    key: `${phase}_${i + 1}`,
    label: `${name} count ${i + 1}`,
    phase,
  })),
);

const FIELDS = SEEDS.map((s, i) => ({
  id: id(i + 1),
  form_version_id: FORM.version_id,
  key: s.key,
  label: s.label,
  help_text: null,
  type: 'counter',
  section: null,
  display_order: i + 1,
  required: false,
  default_value: null,
  config: { min: 0, step: 1 },
  visibility_condition: null,
  deprecated: false,
  description: `${s.label} (fixture)`,
  unit: 'count',
  phase: s.phase,
  direction: 'neutral',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
  created_at: T0,
  updated_at: T0,
}));

const PULL = {
  ...FIXTURE.pull,
  entities: {
    ...FIXTURE.pull.entities,
    forms: FIXTURE.pull.entities.forms.map((f) => ({ ...f, timer_config: { phases: [] } })),
    form_fields: FIELDS,
    scoring_rules: [],
  },
};

const DATA = Object.fromEntries(SEEDS.map((s, i) => [s.key, (i * 7) % 11]));
const LAST = SEEDS[SEEDS.length - 1]!.label;

/** Signs in, leaves the long entry as a draft on the device, and opens its Review sheet. */
async function openReview(page: Page) {
  await signIn(page, 'scouter', { overrides: { 'sync/pull': PULL } });
  await page.setViewportSize(SIZES.phone);
  // A page of the app first, so its database exists before the draft is written into it.
  await page.goto('/scout');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await page.evaluate(
    (record) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('robactive-scouting');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('drafts', 'readwrite');
          tx.objectStore('drafts').put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    {
      key: `${FORM.version_id}:${matchId(39)}:${teamId(2630)}`,
      row_id: '',
      payload: { robot_status: 'played', data: DATA, alliance: 'red' },
      updated_at: new Date().toISOString(),
    },
  );
  await page.goto(`/entry/${matchId(39)}/${teamId(2630)}?alliance=red`);
  await page.getByRole('button', { name: 'Review entry' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Confirm this entry' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Scrolls the surface (the dialog element is its own scroller) to `at` of the way down. */
async function scrollTo(dialog: Locator, at: number) {
  await dialog.evaluate((el, f) => {
    el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * f);
    el.dispatchEvent(new Event('scroll'));
  }, at);
}

type Boxes = {
  scrollable: boolean;
  /** The scroller's inner bottom edge (its padding box), in viewport px. */
  edge: number;
  foot: { top: number; bottom: number; left: number; right: number; background: string };
  /** The scroller's inner left and right edges. */
  sides: [number, number];
  stuck: boolean;
  /** Probe points from the foot's top to the scroller's edge that hit the foot, and that hit
   * anything else inside the surface (an answer showing through). Points outside the surface (its
   * rounded corners) count as neither. */
  covered: number;
  through: string[];
  /** The last answer row's bottom. */
  lastRow: number;
};

async function measure(dialog: Locator, last: string): Promise<Boxes> {
  return dialog.evaluate((el, label) => {
    const foot = el.querySelector<HTMLElement>('[data-surface-foot]')!;
    const scroller = el.getBoundingClientRect();
    const edge = scroller.top + el.clientTop + el.clientHeight;
    const f = foot.getBoundingClientRect();
    let covered = 0;
    const through: string[] = [];
    for (let y = Math.ceil(f.top) + 1; y < edge - 0.5; y += 2) {
      for (const x of [scroller.left + 4, scroller.left + scroller.width / 2, scroller.right - 6]) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !el.contains(hit)) continue;
        if (hit.closest('[data-surface-foot]') === foot) covered++;
        else through.push(`${Math.round(x)},${y}: ${hit.textContent?.slice(0, 30) ?? hit.tagName}`);
      }
    }
    const row = [...el.querySelectorAll('*')].find(
      (n) => n.children.length === 0 && n.textContent === label,
    ) as HTMLElement;
    const line = row.closest('div, li, tr') as HTMLElement;
    const style = getComputedStyle(foot);
    return {
      scrollable: el.scrollHeight > el.clientHeight + 1,
      edge,
      sides: [scroller.left + el.clientLeft, scroller.left + el.clientLeft + el.clientWidth] as [
        number,
        number,
      ],
      foot: {
        top: f.top,
        bottom: f.bottom,
        left: f.left,
        right: f.right,
        background: style.backgroundColor,
      },
      stuck: foot.dataset.stuck === 'true',
      covered,
      through,
      lastRow: line.getBoundingClientRect().bottom,
    };
  }, last);
}

test('review entry: the buttons sit on a solid foot, flush with the bottom edge', async ({
  page,
}) => {
  test.slow();
  const dialog = await openReview(page);
  for (const width of ['phone', 'desktop'] as const) {
    await page.setViewportSize(SIZES[width]);
    await expect(dialog.getByText(LAST, { exact: true })).toBeAttached();

    // Halfway down: answers are under the foot, and none of them shows below or beside the
    // buttons. The foot's box reaches the scroller's bottom edge, with nothing under it.
    await scrollTo(dialog, 0.5);
    await expect(dialog.locator('[data-surface-foot]')).toHaveAttribute('data-stuck', 'true');
    const mid = await measure(dialog, LAST);
    expect(mid.scrollable, `${width}: the long entry scrolls`).toBe(true);
    expect(Math.abs(mid.foot.bottom - mid.edge), `${width}: foot to the edge`).toBeLessThan(0.5);
    expect(mid.foot.background, `${width}: the foot is painted`).not.toMatch(
      /rgba\(0, 0, 0, 0\)|transparent/,
    );
    expect(Math.abs(mid.foot.left - mid.sides[0]), `${width}: foot to the left edge`).toBeLessThan(
      0.5,
    );
    expect(
      Math.abs(mid.foot.right - mid.sides[1]),
      `${width}: foot to the right edge`,
    ).toBeLessThan(0.5);
    expect(mid.covered).toBeGreaterThan(0);
    expect(mid.through, `${width}: nothing shows under or beside the buttons`).toEqual([]);

    // The end of the list: the last answer wholly above the foot, still flush with the edge,
    // and no hairline, since nothing passes under it.
    await scrollTo(dialog, 1);
    await expect(dialog.locator('[data-surface-foot]')).toHaveAttribute('data-stuck', 'false');
    const end = await measure(dialog, LAST);
    expect(end.lastRow, `${width}: last answer above the foot`).toBeLessThanOrEqual(
      end.foot.top + 0.5,
    );
    expect(Math.abs(end.foot.bottom - end.edge), `${width}: foot to the edge`).toBeLessThan(0.5);

    await shoot(page, 'review-foot-scrolled', width, {
      before: async () => {
        await expect(dialog.getByText(LAST, { exact: true })).toBeAttached();
        await scrollTo(dialog, 0.5);
      },
    });
  }
});
