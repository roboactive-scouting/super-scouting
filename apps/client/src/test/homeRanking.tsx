import { render, type RenderResult } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import type { RankRow } from '@frc/shared';
import type { Rpc } from '@/data/rpc';
import { HomePage } from '@/features/home/HomePage';
import type { ShellContext } from '@/features/shell/shellContext';

/*
 * Home's ranking cards (task 1.58b): a ranking like the 03-home final's — 44 roster teams, 42 of
 * them ranked (1690 Orbit, 1574 MisCar, 2096 RobActive, 3339 BumbleB, 5990 TRIGON first), two not
 * yet — as `rankTeams` answers it, and Home rendered in the shell's outlet with an injected rpc.
 */

export const HOME_EVENT = 'ev-1';

const NAMED: [number, string, number[]][] = [
  [1690, 'Orbit', [44, 47, 52, 55, 58]],
  [1574, 'MisCar', [49, 50, 53, 52, 55]],
  [2096, 'RobActive', [38, 42, 47, 49, 51]],
  [3339, 'BumbleB', [45, 46, 44, 48, 48]],
  [5990, 'TRIGON', [36, 40, 41, 44, 45]],
];

/**
 * The table in the canonical order, with 2096 at `usRank` (the named teams keep their order
 * around it), `usMatches` counted matches and its last counted match `usLast`. `usRank: null`
 * leaves our team unranked.
 */
export function rankingRows({
  usRank = 3,
  usMatches = 5,
  usLast = 36,
}: { usRank?: number | null; usMatches?: number; usLast?: number } = {}): RankRow[] {
  const others = [
    ...NAMED.filter(([n]) => n !== 2096),
    ...Array.from({ length: 37 }, (_, i): [number, string, number[]] => [
      6000 + i,
      `Team ${6000 + i}`,
      [30 - i * 0.5, 31 - i * 0.5],
    ]),
  ];
  const us = NAMED.find(([n]) => n === 2096)!;
  const ordered = [...others];
  if (usRank !== null) ordered.splice(usRank - 1, 0, us);
  const row = (
    [number, name, totals]: [number, string, number[]],
    rank: number | null,
  ): RankRow => {
    const avg = rank === null ? null : 60 - rank * 1.3;
    return {
      team_id: `t-${number}`,
      number,
      name,
      rank,
      average_points: avg,
      stddev: rank === null ? null : 6.1,
      phase_averages: [],
      matches_counted: rank === null ? 0 : number === 2096 ? usMatches : 5,
      breakdowns: 0,
      no_shows: 0,
      disabled: 0,
      availability_rate: rank === null ? null : 1,
      recent_totals: rank === null ? [] : number === 2096 ? totals.slice(-usMatches) : totals,
      last_counted_match: rank === null ? null : number === 2096 ? usLast : 38,
    };
  };
  const ranked = ordered.map((t, i) => row(t, i + 1));
  const unranked = [
    row([9001, 'Unscouted A', []], null),
    row([9002, 'Unscouted B', []], null),
    ...(usRank === null ? [row(us, null)] : []),
  ];
  return [...ranked, ...unranked];
}

/**
 * `rankTeams` as the server answers: `now` without a before-number, `beforeRows(n)` with one.
 * `call` is a spy (its calls are the proof of which source was read).
 */
export function rankingRpc(now: RankRow[], beforeRows: (n: number) => RankRow[] = () => now) {
  return {
    call: vi.fn(async (name: string, input?: unknown) => {
      if (name !== 'rankTeams') throw new Error(`no mock for ${name}`);
      const before = (input as { before_match_number?: number }).before_match_number;
      const rows = before === undefined ? now : beforeRows(before);
      return { event: { id: HOME_EVENT, name: 'District #3 · Tel Aviv' }, rows };
    }),
  } satisfies Rpc;
}

/** Desktop at 1024 px and wider (lib/useMediaQuery); the stub from ShellLayout.test.tsx. */
export function setWidth(width: number) {
  window.matchMedia = ((query: string) => ({
    matches: /min-width: 1024px/.test(query) && width >= 1024,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

/** Home in the shell's outlet, as HomePage.test.tsx renders it. */
export function renderHomeWith(rpc?: Rpc): RenderResult {
  const context: ShellContext = {
    user: {
      id: 'u-1',
      username: 'noa.levi',
      full_name: 'Noa Levi',
      role: 'lead',
      must_change_password: false,
    },
    expired: false,
    eventId: HOME_EVENT,
    gate: 'fresh',
    requestSync: () => Promise.resolve(),
  };
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Outlet context={context} />,
      children: [{ index: true, element: <HomePage rpc={rpc} /> }],
    },
    { path: '/ranking', element: <p>The ranking page</p> },
  ]);
  return render(<RouterProvider router={router} />);
}
