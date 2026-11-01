import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider, useParams } from 'react-router-dom';
import type { EntrySummary, QueryEntriesOutput } from '@frc/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, setMeta, type CachedRow } from '@/data/db';
import type { Rpc } from '@/data/rpc';
import { sessionOverride } from '@/features/context/sessionOverride';
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
        message: 'changed after the 5-minute edit window. A lead can save it for you.',
        at: '2026-03-17T09:05:00.000Z',
      },
    });
  }
}

function Probe() {
  return <p>preview of {useParams().id}</p>;
}

function renderEntries({ me = 'u-noa', rpc }: { me?: string; rpc?: Rpc } = {}) {
  const user = { id: me, username: 'x', full_name: 'X', role: 'lead', must_change_password: false };
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Outlet context={{ user, expired: false, eventId: 'ev-1', gate: 'ready' }} />,
      children: [
        { index: true, element: <EntriesPage eventId="ev-1" rpc={rpc} /> },
        { path: 'entries/:id', element: <Probe /> },
      ],
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

  it('shows the team number and name without the station tag, and a points column', async () => {
    await seedEntries();
    renderEntries();
    const row = (await screen.findAllByRole('row'))[1]!;
    expect(row).not.toHaveTextContent('Blue 2');
    expect(row).toHaveTextContent('5951');
    expect(row).toHaveTextContent('Tiny Titans');
    expect(row).toHaveTextContent('Played');
    expect(row).toHaveTextContent('Noa Levi');
    expect(screen.getByRole('columnheader', { name: /points/i })).toBeInTheDocument();
  });

  it('Needs a look = refused or not in line-up', async () => {
    await seedEntries({ refused: ['e36'], offLineup: ['e37'] });
    renderEntries();
    await userEvent.click(await screen.findByRole('button', { name: /Needs a look 2/ }));
    expect(screen.getByText('Not in line-up')).toBeInTheDocument();
    expect(screen.getByText(/Not sent:/)).toBeInTheDocument();
    expect(
      screen.getByText(/Changed after the 5-minute edit window\. A lead can save it for you\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/This entry is locked/)).not.toBeInTheDocument();
    // the header, two entries, and the refused one's own line
    expect(screen.getAllByRole('row')).toHaveLength(1 + 2 + 1);
  });

  it('marks a waiting entry next to its time', async () => {
    await seedEntries({ waiting: ['e38'] });
    renderEntries();
    expect(await screen.findByLabelText('waiting to send')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Waiting 1' })).toBeInTheDocument();
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
      'changed after the 5-minute edit window. A lead can save it for you.',
      'Changed after the 5-minute edit window. A lead can save it for you.',
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
      // One label for every refusal, the same as on Sync (SPEC-FINAL 7.6, v1.44).
      expect(notice).toHaveTextContent(`Not sent: ${line}`);
      expect(screen.getAllByText(/not sent:/i)).toHaveLength(1);
      expect(document.body).not.toHaveTextContent(/not synced/i);
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

  // UF.8: the name wraps, never cut — on a card that is now one link to the entry's preview.
  const CUT = /truncate|line-clamp|text-ellipsis|whitespace-nowrap/;

  it('on a phone: a long scouter name is whole, and every card is a link to its preview', async () => {
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
    expect(name.className).not.toMatch(CUT);
    const ids = ['e38', 'e37', 'e36', 'e35', 'e34'];
    cards.forEach((card, i) => {
      const links = within(card).getAllByRole('link');
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute('href', `/entries/${ids[i]}`);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('on a desktop: every row is one link to /entries/<id>, lit on hover and focus', async () => {
    await seedEntries({ refused: ['e36'] });
    renderEntries();
    const body = (await screen.findAllByRole('rowgroup'))[1]!;
    const links = within(body).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/entries/e38',
      '/entries/e37',
      '/entries/e36',
      '/entries/e35',
      '/entries/e34',
    ]);
    for (const link of links) {
      expect(link.closest('tr')?.className).toContain('hover:bg-accent-tint');
      expect(link.closest('tr')?.className).toContain('has-[a:focus-visible]:bg-accent-tint');
    }
  });

  it('a click on a row opens the preview as a full page, not a drawer', async () => {
    await seedEntries({ offLineup: ['e37'] });
    renderEntries();
    const link = await screen.findByRole('link', { name: /^Q37 3316 D-Bug/ });
    await userEvent.click(link);
    expect(await screen.findByText('preview of e37')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('never lists another event’s entry', async () => {
    await seedEntries();
    await db.rows.put({
      entity: 'scouting_entries',
      id: 'e-far',
      event_id: 'ev-2',
      match_id: 'm38',
      team_id: 't-1',
      alliance: 'blue',
      scouter_id: 'u-noa',
      robot_status: 'played',
      data: {},
      deleted_at: null,
      client_created_at: '2026-03-17T23:00:00.000Z',
      client_updated_at: '2026-03-17T23:00:00.000Z',
    });
    renderEntries();
    expect(await screen.findAllByRole('row')).toHaveLength(1 + 5);
    expect(document.querySelector('a[href="/entries/e-far"]')).toBeNull();
  });

  describe('super entries and the kind switch (26-entry-search final)', () => {
    async function seedSupers() {
      await seedEntries();
      const supers: [string, string, string, string | null][] = [
        ['s1', 'u-noa', '2026-03-17T13:30:00.000Z', null],
        ['s2', 'u-amit', '2026-03-17T11:30:00.000Z', null],
        ['s-gone', 'u-noa', '2026-03-17T12:30:00.000Z', '2026-03-17T20:00:00.000Z'],
      ];
      await db.rows.bulkPut(
        supers.map(([id, scouter, at, deleted]) => ({
          entity: 'scouting_entries',
          id,
          event_id: 'ev-1',
          form_kind: 'super',
          match_id: null,
          team_id: 't-2',
          alliance: null,
          scouter_id: scouter,
          robot_status: null,
          data: {},
          deleted_at: deleted,
          client_created_at: at,
          client_updated_at: at,
        })),
      );
    }

    it('lists super entries by time with "—", the SUPER tag and no points', async () => {
      await seedSupers();
      renderEntries();
      const rows = await screen.findAllByRole('row');
      // header, then e38 (14:00), s1 (13:30), e37 (13:00), e36, s2 (11:30), e35, e34
      expect(rows).toHaveLength(1 + 7);
      expect(rows[2]).toHaveTextContent('SUPER');
      const cells = within(rows[2]!).getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('—');
      expect(cells[5]!.textContent).toBe('');
      expect(screen.getByRole('radio', { name: 'Both 7' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('radio', { name: 'Match 5' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Super 2' })).toBeInTheDocument();
    });

    it('Super only shows only super rows, and the chips count them', async () => {
      await seedSupers();
      renderEntries();
      await userEvent.click(await screen.findByRole('radio', { name: 'Super 2' }));
      const body = screen.getAllByRole('rowgroup')[1]!;
      const rows = within(body).getAllByRole('row');
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row).toHaveTextContent('SUPER');
      expect(screen.getByRole('button', { name: 'All 2' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mine 1' })).toBeInTheDocument();
      // A deleted super entry never shows.
      expect(document.querySelector('a[href="/entries/s-gone"]')).toBeNull();
    });
  });
});

/**
 * SPEC-FINAL 6.3: under a session override the device holds only the default event, so the list
 * is the server's `queryEntries` for the overridden event, held offline (9.6 cross_event_view).
 */
describe('EntriesPage under a session override', () => {
  const online = vi.spyOn(navigator, 'onLine', 'get');
  const summary = (o: Partial<EntrySummary> & { id: string }): EntrySummary => ({
    event_id: 'ev-2',
    form_kind: 'match',
    match_id: 'm-h1',
    match_type: 'qualification',
    match_number: 12,
    match_label: 'Q12',
    team_id: 't-9',
    team_number: 1690,
    team_name: 'Orbit',
    alliance: 'red',
    scouter_id: 'u-noa',
    scouter_name: 'Noa Levi',
    robot_status: 'played',
    scouted_points: 47,
    client_created_at: '2026-03-04T09:00:00.000Z',
    client_updated_at: '2026-03-04T09:00:00.000Z',
    ...o,
  });
  const PAGE_1: QueryEntriesOutput = {
    items: [
      summary({ id: 'h1' }),
      summary({
        id: 'h2',
        form_kind: 'super',
        match_id: null,
        match_type: null,
        match_number: null,
        match_label: null,
        alliance: null,
        robot_status: null,
        scouted_points: null,
        scouter_id: 'u-amit',
        scouter_name: 'Amit Ben-David',
        client_created_at: '2026-03-04T08:30:00.000Z',
      }),
    ],
    next_cursor: 'c-2',
  };
  const PAGE_2: QueryEntriesOutput = {
    items: [
      summary({
        id: 'h3',
        match_number: 11,
        match_label: 'Q11',
        team_number: 4590,
        team_name: 'GreenBlitz',
        robot_status: 'no_show',
        scouted_points: null,
        scouter_id: 'u-amit',
        scouter_name: 'Amit Ben-David',
        client_created_at: '2026-03-04T08:00:00.000Z',
      }),
    ],
    next_cursor: null,
  };
  const rpcFor = (): Rpc & { call: ReturnType<typeof vi.fn> } => ({
    call: vi.fn(async (_name: string, input?: unknown) =>
      (input as { cursor?: string }).cursor === 'c-2' ? PAGE_2 : PAGE_1,
    ),
  });

  beforeEach(() => {
    online.mockReturnValue(true);
    sessionOverride.set('ev-2', 'Week 3 · Haifa');
  });
  afterEach(() => {
    sessionOverride.clear();
    online.mockReset();
  });

  it('lists the override event’s entries from queryEntries, every page, with the server’s points', async () => {
    await seedEntries();
    const rpc = rpcFor();
    renderEntries({ rpc });
    const rows = await screen.findAllByRole('row');
    expect(rpc.call).toHaveBeenNthCalledWith(1, 'queryEntries', { event_id: 'ev-2', limit: 200 });
    expect(rpc.call).toHaveBeenNthCalledWith(2, 'queryEntries', {
      event_id: 'ev-2',
      limit: 200,
      cursor: 'c-2',
    });
    expect(rpc.call).toHaveBeenCalledTimes(2);
    // header, then h1 (Q12), h2 (super), h3 (Q11): never the device's ev-1 entries.
    expect(rows).toHaveLength(1 + 3);
    expect(document.querySelector('a[href="/entries/e38"]')).toBeNull();
    expect(document.querySelector('a[href="/entries/h1"]')).not.toBeNull();
    expect(rows[1]).toHaveTextContent('Q12');
    expect(rows[1]).toHaveTextContent('1690');
    expect(rows[1]).toHaveTextContent('Orbit');
    expect(rows[1]).toHaveTextContent('Noa Levi');
    expect(within(rows[1]!).getAllByRole('cell')[5]).toHaveTextContent('47');
    // The super row: the SUPER tag, "—" for the match, no points.
    expect(rows[2]).toHaveTextContent('SUPER');
    const superCells = within(rows[2]!).getAllByRole('cell');
    expect(superCells[0]).toHaveTextContent('—');
    expect(superCells[5]!.textContent).toBe('');
    // A no-show: "—", never a zero.
    expect(within(rows[3]!).getAllByRole('cell')[5]).toHaveTextContent('—');
  });

  it('keeps the switch, the search and Mine; Waiting and Needs a look are not offered', async () => {
    renderEntries({ rpc: rpcFor() });
    expect(await screen.findByRole('radio', { name: 'Both 3' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Super 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Waiting/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Needs a look/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Mine 1' }));
    expect(screen.getAllByRole('row')).toHaveLength(1 + 1);
    await userEvent.click(screen.getByRole('button', { name: /^All/ }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search entries' }), 'green');
    const body = screen.getAllByRole('rowgroup')[1]!;
    expect(within(body).getAllByRole('row')).toHaveLength(1);
    expect(body).toHaveTextContent('GreenBlitz');
  });

  it('offline: says other events need a connection, makes no call, and offers the way back', async () => {
    online.mockReturnValue(false);
    const rpc = rpcFor();
    renderEntries({ rpc });
    expect(
      await screen.findByRole('heading', { name: 'This needs the server' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/other events need a connection/i)).toBeInTheDocument();
    expect(rpc.call).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /^Back to/ }));
    expect(sessionOverride.get()).toBeNull();
  });

  it('a failed read says so and tries again', async () => {
    const rpc = rpcFor();
    rpc.call.mockRejectedValueOnce(new Error('down'));
    renderEntries({ rpc });
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByRole('row')).toHaveLength(1 + 3);
  });

  it('without an override the list is the device’s and no rpc call is made', async () => {
    sessionOverride.clear();
    await seedEntries();
    const rpc = rpcFor();
    renderEntries({ rpc });
    expect(await screen.findAllByRole('row')).toHaveLength(1 + 5);
    expect(screen.getByRole('button', { name: /^Waiting/ })).toBeInTheDocument();
    expect(rpc.call).not.toHaveBeenCalled();
  });
});
