import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RankRow } from '@frc/shared';
import { db } from '@/data/db';
import type { Rpc } from '@/data/rpc';
import { sessionOverride } from '@/features/context/sessionOverride';
import { TEAM_ROWS } from '@/test/teamPageFixtures';
import { RankingPage } from './RankingPage';

/*
 * Task 1.58 (SPEC-FINAL 13.5; 27-ranking final, variant N). The plan's test predates the design
 * and task 1.57, so it is adapted (DEVIATIONS "Task 1.58"): the rows carry `number` / `name`,
 * `stddev` and `phase_averages` (the real `rankRow`), the headline column is "Total", the page
 * sits in a router (its rows open team pages), and the group header row above the column
 * headers is hidden from assistive technology, so "51 rows" still holds. Every assertion's intent
 * is kept; the proofs after the plan's eight are the brief's negatives.
 */

const PHASES = ['auto', 'teleop', 'endgame'] as const;

/** 50 teams: Team 1000 the best, Team 1049 with no data at all. */
const rows: RankRow[] = Array.from({ length: 50 }, (_, i) => {
  const none = i === 49;
  const avg = none ? null : 50 - i;
  // Teleop runs against Total for a few teams, so a phase sort really re-orders the list.
  const tele = avg === null ? null : i % 7 === 3 ? avg * 0.9 : avg * 0.5;
  return {
    team_id: `t-${i}`,
    number: 1000 + i,
    name: `Team ${1000 + i}`,
    rank: none ? null : i + 1,
    average_points: avg,
    stddev: none ? null : 2 + (i % 3),
    phase_averages: PHASES.map((phase) => ({
      phase,
      average:
        avg === null || tele === null
          ? null
          : phase === 'teleop'
            ? tele
            : phase === 'auto'
              ? (avg - tele) / 2
              : (avg - tele) / 2,
    })),
    matches_counted: none ? 0 : 10,
    breakdowns: none ? 0 : i % 4,
    no_shows: none ? 0 : i % 5,
    disabled: none ? 0 : i % 6 === 5 ? 1 : 0,
    availability_rate: none ? null : 1 - (i % 5) / 10,
    recent_totals: avg === null ? [] : [avg - 2, avg, avg + 1],
    last_counted_match: none ? null : 30,
  };
});

const rpcFor = (): Rpc & { call: ReturnType<typeof vi.fn> } => ({
  call: vi.fn(async () => ({ event: { id: 'ev-1', name: 'ISR District Event #3' }, rows })),
});

const online = vi.spyOn(navigator, 'onLine', 'get');

function open(rpc: Rpc = rpcFor()) {
  render(
    <MemoryRouter initialEntries={['/ranking']}>
      <RankingPage eventId="ev-1" rpc={rpc} />
    </MemoryRouter>,
  );
  return rpc;
}

const user = () => userEvent.setup();

/** The body rows, in page order, as [team number, rank as shown]. */
function bodyRanks(): [string, string][] {
  // Plain DOM reads (role queries over 50 rows, 16 times over, take seconds in jsdom).
  return [...document.querySelectorAll<HTMLTableRowElement>('table tbody tr')].map((row) => {
    const first = row.cells[0]!;
    const medal = first.querySelector('[role="img"]');
    return [
      row.getAttribute('data-team') ?? '',
      medal?.getAttribute('aria-label') ?? first.textContent ?? '',
    ];
  });
}
const order = () => bodyRanks().map(([team]) => team);

beforeEach(async () => {
  await db.delete();
  await db.open();
  online.mockReturnValue(true);
});
afterEach(() => {
  sessionOverride.clear();
});

