import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTeamStats, formatTime, type TeamStats } from '@frc/shared';
import type * as Shared from '@frc/shared';
import { db } from '@/data/db';
import { RpcError, type Rpc } from '@/data/rpc';
import { sessionOverride } from '@/features/context/sessionOverride';
import {
  EMPTY_TEAM_ID,
  EVENT_ID,
  HEBREW_NOTE,
  IDS,
  NOW,
  TEAM_ID,
  TEAM_ROWS,
} from '@/test/teamPageFixtures';
import { TeamPage } from './TeamPage';

/*
 * Task 1.53 (SPEC-FINAL 13.1; 24-team final, D2). The plan's test predates the design and task
 * 1.57, so it is adapted (DEVIATIONS "Task 1.53"): the page reads the DEVICE (the shared
 * `buildTeamStats` over the cache) rather than an rpc payload, rows are links (the location is
 * checked, not a mocked navigate), the headline prints one decimal ("32.3", not "15.50"), the rank
 * is the words "Rank 2 of 4", the sticky header is checked by its class (jsdom loads no CSS), and
 * the match table is on the Matches tab.
 */

// The real shared builder, watched: the page never computes a statistic of its own.
vi.mock('@frc/shared', async (original) => {
  const actual = await original<typeof Shared>();
  return { ...actual, buildTeamStats: vi.fn(actual.buildTeamStats) };
});

const online = vi.spyOn(navigator, 'onLine', 'get');
const original = window.matchMedia;

/** The phone layout (< 1024 px): jsdom has no matchMedia, so it renders the computer's. */
function phone() {
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
}

const noRpc = (): Rpc & { call: ReturnType<typeof vi.fn> } => ({
  call: vi.fn(async () => {
    throw new Error('no server in this test');
  }),
});

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function Page({ rpc }: { rpc: Rpc }) {
  return <TeamPage teamId={useParams().teamId ?? ''} eventId={EVENT_ID} rpc={rpc} />;
}

function open(teamId: string = TEAM_ID, rpc: Rpc = noRpc()) {
  render(
    <MemoryRouter initialEntries={[`/teams/${teamId}`]}>
      <Routes>
        <Route path="/teams/:teamId" element={<Page rpc={rpc} />} />
        <Route path="/entries/:id" element={<Where />} />
        <Route path="/teams" element={<Where />} />
        <Route path="/scout" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return rpc;
}

const user = () => userEvent.setup();
async function choose(name: RegExp) {
  await user().click(await screen.findByRole('tab', { name }));
}

/** Every tab's panel, in turn. */
async function eachTab(check: (name: string) => void) {
  for (const name of [/^Stats/, /^Matches/, /^Progress/, /^Notes/]) {
    await choose(name);
    check(String(name));
  }
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut(TEAM_ROWS);
  vi.useFakeTimers({ toFake: ['Date'], now: NOW, shouldAdvanceTime: true });
  online.mockReturnValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  window.matchMedia = original;
  sessionOverride.clear();
});

