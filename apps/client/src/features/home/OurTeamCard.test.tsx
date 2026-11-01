import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DeviceRanking from '@/features/ranking/deviceRanking';
import { db, type CachedRow } from '@/data/db';
import { loadDeviceRanking } from '@/features/ranking/deviceRanking';
import { rosterCount } from '@/features/ranking/rankingView';
import { useRanking } from '@/features/ranking/useRanking';
import { HOME_EVENT, rankingRows, rankingRpc, renderHomeWith, setWidth } from '@/test/homeRanking';
import { EVENT_ID, TEAM_ROWS } from '@/test/teamPageFixtures';
import { moveText, ourTeamOf, type OurTeam } from './homeData';
import { OurTeamCard } from './OurTeamCard';

/*
 * Task 1.58b: Home's Our-team card (03-home final). Its rank is /ranking's own (`useRanking`), and
 * its places-moved is our rank now against our rank in the SAME source's ranking before our last
 * counted match (`useRankingBefore`): online both are `rankTeams`, offline both the device's
 * `buildRankTable`.
 */

vi.mock('@/config', () => ({
  clientConfig: () => ({
    apiBaseUrl: 'https://api.test',
    deviceWipeCode: 'w',
    appVersion: '1.4.0',
  }),
}));

// The real device ranking, watched: which reads went to the device, and with which number.
vi.mock('@/features/ranking/deviceRanking', async (original) => {
  const actual = await original<typeof DeviceRanking>();
  return { ...actual, loadDeviceRanking: vi.fn(actual.loadDeviceRanking) };
});

const online = vi.spyOn(navigator, 'onLine', 'get');

beforeEach(async () => {
  await db.delete();
  await db.open();
  setWidth(1440);
  online.mockReturnValue(true);
  vi.mocked(loadDeviceRanking).mockClear();
});
afterEach(() => vi.mocked(loadDeviceRanking).mockClear());

/** Our team's rows with 2096 at `rank` before Q36. */
const beforeWith = (rank: number) => () => rankingRows({ usRank: rank, usMatches: 4, usLast: 35 });
const card = () => screen.findByRole('region', { name: 'Our team' });

