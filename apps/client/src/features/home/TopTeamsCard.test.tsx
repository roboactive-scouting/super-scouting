import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { useRanking } from '@/features/ranking/useRanking';
import { rankingRows, rankingRpc, renderHomeWith, setWidth } from '@/test/homeRanking';
import { EVENT_ID, TEAM_ROWS } from '@/test/teamPageFixtures';
import { topTeamsOf } from './homeData';
import { TopTeamsCard } from './TopTeamsCard';

/*
 * Task 1.58b: Home's Top teams (03-home final) — the first five by the canonical rank of /ranking's
 * own source (`useRanking`), each with its trend line, our team marked, and Full ranking.
 */

vi.mock('@/config', () => ({
  clientConfig: () => ({
    apiBaseUrl: 'https://api.test',
    deviceWipeCode: 'w',
    appVersion: '1.4.0',
  }),
}));

const online = vi.spyOn(navigator, 'onLine', 'get');

beforeEach(async () => {
  await db.delete();
  await db.open();
  setWidth(1440);
  online.mockReturnValue(true);
});

/** The listed rows as [rank, number]. */
function listed(card: HTMLElement): [string, string][] {
  return within(card)
    .getAllByRole('listitem')
    .map((li) => [li.querySelector('.num')!.textContent!.replace('Rank ', ''), li.dataset.team!]);
}

describe('Top teams (task 1.58b)', () => {
  it('lists exactly five, in rank order, with 2096 marked as our team', async () => {
    // Handed over in another order (a page sort): the card reads the rank, not the order.
    const rows = rankingRows().reverse();
    renderHomeWith(rankingRpc(rows));
    const card = await screen.findByRole('region', { name: 'Top teams' });
    expect(listed(card)).toEqual([
      ['1', '1690'],
      ['2', '1574'],
      ['3', '2096'],
      ['4', '3339'],
      ['5', '5990'],
    ]);
    const ours = within(card).getAllByRole('listitem')[2]!;
    expect(ours).toHaveAttribute('data-us', 'true');
    expect(ours).toHaveTextContent('our team');
    expect(ours.className).toContain('bg-accent-tint');
    expect(
      within(card)
        .getAllByRole('listitem')
        .filter((li) => li.dataset.us),
    ).toHaveLength(1);
    // The average (one decimal) and the five-match trend line, ours in the accent.
    expect(within(card).getAllByRole('listitem')[0]).toHaveTextContent('58.7');
    expect(ours.querySelector('svg')).toHaveAttribute('data-tone', 'accent');
    expect(within(card).getAllByRole('listitem')[0]!.querySelector('svg')).toHaveAttribute(
      'data-tone',
      'faint',
    );
  });

  it('opens the full ranking', async () => {
    renderHomeWith(rankingRpc(rankingRows()));
    const card = await screen.findByRole('region', { name: 'Top teams' });
    const link = within(card).getByRole('link', { name: 'Full ranking' });
    expect(link).toHaveAttribute('href', '/ranking');
    await userEvent.click(link);
    expect(await screen.findByText('The ranking page')).toBeInTheDocument();
  });

  it('stays hidden with nothing ranked, and coverage keeps the full width', async () => {
    const none = rankingRows().map((r) => ({
      ...r,
      rank: null,
      average_points: null,
      matches_counted: 0,
      recent_totals: [],
      last_counted_match: null,
    }));
    const rpc = rankingRpc(none);
    renderHomeWith(rpc);
    await waitFor(() => expect(rpc.call).toHaveBeenCalled());
    expect(await screen.findByText('Your station')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Top teams' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Our team' })).toBeNull();
  });

  it('marks nobody when our team is outside the five', () => {
    render(
      <MemoryRouter>
        <TopTeamsCard
          rows={topTeamsOf(rankingRows({ usRank: 9 }))}
          ourTeam={2096}
          desktop={false}
        />
      </MemoryRouter>,
    );
    const card = screen.getByRole('region', { name: 'Top teams' });
    expect(within(card).getAllByRole('listitem')).toHaveLength(5);
    expect(card.querySelector('[data-us]')).toBeNull();
    expect(card).toHaveTextContent('avg points · last 5');
  });

  it('offline: lists the device’s ranking, the same rows /ranking reads, and asks no server', async () => {
    online.mockReturnValue(false);
    await db.rows.bulkPut(TEAM_ROWS);
    const rpc = rankingRpc(rankingRows());
    const page = renderHook(() => useRanking(EVENT_ID, rpc));
    await waitFor(() => expect(page.result.current.status).toBe('ready'));
    const ranking = page.result.current as Extract<typeof page.result.current, { status: 'ready' }>;
    expect(ranking.source.kind).toBe('device');
    page.unmount();

    renderHomeWith(rpc);
    const card = await screen.findByRole('region', { name: 'Top teams' });
    const ranked = ranking.rows.filter((r) => r.rank !== null).sort((a, b) => a.rank! - b.rank!);
    expect(listed(card)).toEqual(ranked.slice(0, 5).map((r) => [String(r.rank), String(r.number)]));
    expect(rpc.call).not.toHaveBeenCalled();
  });
});

describe('topTeamsOf (task 1.58b)', () => {
  it('takes the first five ranked teams by rank, never an unranked one', () => {
    const rows = rankingRows().reverse();
    expect(topTeamsOf(rows).map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(topTeamsOf(rows.slice(0, 4)).every((r) => r.rank !== null)).toBe(true);
    expect(topTeamsOf([])).toEqual([]);
  });
});