describe('TeamPage (SPEC-FINAL 13.1; 24-team final)', () => {
  it('shows a sticky header — the banner, standalone — with the number, name, headline and rank', async () => {
    open();
    const header = await screen.findByRole('banner');
    expect(header.tagName).toBe('HEADER');
    expect(header).toHaveClass('sticky');
    expect(header).toHaveTextContent('1690');
    expect(header).toHaveTextContent('Orbit');
    expect(header).toHaveTextContent('Average points');
    expect(header).toHaveTextContent('32.3');
    expect(within(header).getByText('Rank 2 of 4')).toBeInTheDocument();
    expect(header).toHaveTextContent('District #3 · Tel Aviv · 8 entries · last seen Q37');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('1690 Orbit');
  });

  it('computes the page on the device with the shared buildTeamStats, fed the WHOLE event', async () => {
    vi.mocked(buildTeamStats).mockClear();
    open();
    await screen.findByRole('banner');
    const input = vi.mocked(buildTeamStats).mock.calls.at(-1)![0];
    // Every live entry of the event — all teams, both kinds — never a deleted or far one.
    expect(input.entries.map((e) => e.id).sort()).toEqual(
      [
        IDS.q3,
        IDS.q9,
        IDS.q14,
        IDS.q20,
        IDS.q26,
        IDS.q31,
        IDS.q37,
        IDS.super,
        'e-5951-3',
        'e-5951-9',
        'e-2096-14',
      ].sort(),
    );
    expect(input.entries.find((e) => e.id === IDS.q37)).toMatchObject({
      match_type: 'qualification',
      match_number: 37,
      event_sort_order: 3,
    });
    expect(input.teams.map((t) => t.number).sort()).toEqual([1690, 2096, 5951, 5987]);
    expect(input.versions.map((v) => v.id).sort()).toEqual(['fv-1', 'fv-s']);
    expect(input.scoring.rules).toHaveLength(5);
    expect(input.superFields?.map((f) => f.key)).toEqual(['strengths']);
  });

  it('lists every metric as label, shaded value, an inline bar and a trend line', async () => {
    open();
    const metrics = await screen.findByRole('table', { name: 'All metrics' });
    const teleHigh = metrics.querySelector('[data-metric="field:tele_high"]') as HTMLElement;
    expect(teleHigh).toHaveTextContent('High goal');
    expect(teleHigh).toHaveTextContent('7');
    expect(within(teleHigh).getByRole('meter')).toHaveAttribute('aria-valuemax', '20');
    expect(teleHigh.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // Grouped by phase under the group rows.
    for (const group of ['Overall', 'Autonomous', 'Teleop', 'Endgame']) {
      expect(within(metrics).getByRole('columnheader', { name: group })).toBeInTheDocument();
    }
    // A nominal metric is words, with no bar and no trend line.
    const climb = metrics.querySelector('[data-metric="field:climb"]') as HTMLElement;
    expect(climb).toHaveTextContent('Usual climbDeep');
    expect(within(climb).queryByRole('meter')).toBeNull();
    expect(climb.querySelector('svg')).toBeNull();
  });

  it('never shades std dev or any other neutral metric: flat --line-2, a faint bar', async () => {
    open();
    const metrics = await screen.findByRole('table', { name: 'All metrics' });
    for (const key of ['stddev_points', 'field:defense']) {
      const row = metrics.querySelector(`[data-metric="${key}"]`) as HTMLElement;
      const chip = row.querySelector('[data-shade]') as HTMLElement;
      expect(chip).toHaveAttribute('data-shade', 'flat');
      expect(chip.getAttribute('style')).toContain('var(--line-2)');
      expect(chip.getAttribute('style')).not.toContain('color-mix');
      expect(within(row).getByRole('meter').querySelector('i')).toHaveClass('bg-faint');
    }
    // A directed metric IS shaded from the ramp.
    const avg = metrics.querySelector('[data-metric="average_points"] [data-shade]')!;
    expect(avg.getAttribute('style')).toContain('color-mix(in srgb, var(--accent)');
  });

  it('lists a rating on its 1..max scale and a timer in seconds, a faster time shaded better', async () => {
    open();
    const metrics = await screen.findByRole('table', { name: 'All metrics' });
    expect(within(metrics).getByRole('columnheader', { name: 'Post-match' })).toBeInTheDocument();
    const driver = metrics.querySelector('[data-metric="field:driver"]') as HTMLElement;
    expect(driver).toHaveTextContent('Driver skill4');
    expect(within(driver).getByRole('meter')).toHaveAttribute('aria-valuemax', '5');
    // 14.2, 11.8, unsure, 12.5, 10.9, 9.6 → 11.8; the unsure one and the no-show are not 0.
    const timer = metrics.querySelector('[data-metric="field:climb_time"]') as HTMLElement;
    expect(timer).toHaveTextContent('Climb time11.8 s');
    const chip = timer.querySelector('[data-shade]') as HTMLElement;
    expect(chip).not.toHaveAttribute('data-shade', 'flat');
    expect(chip.getAttribute('style')).toContain('color-mix(in srgb, var(--accent)');
  });

  it('shades a metric flat when its domain has min = max', async () => {
    open();
    const metrics = await screen.findByRole('table', { name: 'All metrics' });
    const low = metrics.querySelector('[data-metric="field:auto_low"] [data-shade]')!;
    expect(low).toHaveAttribute('data-shade', 'flat');
    expect(low.getAttribute('style')).toContain('var(--line-2)');
  });

  it('shows breakdowns, no-shows, disabled and the availability rate, with the matches named', async () => {
    open();
    const panel = await screen.findByRole('group', { name: /reliability/i });
    expect(panel).toHaveTextContent('Availability86%6 of 7');
    expect(panel).toHaveTextContent('Breakdowns1Q14');
    expect(panel).toHaveTextContent('No-shows1Q26');
    expect(panel).toHaveTextContent('Disabled0');
    const counts = [...panel.querySelectorAll('b')];
    expect(
      counts.filter((b) => b.classList.contains('text-warn')).map((b) => b.textContent),
    ).toEqual(['1', '1']);
  });

  it('shows the four stat tiles: median, availability, best match, trend', async () => {
    open();
    await screen.findByRole('banner');
    expect(screen.getAllByText('Median points')[0]!.parentElement).toHaveTextContent(
      'Median points36avg 32.3',
    );
    expect(screen.getAllByText('Best match')[0]!.parentElement).toHaveTextContent(
      'Best match42Q37',
    );
    expect(screen.getByText('Trend').parentElement).toHaveTextContent(/^Trend\+\d/);
  });

  it('shows a match-by-match row per match the team has an entry for, newest first', async () => {
    open();
    await choose(/^Matches/);
    const table = await screen.findByRole('table', { name: /match by match/i });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(1 + 7); // header + seven matches
    expect(rows.slice(1).map((r) => r.querySelector('td')!.textContent)).toEqual([
      'Q37',
      'Q31',
      'Q26',
      'Q20',
      'Q14',
      'Q9',
      'Q3',
    ]);
    expect(within(table).getByRole('columnheader', { name: 'Scouter' })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('Omer K.');
  });

  it('prints a no-show as "—" in every value column of the table, never 0 or its stale data', async () => {
    open();
    await choose(/^Matches/);
    const table = await screen.findByRole('table', { name: /match by match/i });
    const row = within(table).getByRole('row', { name: /no show/i });
    const cells = [...row.querySelectorAll('td')];
    // Match · Robot · Points · 5 metric columns · Scouter · ›
    const values = cells.slice(2, 2 + 6).map((c) => c.textContent);
    expect(values).toEqual(['—', '—', '—', '—', '—', '—']);
    expect(row).not.toHaveTextContent(/\b0\b/);
    expect(row).not.toHaveTextContent(/\b(7|13)\b/);
    expect(row).not.toHaveTextContent('Deep');
  });

  it('opens that entry’s preview when a match row is clicked', async () => {
    open();
    await choose(/^Matches/);
    const table = await screen.findByRole('table', { name: /match by match/i });
    const link = within(within(table).getAllByRole('row')[1]!).getByRole('link');
    expect(link).toHaveAttribute('href', `/entries/${IDS.q37}`);
    await user().click(link);
    expect(screen.getByTestId('where')).toHaveTextContent(`/entries/${IDS.q37}`);
  });

  it('shows the match strip on the Matches tab only, first, each cell opening its entry', async () => {
    open();
    await screen.findByRole('banner');
    const strip = () => document.querySelector('[data-match-strip]');
    expect(strip()).toBeNull();
    await choose(/^Progress/);
    expect(strip()).toBeNull();
    await choose(/^Notes/);
    expect(strip()).toBeNull();
    await choose(/^Matches/);
    const nav = screen.getByRole('navigation', { name: 'Match strip' });
    expect(nav).toBe(strip());
    const panel = screen.getByRole('tabpanel');
    expect(panel.firstElementChild).toBe(nav);
    const cells = within(nav).getAllByRole('link');
    // Oldest → newest; the no-show "—" in a dashed cell; broke down edged amber.
    expect(cells.map((c) => c.textContent)).toEqual([
      'Q329',
      'Q936',
      'Q1411',
      'Q2040',
      'Q26—',
      'Q3136',
      'Q3742',
    ]);
    expect(cells[4]).toHaveClass('border-dashed');
    expect(cells[2]!.className).toContain('var(--warn)');
    expect(cells[0]).toHaveAttribute('href', `/entries/${IDS.q3}`);
  });

  it('has no img role and no <img> on any tab, at either width', async () => {
    open();
    await screen.findByRole('banner');
    await eachTab((name) => {
      expect(screen.queryByRole('img'), name).toBeNull();
      expect(document.querySelector('img'), name).toBeNull();
    });
  });

  it('has no img role and no <img> on any tab on a phone either', async () => {
    phone();
    open();
    await screen.findByRole('banner');
    await eachTab((name) => {
      expect(screen.queryByRole('img'), name).toBeNull();
      expect(document.querySelector('img'), name).toBeNull();
    });
  });

  it('lists long-text notes newest first, each with its match, field label and scouter', async () => {
    open();
    await choose(/^Notes/);
    const list = screen.getByRole('list', { name: 'Notes' });
    const notes = within(list).getAllByRole('listitem', { name: /note/i });
    expect(notes).toHaveLength(5);
    expect(notes.map((n) => n.querySelector('.num')!.textContent)).toEqual([
      'Q9',
      'Q37',
      'Super',
      'Q20',
      'Q14',
    ]);
    expect(notes[0]).toHaveTextContent(HEBREW_NOTE);
    expect(notes[0]).toHaveTextContent('הערות');
    expect(notes[0]).toHaveTextContent('Yael Shapira');
    // Local time, as the page prints it: 15:50 in Israel, 13:50 on a UTC CI runner.
    expect(notes[0]).toHaveTextContent(formatTime('2026-11-14T13:50:00.000Z'));
    expect(notes[4]).toHaveTextContent(`Fri ${formatTime('2026-11-13T09:20:00.000Z')}`);
    // Never the deleted entry's note, nor another event's.
    expect(list).not.toHaveTextContent('deleted note');
    expect(list).not.toHaveTextContent('far note');
  });

  it('renders Hebrew notes with dir=auto', async () => {
    open();
    await choose(/^Notes/);
    expect(screen.getByText(HEBREW_NOTE)).toHaveAttribute('dir', 'auto');
  });

  it('shows the latest notes and the Progress chart on the computer’s Stats tab', async () => {
    open();
    const notes = await screen.findByRole('list', { name: 'Notes' });
    expect(within(notes).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('figure', { name: 'Points per match, match by match' })).toBeDefined();
  });

  it('draws a no-show as a gap in the chart — no point at y = 0 — never a 0', async () => {
    open();
    await choose(/^Progress/);
    const figure = screen.getByRole('figure', { name: 'Points per match, match by match' });
    const svg = figure.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    const height = Number(svg.getAttribute('height'));
    const baseline = height - 22; // y(0): the bottom of the plot
    const marks = [...svg.querySelectorAll('[data-mark]')];
    expect(marks).toHaveLength(6); // seven matches, one no-show: six marks
    for (const mark of marks) {
      const y = Number(mark.getAttribute('cy') ?? Number(mark.getAttribute('y')) + 4);
      expect(Math.abs(y - baseline)).toBeGreaterThan(5);
    }
    expect(svg.querySelectorAll('[data-mark="broke-down"]')).toHaveLength(1);
    // The line breaks at the gap; the faint dotted bridge spans it, with "—" over it.
    const line = svg.querySelector('path.stroke-accent')!.getAttribute('d')!;
    expect(line.match(/M/g)).toHaveLength(2);
    expect(svg.querySelector('path[stroke-dasharray="2 3"]')).not.toBeNull();
    expect(within(figure).getByText('Q26: no show, not counted')).toBeInTheDocument();
  });

  it('stacks up to four charts, each with its own picker and ✕, from the Progress tab', async () => {
    open();
    await choose(/^Progress/);
    const add = () => screen.queryByRole('button', { name: /Add a chart under it · up to 4/ });
    await user().click(add()!);
    const second = screen.getByRole('region', { name: /^Chart 2/ });
    const picker = within(second).getByRole('combobox', { name: 'Chart metric' });
    await user().selectOptions(picker, 'field:tele_high');
    expect(screen.getByRole('region', { name: 'Chart 2: Teleop high goal' })).toBeInTheDocument();
    expect(
      screen.getByRole('figure', { name: 'Teleop high goal, match by match' }),
    ).toBeInTheDocument();
    await user().click(add()!);
    await user().click(add()!);
    expect(screen.getAllByRole('figure')).toHaveLength(4);
    expect(add()).toBeNull();
    await user().click(screen.getByRole('button', { name: 'Remove the Teleop high goal chart' }));
    expect(screen.getAllByRole('figure')).toHaveLength(3);
    // The first chart cannot be removed.
    expect(
      within(screen.getByRole('region', { name: /^Chart 1/ })).queryByRole('button'),
    ).toBeNull();
  });

  it('shows the empty state when the team has no entries at this event', async () => {
    open(EMPTY_TEAM_ID);
    expect(await screen.findByText(/no entries for this team yet/i)).toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(header).toHaveTextContent('0 entries · not ranked yet');
    expect(header).toHaveTextContent('—');
    expect(screen.queryByRole('tablist')).toBeNull();
    await user().click(screen.getByRole('link', { name: 'Scout a match' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/scout');
  });

  it('says so when the device holds no such team', async () => {
    open('t-nope');
    expect(await screen.findByRole('heading', { name: 'This team is not here' })).toBeDefined();
  });
});

/*
 * Phase 1 I side task 2 (plan v1.30): nothing pinned floats. The header and the tabs are ONE
 * sticky block, so the tabs sit under the header by layout, never at a measured offset. jsdom lays
 * nothing out: the structure is checked here, the boxes touching in e2e/team.spec.ts.
 */
describe('TeamPage: the header and the tabs are one sticky block', () => {
  const blockOf = () => {
    const header = screen.getByRole('banner');
    const block = header.parentElement!;
    return { header, block, tabBar: screen.getByRole('tablist').parentElement! };
  };
  /** Every element with an inline `top`, or sticky other than the block and the header. */
  const strays = (header: HTMLElement, block: HTMLElement) =>
    [...document.body.querySelectorAll<HTMLElement>('*')].filter(
      (el) =>
        el.style.top !== '' || (el.classList.contains('sticky') && el !== header && el !== block),
    );

  it('computer: one wrapper sticks on --top-bar, the tabs right under the header inside it', async () => {
    open();
    await screen.findByRole('banner');
    const { header, block, tabBar } = blockOf();
    expect(block).toHaveAttribute('data-team-head');
    expect(block).toHaveClass('sticky', 'top-[calc(var(--top-bar,0px)-var(--team-tiles,0px))]');
    expect([...block.children]).toEqual([header, tabBar]);
    expect(header).toHaveClass('sticky', 'top-[var(--top-bar,0px)]');
    // No measured offset anywhere, and no second sticky element.
    expect(strays(header, block)).toEqual([]);
    expect(tabBar).not.toHaveClass('sticky');
    // The panel scrolls under the block: it is not in it.
    expect(block).not.toContainElement(screen.getByRole('tabpanel'));
    // Every tab keeps the same block.
    await eachTab(() => expect(blockOf().block).toBe(block));
  });

  it('phone: header, tiles, tabs in the block; it sticks the tiles’ own height (unrounded) above the bar', async () => {
    phone();
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height: 217.25, top: 0, bottom: 0 } as DOMRect);
    open();
    await screen.findByRole('banner');
    const { header, block, tabBar } = blockOf();
    const tiles = block.children[1] as HTMLElement;
    expect([...block.children]).toEqual([header, tiles, tabBar]);
    expect(tiles).toHaveTextContent('Median points');
    const root = block.parentElement!;
    expect(root.style.getPropertyValue('--team-tiles')).toBe('217.25px');
    expect(strays(header, block)).toEqual([]);

    // Compact (scrolled), the one-line header is still the block's top, the tabs still in it.
    act(() => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 300 });
      window.dispatchEvent(new Event('scroll'));
    });
    await waitFor(() => expect(screen.getByRole('banner')).toHaveAttribute('data-compact'));
    const compact = blockOf();
    expect(compact.block).toBe(block);
    expect([...block.children]).toEqual([compact.header, tiles, compact.tabBar]);
    expect(strays(compact.header, block)).toEqual([]);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    rect.mockRestore();
  });

  /** Lays out the block's bottom at 160 and the panel's top at `panelTop`, scrolled 500 down. */
  function layOut(panelTop: number) {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 });
    return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.hasAttribute('data-team-head')) return { top: 0, bottom: 160 } as DOMRect;
      const sentinel = this.parentElement?.tagName === 'MAIN' && !this.previousElementSibling;
      return { top: sentinel ? panelTop : 0, bottom: 0, height: 0 } as DOMRect;
    });
  }

  it('a tab chosen while the block is stuck keeps it stuck, the new panel from its top', async () => {
    open();
    await screen.findByRole('banner');
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const rect = layOut(100); // the panel has slid 60 px under the block
    await choose(/^Notes/);
    expect(scrollTo).toHaveBeenCalledWith({ top: 500 + 100 - 160 });
    rect.mockRestore();
    scrollTo.mockRestore();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('a tab chosen while the block is not stuck does not scroll', async () => {
    open();
    await screen.findByRole('banner');
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const rect = layOut(160); // the panel starts right under the block
    await choose(/^Notes/);
    expect(scrollTo).not.toHaveBeenCalled();
    rect.mockRestore();
    scrollTo.mockRestore();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });
});