describe('the Our-team card (task 1.58b)', () => {
  it('shows the rank of the roster, the average and ▲2 since Q36, spoken in words', async () => {
    const rpc = rankingRpc(rankingRows(), beforeWith(5));
    renderHomeWith(rpc);
    const ours = await card();
    expect(ours).toHaveTextContent('2096');
    expect(ours).toHaveTextContent('RobActive');
    expect(ours).toHaveTextContent('Our team at this event');
    // 44 roster teams, 42 ranked: "#3 / 44" — every "of" counts the roster (user, 2026-10-29).
    expect(within(ours).getByText('Rank 3 of 44')).toBeInTheDocument();
    expect(ours).toHaveTextContent('#3 / 44');
    expect(ours).toHaveTextContent('avg 56.1'); // one decimal (SPEC-FINAL 17.8)
    expect(await within(ours).findByText('Up 2 places since Q36')).toBeInTheDocument();
    expect(ours).toHaveTextContent('▲2 since Q36');
  });

  it('reads ▼ and No change against the ranking computed before our last match', async () => {
    const down = rankingRpc(rankingRows(), beforeWith(2));
    const { unmount } = renderHomeWith(down);
    expect(await within(await card()).findByText('Down 1 place since Q36')).toBeInTheDocument();
    expect(await card()).toHaveTextContent('▼1 since Q36');
    unmount();
    const same = rankingRpc(rankingRows(), beforeWith(3));
    renderHomeWith(same);
    expect(await within(await card()).findByText('No change since Q36')).toBeInTheDocument();
  });

  it('online, both readings are rankTeams — the before one at our last match — and none the device’s', async () => {
    await db.rows.bulkPut(TEAM_ROWS); // the device holds a ranking too: it must not be read
    const rpc = rankingRpc(rankingRows(), beforeWith(5));
    renderHomeWith(rpc);
    expect(await within(await card()).findByText('Up 2 places since Q36')).toBeInTheDocument();
    expect(rpc.call.mock.calls.map(([, input]) => input)).toEqual([
      { event_id: HOME_EVENT },
      { event_id: HOME_EVENT, before_match_number: 36 },
    ]);
    // The device was only ever asked for the "now" table (the placeholder), never for a before.
    expect(
      vi.mocked(loadDeviceRanking).mock.calls.every(([, before]) => before === undefined),
    ).toBe(true);
  });

  it('leaves the move out with fewer than two counted matches, and asks for no earlier ranking', async () => {
    const rpc = rankingRpc(rankingRows({ usMatches: 1 }), beforeWith(5));
    renderHomeWith(rpc);
    const ours = await card();
    expect(ours).toHaveTextContent('#3 / 44');
    await waitFor(() => expect(rpc.call).toHaveBeenCalledTimes(1));
    expect(ours).not.toHaveTextContent(/since Q|▲|▼|No change/);
  });

  it('stays hidden while our team is not ranked: the desktop row keeps three tiles', async () => {
    const rpc = rankingRpc(rankingRows({ usRank: null }));
    renderHomeWith(rpc);
    // Top teams shows (others are ranked), so the ranking is in.
    expect(await screen.findByRole('region', { name: 'Top teams' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Our team' })).toBeNull();
    const tiles = screen.getByText('Your station').closest('.grid')!;
    expect(tiles.className).toContain('grid-cols-3');
    expect(tiles.children).toHaveLength(3);
  });

  it('is the fourth, wider tile of the desktop row when ranked', async () => {
    renderHomeWith(rankingRpc(rankingRows(), beforeWith(5)));
    const ours = await card();
    const tiles = ours.parentElement!;
    expect(tiles.className).toContain('grid-cols-[1fr_1fr_1fr_1.35fr]');
    expect(tiles.children).toHaveLength(4);
    expect(tiles.lastElementChild).toBe(ours);
  });

  it('offline: reads the device’s ranking — now and before — and agrees with /ranking', async () => {
    online.mockReturnValue(false);
    await db.rows.bulkPut(TEAM_ROWS);
    // 2096's second match, a poor one (5 points after 50 at Q14): it has a move to show.
    await db.rows.put({
      ...(TEAM_ROWS.find((r) => r.id === 'e-2096-14') as CachedRow),
      id: 'e-2096-37',
      match_id: 'm-37',
      data: { left_zone: true, auto_low: 1 },
    });
    const rpc = rankingRpc(rankingRows());
    // What /ranking shows: the same hook, the same rows.
    const page = renderHook(() => useRanking(EVENT_ID, rpc));
    await waitFor(() => expect(page.result.current.status).toBe('ready'));
    const ranking = page.result.current as Extract<typeof page.result.current, { status: 'ready' }>;
    expect(ranking.source.kind).toBe('device');
    const us = ranking.rows.find((r) => r.number === 2096)!;
    expect(us.rank).not.toBeNull();
    expect(us.matches_counted).toBeGreaterThanOrEqual(2);
    page.unmount();

    renderHomeWith(rpc);
    const ours = await card();
    expect(
      within(ours).getByText(`Rank ${us.rank} of ${rosterCount(ranking.rows)}`),
    ).toBeInTheDocument();
    // The move: our rank in the device's own table before our last counted match.
    const before = (await loadDeviceRanking(EVENT_ID, us.last_counted_match!))!.rows;
    const expected = ourTeamOf(ranking.rows, 2096, before)!.move!;
    expect(expected.since).toBe('Q37');
    expect(expected.places).toBeLessThan(0); // first on 50, then below 1690 after the 5
    expect(await within(ours).findByText(moveText(expected).spoken)).toBeInTheDocument();
    expect(vi.mocked(loadDeviceRanking)).toHaveBeenCalledWith(EVENT_ID, us.last_counted_match);
    // Offline, the server is never asked, for either reading.
    expect(rpc.call).not.toHaveBeenCalled();
  });
});

describe('ourTeamOf and moveText (task 1.58b)', () => {
  const rows = rankingRows();
  it('measures the move from our latest counted match, the roster in "of"', () => {
    const us = ourTeamOf(rows, 2096, rankingRows({ usRank: 6 }))!;
    expect(us).toMatchObject({ rank: 3, of: 44, average: '56.1' });
    expect(us.move).toEqual({ places: 3, since: 'Q36' });
    expect(moveText(us.move!)).toEqual({
      shown: '▲3 since Q36',
      spoken: 'Up 3 places since Q36',
    });
    expect(moveText({ places: -1, since: 'Q36' }).shown).toBe('▼1 since Q36');
    expect(moveText({ places: 0, since: 'Q36' }).shown).toBe('No change since Q36');
  });

  it('has no move without the earlier ranking or with one counted match; null when unranked', () => {
    expect(ourTeamOf(rows, 2096, null)!.move).toBeNull();
    expect(ourTeamOf(rankingRows({ usMatches: 1 }), 2096, rows)!.move).toBeNull();
    expect(ourTeamOf(rankingRows({ usRank: null }), 2096, rows)).toBeNull();
    expect(ourTeamOf([], 2096, null)).toBeNull();
  });

  it('draws the card from the model: no move line when there is none', () => {
    const team: OurTeam = { ...ourTeamOf(rows, 2096, null)!, move: null };
    render(<OurTeamCard team={team} desktop={false} />);
    const ours = screen.getByRole('region', { name: 'Our team' });
    expect(ours).toHaveTextContent('2096 RobActive');
    expect(ours).not.toHaveTextContent('since');
    expect(ours.querySelector('img')).toHaveAttribute('alt', '');
  });
});
