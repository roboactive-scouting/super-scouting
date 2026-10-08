import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, setMeta, type CachedRow } from '@/data/db';
import { clearSyncFailure, LAST_FAILURE } from '@/data/syncFailure';
import { EntriesPage } from './EntriesPage';

const USERS: CachedRow[] = [
  { entity: 'users', id: 'u-noa', full_name: 'Noa Levi', username: 'noa' },
  { entity: 'users', id: 'u-amit', full_name: 'Amit Ben-David', username: 'amit' },
];
const TEAMS: CachedRow[] = [
  { entity: 'teams', id: 't-1', number: 5951, name: 'Tiny Titans' },
  { entity: 'teams', id: 't-2', number: 3316, name: 'D-Bug' },
];

/**
 * Five entries, ids e34..e38, one per match Q34..Q38, times rising with the number. The even
 * ones (e34, e36, e38) are Noa's, the odd ones Amit's. Every match has a blue line-up of
 * 5951 alone, so an entry for 3316 is outside its line-up.
 */
async function seedEntries(
  o: { refused?: string[]; offLineup?: string[]; waiting?: string[]; none?: boolean } = {},
) {
  await db.rows.bulkPut([...USERS, ...TEAMS]);
  if (o.none) return;
  for (const n of [34, 35, 36, 37, 38]) {
    const id = `e${n}`;
    const off = o.offLineup?.includes(id) ?? false;
    const at = `2026-03-17T${String(n - 24).padStart(2, '0')}:00:00.000Z`;
    await db.rows.bulkPut([
      { entity: 'matches', id: `m${n}`, event_id: 'ev-1', match_type: 'qualification', number: n },
      {
        entity: 'match_teams',
        id: `s${n}`,
        match_id: `m${n}`,
        alliance: 'blue',
        team_id: 't-1',
        station: 2,
      },
      {
        entity: 'scouting_entries',
        id,
        event_id: 'ev-1',
        match_id: `m${n}`,
        team_id: off ? 't-2' : 't-1',
        alliance: 'blue',
        scouter_id: n % 2 === 0 ? 'u-noa' : 'u-amit',
        robot_status: 'played',
        data: {},
        deleted_at: null,
        client_created_at: at,
        client_updated_at: at,
      },
    ]);
  }
  for (const id of o.waiting ?? []) {
    await db.outbox.put({
      op_id: `op-${id}`,
      entity: 'scouting_entry',
      row_id: id,
      action: 'create',
      base_version: null,
      payload: {},
      author_user_id: 'u-noa',
      client_created_at: '2026-03-17T09:00:00.000Z',
      client_updated_at: '2026-03-17T09:00:00.000Z',
      seq: 1,
    });
  }
  for (const id of o.refused ?? []) {
    await db.syncState.put({
      row_id: id,
      sync_state: 'pending',
      acked_at: null,
      origin: 'local',
      rejection: {
        code: 'edit-window-expired',
        message: 'this entry is locked — ask a lead',
        at: '2026-03-17T09:05:00.000Z',
      },
    });
  }
}

function renderEntries({ me = 'u-noa' }: { me?: string } = {}) {
  const user = { id: me, username: 'x', full_name: 'X', role: 'lead', must_change_password: false };
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Outlet context={{ user, expired: false, eventId: 'ev-1', gate: 'ready' }} />,
      children: [{ index: true, element: <EntriesPage eventId="ev-1" /> }],
    },
  ]);
  render(<RouterProvider router={router} />);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});
const realMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