describe('TeamPage on a phone', () => {
  beforeEach(() => phone());

  it('lists the matches newest first: match, status, scouter, points, "—" for a no-show', async () => {
    open();
    await screen.findByRole('banner');
    await choose(/^Matches/);
    const list = screen.getByRole('list', { name: 'Match by match' });
    const rows = within(list).getAllByRole('link');
    expect(rows.map((r) => r.textContent)).toEqual([
      'Q37PlayedOmer K.42pts',
      'Q31PlayedYael S.36pts',
      'Q26—No showYael S.—pts',
      'Q20PlayedNoa L.40pts',
      'Q14Broke downOmer K.11pts',
      'Q9PlayedYael S.36pts',
      'Q3PlayedDana M.29pts',
    ]);
    expect(rows[2]).toHaveAttribute('href', `/entries/${IDS.q26}`);
    // No station tag and no field values on the phone.
    expect(list).not.toHaveTextContent(/Red|Blue|Deep/);
    expect(screen.queryByRole('table', { name: /match by match/i })).toBeNull();
  });

  it('shrinks the header to one line once scrolled, and grows it back at the top', async () => {
    open();
    const header = await screen.findByRole('banner');
    expect(header).not.toHaveAttribute('data-compact');
    expect(header).toHaveTextContent('Avg points');
    const scrollTo = (y: number) =>
      act(() => {
        Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
        window.dispatchEvent(new Event('scroll'));
      });
    scrollTo(200);
    await waitFor(() => expect(screen.getByRole('banner')).toHaveAttribute('data-compact'));
    const compact = screen.getByRole('banner');
    expect(compact).toHaveTextContent('1690Orbit');
    expect(compact).toHaveTextContent('Rank 2 of 4');
    expect(compact).toHaveClass('motion-safe:transition-[padding,box-shadow]');
    scrollTo(0);
    await waitFor(() => expect(screen.getByRole('banner')).not.toHaveAttribute('data-compact'));
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('goes back to Search from the ‹ when the page was opened directly', async () => {
    open();
    await user().click(await screen.findByRole('button', { name: 'Back to Search' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/teams');
  });
});

describe('TeamPage under a session override (SPEC-FINAL 6.3)', () => {
  const wire = (): TeamStats & { next_cursor: null } => ({
    team: { id: TEAM_ID, number: 1690, name: 'Orbit' },
    event: { id: 'ev-2', name: 'District #2' },
    entry_count: 1,
    rank: { rank: 3, of: 30 },
    headline: { label: 'Average points', value: 21 },
    tiles: {
      median: 21,
      availability: { rate: 1, available: 1, total: 1 },
      best_match: { entry_id: 'w-1', match_label: 'Q4', points: 21 },
      trend: null,
    },
    metrics: [],
    columns: [],
    matches: [
      {
        entry_id: 'w-1',
        match_id: 'wm-4',
        match_label: 'Q4',
        match_type: 'qualification',
        match_number: 4,
        robot_status: 'played',
        scouted_points: 21,
        scouter_id: 'u-dana',
        scouter_name: 'Dana Mor',
        columns: {},
      },
    ],
    match_count: 1,
    notes: [],
    reliability: {
      breakdowns: 0,
      no_shows: 0,
      disabled: 0,
      available: 1,
      missed: 0,
      availability_rate: 1,
      breakdown_matches: [],
      no_show_matches: [],
      disabled_matches: [],
    },
    next_cursor: null,
  });

  it('asks the server’s getTeamStats for the overridden event', async () => {
    sessionOverride.set('ev-2', 'District #2');
    const rpc = { call: vi.fn(async () => wire()) };
    open(TEAM_ID, rpc);
    const header = await screen.findByRole('banner');
    expect(header).toHaveTextContent('District #2 · 1 entry · last seen Q4');
    expect(header).toHaveTextContent('Rank 3 of 30');
    expect(rpc.call).toHaveBeenCalledWith('getTeamStats', {
      team_id: TEAM_ID,
      scope: { mode: 'event', event_id: 'ev-2' },
      limit: 200,
    });
  });

  it('prints a dead robot as "—" in every value column whatever the payload holds', async () => {
    sessionOverride.set('ev-2', 'District #2');
    const payload = wire();
    payload.columns = [{ key: 'field:auto_high', label: 'High goal' }];
    payload.matches = [
      {
        ...payload.matches[0]!,
        entry_id: 'w-2',
        match_label: 'Q9',
        match_number: 9,
        robot_status: 'no_show',
        scouted_points: 0,
        // Stale values a dead row must never show (11.3), even if a payload carried them.
        columns: { 'field:auto_high': { value: 3, display: null } },
      },
    ];
    open(TEAM_ID, { call: vi.fn(async () => payload) });
    await choose(/^Matches/);
    const table = await screen.findByRole('table', { name: /match by match/i });
    const cells = [
      ...within(table)
        .getByRole('row', { name: /no show/i })
        .querySelectorAll('td'),
    ];
    expect(cells.slice(2, 4).map((c) => c.textContent)).toEqual(['—', '—']);
    const strip = screen.getByRole('navigation', { name: 'Match strip' });
    expect(strip).toHaveTextContent('Q9—');
  });

  it('offline, says it needs the server and asks nothing', async () => {
    online.mockReturnValue(false);
    sessionOverride.set('ev-2', 'District #2');
    const rpc = noRpc();
    open(TEAM_ID, rpc);
    expect(
      await screen.findByText(
        'District #2 is not on this device; its statistics need a connection.',
        {
          exact: false,
        },
      ),
    ).toBeInTheDocument();
    await user().click(
      await screen.findByRole('button', { name: 'Back to District #3 · Tel Aviv' }),
    );
    expect(sessionOverride.get()).toBeNull();
    expect(rpc.call).not.toHaveBeenCalled();
  });

  it('a team the server does not know is not found', async () => {
    sessionOverride.set('ev-2', 'District #2');
    const rpc = {
      call: vi.fn(async () => {
        throw new RpcError('not-found', 'that team does not exist', 404);
      }),
    };
    open(TEAM_ID, rpc);
    expect(await screen.findByRole('heading', { name: 'This team is not here' })).toBeDefined();
  });
});