describe('RankingPage — the fixed phase 1 table (SPEC-FINAL 13.5)', () => {
  it('lists every team with rank, Total and the reliability figures', async () => {
    open();
    const first = await screen.findByRole('row', { name: /Team 1000/ });
    expect(first).toHaveTextContent('50'); // v1.34: one decimal, a whole number bare (SPEC-FINAL 17.8)
    expect(first).not.toHaveTextContent('50.00');
    expect(within(first).getByLabelText(/breakdowns/i)).toBeInTheDocument();
    expect(within(first).getByLabelText(/availability/i)).toHaveTextContent('100%');
  });

  it('puts a medal on the top three and on nobody else', async () => {
    open();
    expect(await screen.findAllByLabelText(/medal/i)).toHaveLength(3);
    expect(screen.getAllByLabelText(/medal/i).map((m) => m.getAttribute('aria-label'))).toEqual([
      'Medal, rank 1',
      'Medal, rank 2',
      'Medal, rank 3',
    ]);
  });

  it('sorts by a column when its header is clicked, and reverses on a second click', async () => {
    open();
    const header = await screen.findByRole('columnheader', { name: /total/i });
    // Total is the default sort, best first; a click on it reverses it, a second puts it back.
    expect(header).toHaveAttribute('aria-sort', 'descending');
    await user().click(header);
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    await user().click(header);
    expect(header).toHaveAttribute('aria-sort', 'descending');
  });

  it('offers no sort at all on the standard-deviation column', async () => {
    open();
    const header = await screen.findByRole('columnheader', { name: /consistency/i });
    expect(header).not.toHaveAttribute('aria-sort');
    const before = order();
    await user().click(header);
    expect(header).not.toHaveAttribute('aria-sort');
    expect(order()).toEqual(before);
  });

  it('shows an em dash for a team with no qualification entries, never a zero', async () => {
    open();
    const last = await screen.findByRole('row', { name: /Team 1049/ });
    expect(last).toHaveTextContent('—');
    expect(last).not.toHaveTextContent('0.00');
  });

  it('renders every row without pagination for fifty teams', async () => {
    open();
    await screen.findByRole('row', { name: /Team 1049/ });
    expect(screen.getAllByRole('row')).toHaveLength(51);
    // A sticky header (jsdom loads no CSS: the class is what can be read) under the crumb bar.
    expect(document.querySelector('thead')).toHaveClass('min-[1360px]:sticky');
    expect(screen.queryByRole('navigation', { name: /pagination/i })).not.toBeInTheDocument();
  });

  it('computes from the local cache while offline and says the figures are from this device', async () => {
    await db.rows.bulkPut(TEAM_ROWS);
    online.mockReturnValue(false);
    const rpc = open({
      call: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    expect(await screen.findByText(/computed from the data on this device/i)).toBeInTheDocument();
    expect(rpc.call).not.toHaveBeenCalled();
    // The device's own rows: 1690 Orbit is ranked 2nd of the fixture's four (32.3).
    expect(await screen.findByRole('row', { name: /1690 Orbit/ })).toHaveTextContent('32.3');
  });

  it('shows no weighting controls, because they arrive in phase 2', async () => {
    open();
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /weight/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------
// Beyond the plan: the brief's proofs.

async function category(name: 'Scoring' | 'Availability') {
  await user().click(await screen.findByRole('radio', { name: new RegExp(`^${name}`) }));
}

async function openBuilder() {
  await user().click(screen.getByRole('button', { name: /^Sort (Scoring|Availability):/ }));
  return screen.getByRole('dialog', { name: /^Sort (Scoring|Availability) by$/ });
}

const SORTABLE: Record<'Scoring' | 'Availability', RegExp[]> = {
  Scoring: [/^Total/, /^Auto/, /^Teleop/, /^Endgame/],
  Availability: [/^Availability/, /^Breakdowns/, /^No-shows/, /^Disabled/],
};

describe('RankingPage — the rank never moves, no data sorts last (task 1.58)', () => {
  it('keeps every team’s rank under every sort key and both directions, in both categories', async () => {
    open();
    await screen.findByRole('row', { name: /Team 1049/ });
    const canonical = new Map(bodyRanks());
    expect(canonical.get('1000')).toBe('Medal, rank 1');
    expect(canonical.get('1004')).toBe('5');
    expect(canonical.get('1049')).toBe('—');
    const orders = new Set<string>();
    for (const name of ['Scoring', 'Availability'] as const) {
      await category(name);
      for (const pattern of SORTABLE[name]) {
        for (let click = 0; click < 2; click++) {
          // fireEvent, not userEvent: 16 clicks over 50 rows, each read back in full.
          fireEvent.click(screen.getByRole('columnheader', { name: pattern }));
          for (const [team, rank] of bodyRanks()) {
            expect(rank, `${name} ${pattern} click ${click}: ${team}`).toBe(canonical.get(team));
          }
          // A team with no data sorts last whatever the sort.
          expect(order().at(-1), `${name} ${pattern} click ${click}`).toBe('1049');
          orders.add(order().join(','));
        }
      }
    }
    // The sorts really re-ordered the list (the test would pass on a list that never moves).
    expect(orders.size).toBeGreaterThan(5);
  });

  it('keeps the rank and puts no data last under a sort of several figures', async () => {
    open();
    await screen.findByRole('row', { name: /Team 1049/ });
    const canonical = new Map(bodyRanks());
    await category('Availability');
    await user().click(screen.getByRole('columnheader', { name: /^Breakdowns/ }));
    const builder = await openBuilder();
    await user().click(within(builder).getByRole('button', { name: '+ No-shows' }));
    await user().click(within(builder).getByRole('button', { name: '+ Availability' }));
    await user().click(
      within(builder)
        .getByRole('radiogroup', { name: 'No-shows direction' })
        .querySelector('[aria-checked="false"]')!,
    );
    expect(screen.getByRole('button', { name: /^Sort Availability:/ })).toHaveAccessibleName(
      'Sort Availability: Breakdowns, fewest first, then No-shows, most first, then Availability, best first',
    );
    const shown = bodyRanks();
    for (const [team, rank] of shown) expect(rank).toBe(canonical.get(team));
    expect(order().at(-1)).toBe('1049');
    // Breakdowns fewest first, ties by most no-shows, then best availability, then rank.
    const byTeam = new Map(rows.map((r) => [String(r.number), r]));
    const listed = order()
      .slice(0, -1)
      .map((n) => byTeam.get(n)!);
    for (let i = 1; i < listed.length; i++) {
      const a = listed[i - 1]!;
      const b = listed[i]!;
      expect(a.breakdowns <= b.breakdowns).toBe(true);
      if (a.breakdowns === b.breakdowns) expect(a.no_shows >= b.no_shows).toBe(true);
    }
  });

  it('a header click makes that figure the whole sort, best first', async () => {
    open();
    await screen.findByRole('row', { name: /Team 1049/ });
    await user().click(screen.getByRole('columnheader', { name: /^Teleop/ }));
    const teleop = screen.getByRole('columnheader', { name: /^Teleop/ });
    expect(teleop).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: /^Total/ })).not.toHaveAttribute('aria-sort');
    // Team 1003 scores most of its points in Teleop: it leads the Teleop sort, still rank 4.
    expect(bodyRanks()[0]).toEqual(['1003', '4']);
    expect(screen.getByRole('button', { name: /^Sort Scoring:/ })).toHaveAccessibleName(
      'Sort Scoring: Teleop, best first',
    );
  });

  it('keeps a sort for each category', async () => {
    open();
    await screen.findByRole('row', { name: /Team 1049/ });
    await user().click(screen.getByRole('columnheader', { name: /^Endgame/ }));
    await category('Availability');
    expect(screen.getByRole('button', { name: /^Sort Availability:/ })).toHaveAccessibleName(
      'Sort Availability: Availability, best first',
    );
    await category('Scoring');
    expect(screen.getByRole('button', { name: /^Sort Scoring:/ })).toHaveAccessibleName(
      'Sort Scoring: Endgame, best first',
    );
  });
});

describe('RankingPage — Consistency never sorts, nothing weights (task 1.58)', () => {
  it('gives Consistency no aria-sort, no sort mark, no button, in either category', async () => {
    open();
    const header = await screen.findByRole('columnheader', { name: /consistency/i });
    expect(header).not.toHaveAttribute('aria-sort');
    expect(header.querySelector('svg, button, [aria-hidden="true"]')).toBeNull();
    expect(within(header).queryByRole('button')).toBeNull();
    // Every sortable header carries a mark (the badge or the faint glyph); Consistency none.
    for (const pattern of SORTABLE.Scoring) {
      const sortable = screen.getByRole('columnheader', { name: pattern });
      expect(within(sortable).getByRole('button')).toBeInTheDocument();
      expect(sortable.querySelector('[aria-hidden="true"]')).not.toBeNull();
    }
    await category('Availability');
    expect(screen.queryByRole('columnheader', { name: /consistency/i })).toBeNull();
  });

  it('never offers Consistency, or another category’s figure, as a tie-breaker', async () => {
    open();
    await screen.findByRole('row', { name: /Team 1049/ });
    let builder = await openBuilder();
    const scoring = within(builder)
      .getAllByRole('button', { name: /^\+ / })
      .map((b) => b.textContent);
    expect(scoring).toEqual(['+ Auto', '+ Teleop', '+ Endgame']);
    await user().keyboard('{Escape}');
    await category('Availability');
    builder = await openBuilder();
    const availability = within(builder)
      .getAllByRole('button', { name: /^\+ / })
      .map((b) => b.textContent);
    expect(availability).toEqual(['+ Breakdowns', '+ No-shows', '+ Disabled']);
    for (const pills of [scoring, availability]) {
      expect(pills.join(' ')).not.toMatch(/consisten|std|deviation|±/i);
    }
  });

  it('has nothing named weight and no slider, in either category or the builder', async () => {
    open();
    await screen.findByRole('table');
    const check = () => {
      expect(screen.queryAllByRole('button', { name: /weight/i })).toHaveLength(0);
      expect(screen.queryAllByRole('slider')).toHaveLength(0);
      expect(screen.queryAllByLabelText(/weight/i)).toHaveLength(0);
      expect(screen.queryAllByText(/weight/i)).toHaveLength(0);
      expect(document.querySelector('input[type="range"]')).toBeNull();
    };
    check();
    await openBuilder();
    check();
    await user().keyboard('{Escape}');
    await category('Availability');
    check();
  });

  it('prints "—" for the no-data team in every figure of both categories, never a 0', async () => {
    open();
    for (const name of ['Scoring', 'Availability'] as const) {
      await category(name);
      const last = await screen.findByRole('row', { name: /Team 1049/ });
      const cells = within(last).getAllByRole('cell').slice(2);
      expect(cells.length).toBeGreaterThan(4);
      for (const cell of cells) {
        expect(cell.textContent, name).toMatch(/^(—|No counted matches yet)$/);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------
// Task 1.59: value shading (SPEC-FINAL 12.6; 27-ranking README "Value shading").

/** The shaded chip of a team's figure, or null when that cell is plain. */
const chip = (team: number, figure: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(
    `[data-team="${team}"] [data-figure="${figure}"] [style*="--shade-bg"]`,
  );

/** The mix (percent of accent) of a chip, read from its `--shade-bg` as ShadedValue.test does. */
function mixOf(el: HTMLElement | null): number {
  const match = /var\(--accent\) (\d+)%/.exec(el?.getAttribute('style') ?? '');
  return match ? Number(match[1]) : NaN;
}

/** Every figure with at least one shaded chip on the page. */
const shadedFigures = (): string[] =>
  [
    ...new Set(
      [...document.querySelectorAll<HTMLElement>('[style*="--shade-bg"]')].map(
        (el) => el.closest('[data-figure]')?.getAttribute('data-figure') ?? '(none)',
      ),
    ),
  ].sort();

/** Whether anything in the body column under the header named `name` is shaded. */
function columnShaded(name: RegExp): boolean {
  const heads = [...document.querySelectorAll<HTMLTableCellElement>('thead tr:last-child th')];
  const at = heads.findIndex((th) => name.test(th.textContent ?? ''));
  expect(at, String(name)).toBeGreaterThanOrEqual(0);
  return [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')].some(
    (tr) => tr.cells[at]!.querySelector('[style*="--shade-bg"]') !== null,
  );
}

describe('RankingPage — value shading (task 1.59)', () => {
  it('in Scoring by default shades the Total cells only; the phases and the rest print plain', async () => {
    open();
    await screen.findByRole('row', { name: /Team 1049/ });
    expect(shadedFigures()).toEqual(['average_points']);
    // 49 teams have data; the 50th is a bare dash, not a chip.
    expect(document.querySelectorAll('[data-figure="average_points"] [data-shade]')).toHaveLength(
      49,
    );
    for (const figure of ['auto_points', 'teleop_points', 'endgame_points']) {
      expect(document.querySelector(`[data-figure="${figure}"] [data-shade]`), figure).toBeNull();
    }
    expect(columnShaded(/Consistency/)).toBe(false);
    expect(columnShaded(/Availability/)).toBe(false);
    expect(columnShaded(/Matches/)).toBe(false);
  });

  it('gives the best Total the darkest mix and the worst the palest, always with the number', async () => {
    open();
    await screen.findByRole('row', { name: /Team 1049/ });
    expect(mixOf(chip(1000, 'average_points'))).toBe(52);
    expect(mixOf(chip(1048, 'average_points'))).toBe(6);
    expect(chip(1000, 'average_points')).toHaveTextContent('50');
    expect(chip(1048, 'average_points')).toHaveTextContent('2');
    // Monotonic: a better Total is never paler than a worse one, down the sorted list.
    const mixes = [
      ...document.querySelectorAll<HTMLElement>('[data-figure="average_points"] [data-shade]'),
    ].map(mixOf);
    expect(mixes).toEqual([...mixes].sort((a, b) => b - a));
    // Every shaded cell still prints its value.
    for (const el of document.querySelectorAll('[style*="--shade-bg"]')) {
      expect(el.textContent).toMatch(/^\d+(\.\d)?%?$/);
    }
  });

  it('moves the shading with a header click: the phase is shaded, Total is not', async () => {
    open();
    await user().click(await screen.findByRole('columnheader', { name: /teleop/i }));
    expect(shadedFigures()).toEqual(['teleop_points']);
    expect(chip(1000, 'average_points')).toBeNull();
    // Team 1003's Teleop is the event's highest (47 × 0.9), Team 1048's the lowest.
    expect(mixOf(chip(1003, 'teleop_points'))).toBe(52);
    expect(mixOf(chip(1048, 'teleop_points'))).toBe(6);
    expect(columnShaded(/Consistency/)).toBe(false);
    // Back to Total.
    await user().click(screen.getByRole('columnheader', { name: /total/i }));
    expect(shadedFigures()).toEqual(['average_points']);
  });

  it('shades a reversed sort the same way: the colour follows the value, not the order', async () => {
    open();
    await user().click(await screen.findByRole('columnheader', { name: /total/i }));
    expect(mixOf(chip(1000, 'average_points'))).toBe(52);
    expect(mixOf(chip(1048, 'average_points'))).toBe(6);
  });

  it('in Availability shades Availability over 0–100 % and the counts reversed, per the sort', async () => {
    open();
    await category('Availability');
    await screen.findByRole('row', { name: /Team 1049/ });
    expect(shadedFigures()).toEqual(['availability_rate']);
    // A 100 % team is the darkest; 60 % is 6 + 0.6 × 46, a fixed scale, not min–max.
    expect(mixOf(chip(1000, 'availability_rate'))).toBe(52);
    expect(mixOf(chip(1004, 'availability_rate'))).toBe(34);
    expect(chip(1000, 'availability_rate')).toHaveTextContent('100%');

    const builder = await openBuilder();
    await user().click(within(builder).getByRole('button', { name: '+ Breakdowns' }));
    expect(shadedFigures()).toEqual(['availability_rate', 'breakdowns']);
    // Breakdowns run 0–3 and the fewest is the darkest (lower is better, reversed).
    expect(mixOf(chip(1000, 'breakdowns'))).toBe(52);
    expect(mixOf(chip(1003, 'breakdowns'))).toBe(6);
    expect(chip(1003, 'breakdowns')).toHaveTextContent('3');
    // No-shows and Disabled are not in the sort: plain.
    expect(document.querySelector('[data-figure="no_shows"] [data-shade]')).toBeNull();
    expect(document.querySelector('[data-figure="disabled"] [data-shade]')).toBeNull();
  });

  it('shades a count by its own scale when a header click makes it the sort', async () => {
    open();
    await category('Availability');
    await user().click(await screen.findByRole('columnheader', { name: /no-shows/i }));
    expect(shadedFigures()).toEqual(['no_shows']);
    expect(mixOf(chip(1000, 'no_shows'))).toBe(52); // 0 no-shows, the fewest
    expect(mixOf(chip(1004, 'no_shows'))).toBe(6); // 4, the most
  });

  it('never shades Consistency, under any sort', async () => {
    open();
    await screen.findByRole('row', { name: /Team 1049/ });
    for (const name of [/total/i, /auto/i, /teleop/i, /endgame/i]) {
      await user().click(screen.getByRole('columnheader', { name }));
      expect(columnShaded(/Consistency/), String(name)).toBe(false);
    }
  });

  it('prints the no-data team as a bare muted "—", unshaded, never "0", under every sort', async () => {
    open();
    await screen.findByRole('row', { name: /Team 1049/ });
    for (const name of ['Scoring', 'Availability'] as const) {
      await category(name);
      for (const header of SORTABLE[name]) {
        await user().click(screen.getByRole('columnheader', { name: header }));
        const cells = document.querySelectorAll<HTMLElement>('[data-team="1049"] [data-figure]');
        expect(cells.length).toBeGreaterThan(0);
        for (const cell of cells) {
          expect(cell.textContent, `${name} ${header}`).toBe('—');
          expect(cell.querySelector('[style*="--shade-bg"]')).toBeNull();
        }
        expect(document.querySelector('[data-team="1049"]')).not.toHaveTextContent(/\b0\b/);
      }
    }
  });
});

describe('RankingPage — the team study and where the figures came from (task 1.58)', () => {
  it('says the figures are the server’s, with the time, while online', async () => {
    open();
    expect(await screen.findByText(/From the server · as of/)).toBeInTheDocument();
    expect(screen.queryByText(/computed from the data on this device/i)).toBeNull();
  });

  it('falls back to the device when the server fails, and says so', async () => {
    await db.rows.bulkPut(TEAM_ROWS);
    open({
      call: vi.fn(async () => {
        throw new Error('unreachable');
      }),
    });
    expect(await screen.findByText(/computed from the data on this device/i)).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /1690 Orbit/ })).toBeInTheDocument();
  });

  it('opens the study panel beside the list on a row click, with an Open team page link', async () => {
    open();
    await user().click(await screen.findByRole('row', { name: /Team 1003/ }));
    const panel = screen.getByRole('complementary', { name: 'Team study, 1003 Team 1003' });
    expect(panel).toHaveTextContent('Rank 4 of 49 · 10 matches counted');
    expect(within(panel).getByRole('link', { name: /Open team page/ })).toHaveAttribute(
      'href',
      '/teams/t-3',
    );
    expect(
      within(panel).getByRole('region', { name: 'Where the points come from' }),
    ).toHaveTextContent('Teleop');
    // Total 47 ± 2 → a typical match of 45–49 points.
    expect(panel).toHaveTextContent('Typical match: 45–49 points');
    expect(within(panel).getByText('1st · best')).toBeInTheDocument();
    await user().click(within(panel).getByRole('button', { name: 'Close the team study' }));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('under a session override offline, says the ranking needs a connection', async () => {
    online.mockReturnValue(false);
    sessionOverride.set('ev-2', 'Week 3');
    const rpc = open();
    expect(await screen.findByText(/its ranking needs a connection/)).toBeInTheDocument();
    expect(rpc.call).not.toHaveBeenCalled();
  });

  it('under a session override online, reads the override event from the server', async () => {
    sessionOverride.set('ev-2', 'Week 3');
    const rpc = rpcFor();
    open(rpc);
    await screen.findByRole('row', { name: /Team 1000/ });
    await waitFor(() => expect(rpc.call).toHaveBeenCalledWith('rankTeams', { event_id: 'ev-2' }));
  });
});

/** The phone layout (< 1024 px): jsdom has no matchMedia, so it renders the computer's. */
describe('RankingPage — on a phone (task 1.58)', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  it('lists the teams as rows that open the summary sheet', async () => {
    open();
    const list = await screen.findByRole('list', { name: 'Teams, Scoring' });
    expect(screen.queryByRole('table')).toBeNull();
    expect(within(list).getAllByRole('listitem')).toHaveLength(50);
    expect(within(list).getAllByLabelText(/medal/i)).toHaveLength(3);
    await user().click(within(list).getAllByRole('button')[3]!);
    const sheet = screen.getByRole('dialog', { name: '1003 Team 1003' });
    expect(sheet).toHaveTextContent('Rank 4 of 49');
    expect(within(sheet).getByRole('link', { name: /Open team page/ })).toHaveAttribute(
      'href',
      '/teams/t-3',
    );
  });

  it('shades the first figure of the sort on every phone row, and nothing else', async () => {
    open();
    const list = await screen.findByRole('list', { name: 'Teams, Scoring' });
    const chips = list.querySelectorAll<HTMLElement>('[style*="--shade-bg"]');
    expect(chips).toHaveLength(49);
    for (const el of chips) {
      expect(el.closest('[data-figure]')).toHaveAttribute('data-figure', 'average_points');
    }
    expect(mixOf(chip(1000, 'average_points'))).toBe(52);
    expect(mixOf(chip(1048, 'average_points'))).toBe(6);
    expect(chip(1000, 'average_points')).toHaveTextContent('50');
    // The no-data row's figure is a bare dash.
    const none = list.querySelector('[data-team="1049"] [data-figure]')!;
    expect(none.textContent).toBe('—');
    expect(none.querySelector('[style*="--shade-bg"]')).toBeNull();
    // Availability: the first figure is Availability, on its fixed scale.
    await user().click(screen.getByRole('radio', { name: 'Availability' }));
    const availability = await screen.findByRole('list', { name: 'Teams, Availability' });
    expect(availability.querySelectorAll('[style*="--shade-bg"]')).toHaveLength(49);
    expect(mixOf(chip(1004, 'availability_rate'))).toBe(34);
  });

  it('shows the device notice offline, and the Sort builder in a sheet', async () => {
    await db.rows.bulkPut(TEAM_ROWS);
    online.mockReturnValue(false);
    open();
    expect(await screen.findByText('Computed from the data on this device')).toBeInTheDocument();
    await user().click(screen.getByRole('radio', { name: 'Availability' }));
    await user().click(screen.getByRole('button', { name: /^Sort Availability:/ }));
    const sheet = screen.getByRole('dialog', { name: 'Sort Availability by' });
    await user().click(within(sheet).getByRole('button', { name: '+ Breakdowns' }));
    expect(screen.getByRole('button', { name: /^Sort Availability:/ })).toHaveAccessibleName(
      'Sort Availability: Availability, best first, then Breakdowns, fewest first',
    );
  });
});