describe('EntriesPage', () => {
  it('lists newest first and filters to mine', async () => {
    await seedEntries();
    renderEntries();
    const rows = await screen.findAllByRole('row');
    expect(rows[1]).toHaveTextContent('Q38');
    expect(rows[5]).toHaveTextContent('Q34');
    await userEvent.click(screen.getByRole('button', { name: /^Mine/ }));
    expect(screen.getAllByRole('row')).toHaveLength(1 + 3);
  });

  it('shows the station in the team cell and no points column', async () => {
    await seedEntries();
    renderEntries();
    const row = (await screen.findAllByRole('row'))[1]!;
    expect(row).toHaveTextContent('Blue 2');
    expect(row).toHaveTextContent('5951');
    expect(row).toHaveTextContent('Tiny Titans');
    expect(row).toHaveTextContent('Played');
    expect(row).toHaveTextContent('Noa Levi');
    expect(screen.queryByRole('columnheader', { name: /points/i })).not.toBeInTheDocument();
  });

  it('Needs a look = refused or not in line-up', async () => {
    await seedEntries({ refused: ['e36'], offLineup: ['e37'] });
    renderEntries();
    await userEvent.click(await screen.findByRole('button', { name: /Needs a look 2/ }));
    expect(screen.getByText('Not in line-up')).toBeInTheDocument();
    expect(screen.getByText(/Not synced:/)).toBeInTheDocument();
    expect(screen.getByText(/This entry is locked/)).toBeInTheDocument();
    // the header, two entries, and the refused one's own line
    expect(screen.getAllByRole('row')).toHaveLength(1 + 2 + 1);
  });

  it('marks a waiting entry next to its time', async () => {
    await seedEntries({ waiting: ['e38'] });
    renderEntries();
    expect(await screen.findByLabelText('waiting to send')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Waiting to send 1' })).toBeInTheDocument();
  });

  it('searches by scouter and the chip counts follow', async () => {
    await seedEntries();
    renderEntries();
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Search entries' }), 'Amit');
    expect(screen.getAllByRole('row')).toHaveLength(1 + 2);
    expect(screen.getByRole('button', { name: 'All 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mine 0' })).toBeInTheDocument();
  });

  it('says so, and offers a way back, when nothing matches', async () => {
    await seedEntries();
    renderEntries();
    await userEvent.type(await screen.findByRole('searchbox'), 'zzz');
    expect(screen.getByText('Nothing matches')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(await screen.findAllByRole('row')).toHaveLength(1 + 5);
  });

  it('shows the empty state with Scout a match', async () => {
    await seedEntries({ none: true });
    renderEntries();
    expect(await screen.findByText('No entries yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Scout a match' })).toHaveAttribute('href', '/scout');
  });

  it('never lists a soft-deleted entry', async () => {
    await seedEntries();
    await db.rows.put({
      ...(await db.rows.get(['scouting_entries', 'e38']))!,
      deleted_at: '2026-03-17T20:00:00.000Z',
    });
    renderEntries();
    expect(await screen.findAllByRole('row')).toHaveLength(1 + 4);
  });

  it.each([
    [
      'edit-window-expired',
      'this entry is locked — ask a lead',
      'This entry is locked — ask a lead',
    ],
    [
      'forbidden',
      'a scouter may edit only their own entry',
      'Not allowed for this account — ask a lead',
    ],
    ['invalid', 'stale base version 3', 'stale base version 3'],
  ] as const)(
    'shows one line for a %s rejection, never the raw code',
    async (code, message, line) => {
      await seedEntries();
      await db.syncState.put({
        row_id: 'e38',
        sync_state: 'pending',
        acked_at: null,
        origin: 'local',
        rejection: { code, message, at: '2026-03-17T09:05:00.000Z' },
      });
      renderEntries();
      const notice = await screen.findByText(line, { exact: false });
      expect(notice).toHaveTextContent(`Not synced: ${line}`);
      expect(screen.getAllByText(/not synced/i)).toHaveLength(1);
      if (code !== 'invalid') expect(document.body).not.toHaveTextContent(code);
    },
  );

  describe('why the last sync failed (UF.13)', () => {
    const failure = {
      at: '2026-03-17T09:41:00.000Z',
      kind: 'timeout',
      text: "The server didn't answer in time",
    };

    it('shows one quiet line above the list while entries wait, and drops it after a sync succeeds', async () => {
      await seedEntries({ waiting: ['e38'] });
      await setMeta(LAST_FAILURE, failure);
      renderEntries();
      const line = await screen.findByText(/^Last try failed: The server didn't answer in time · /);
      expect(line.closest('[role=status]')?.className).toContain('border-s-warn');

      await clearSyncFailure();
      await waitFor(() => expect(screen.queryByText(/Last try failed/)).not.toBeInTheDocument());
    });

    it('says nothing when nothing waits to send', async () => {
      await seedEntries();
      await setMeta(LAST_FAILURE, failure);
      renderEntries();
      await screen.findAllByRole('row');
      expect(screen.queryByText(/Last try failed/)).not.toBeInTheDocument();
    });
  });

  it('shows no rejection line for an entry that synced', async () => {
    await seedEntries();
    await db.syncState.put({ row_id: 'e38', sync_state: 'acked', acked_at: 'x', origin: 'local' });
    renderEntries();
    await screen.findAllByRole('row');
    expect(screen.queryByText(/not synced/i)).not.toBeInTheDocument();
  });

  it('on a phone: one card per entry with the full name and the time', async () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    await seedEntries({ waiting: ['e38'], offLineup: ['e37'] });
    renderEntries();
    const cards = await screen.findAllByRole('listitem');
    expect(cards).toHaveLength(5);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(cards[0]).toHaveTextContent('Q38');
    expect(cards[0]).toHaveTextContent('Noa Levi ·');
    expect(within(cards[0]!).getByLabelText('waiting to send')).toBeInTheDocument();
    expect(within(cards[1]!).getByText('Not in line-up')).toBeInTheDocument();
  });

  // UF.8: the name wraps, never cut; nothing looks tappable until the entry preview exists.
  const AFFORDANCE =
    /cursor-pointer|(^|\s)(hover|active|focus-visible):bg-(?!transparent)|truncate|line-clamp|text-ellipsis|whitespace-nowrap/;

  it('on a phone: a long scouter name is whole and the card looks static', async () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    await seedEntries();
    const long = 'Amit Ben-David Abramovich-Rosenthal';
    await db.rows.put({ ...USERS[1]!, full_name: long });
    renderEntries();
    const cards = await screen.findAllByRole('listitem');
    const name = within(cards[1]!).getByText(long, { exact: false });
    expect(name).toHaveTextContent(`${long} ·`);
    expect(name.className).not.toMatch(AFFORDANCE);
    for (const card of cards) {
      expect(card.className).not.toMatch(AFFORDANCE);
      expect(card).not.toHaveAttribute('role');
      expect(card).not.toHaveAttribute('tabindex');
      expect(card.querySelector('a, button, [role=button], [role=link], [tabindex]')).toBeNull();
    }
  });

  it('on a desktop: rows have no pointer, hover or press state', async () => {
    await seedEntries({ refused: ['e36'] });
    renderEntries();
    const rows = await screen.findAllByRole('row');
    for (const row of rows) {
      expect(row.className).not.toMatch(AFFORDANCE);
      expect(row.className).not.toMatch(/hover:bg-bg/);
      expect(row).not.toHaveAttribute('tabindex');
      expect(row.querySelector('a, button, [role=button], [role=link], [tabindex]')).toBeNull();
    }
  });
});
