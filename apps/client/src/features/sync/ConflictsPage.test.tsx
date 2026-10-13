import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatDate,
  formatTime,
  type ConflictItem,
  type ListConflictsOutput,
  type Role,
  type SettledConflict,
} from '@frc/shared';
import { db } from '@/data/db';
import { RpcError, type Rpc } from '@/data/rpc';
import { ConflictsPage, UNDO_MS } from './ConflictsPage';

/*
 * The plan's fixtures in the real server shapes (packages/shared/src/api/conflicts.ts): the
 * server sends `…+00:00`, the device `…Z`; the page compares neither as strings.
 */
const DANA = { id: 'u-dana', full_name: 'Dana Levi' };
const NOA = { id: 'u-noa', full_name: 'Noa Cohen' };

const divergence: ConflictItem = {
  id: 'c-1',
  kind: 'divergence',
  created_at: '2026-11-14T09:10:00+00:00',
  form_kind: 'match',
  team: { id: 't-2096', number: 2096, name: 'ROBACTIVE' },
  match: { id: 'm-12', match_type: 'qualification', number: 12 },
  alliance: 'red',
  live: {
    row_id: 'e-0',
    version: 3,
    form_version_id: 'fv-1',
    author: DANA,
    client_updated_at: '2026-11-14T09:09:00+00:00',
    robot_status: 'played',
    breakdown_seconds: null,
    data: { auto_notes: 9, teleop_notes: 4 },
    deleted_at: null,
  },
  superseded: {
    form_version_id: 'fv-1',
    author: NOA,
    client_updated_at: '2026-11-14T09:07:00.000Z',
    base_version: 2,
    robot_status: 'played',
    breakdown_seconds: null,
    data: { auto_notes: 4, teleop_notes: 4 },
  },
  counted: 'live',
  diff: [
    { field_key: 'robot_status', live: 'played', superseded: 'played', differs: false },
    { field_key: 'breakdown_seconds', live: null, superseded: null, differs: false },
    { field_key: 'auto_notes', live: 9, superseded: 4, differs: true },
    { field_key: 'teleop_notes', live: 4, superseded: 4, differs: false },
  ],
};

const copy = (rowId: string, author: typeof DANA, at: string, data: Record<string, unknown>) => ({
  row_id: rowId,
  version: 1,
  form_version_id: 'fv-1',
  author,
  client_updated_at: at,
  robot_status: 'played',
  breakdown_seconds: null,
  data,
  deleted_at: null,
});

/** `a` arrived second but was saved later; `b` is the row the server already held. */
const duplicate: ConflictItem = {
  id: 'c-2',
  kind: 'duplicate',
  created_at: '2026-11-14T09:11:00+00:00',
  form_kind: 'match',
  team: { id: 't-1577', number: 1577, name: 'Steampunk' },
  match: { id: 'm-3', match_type: 'qualification', number: 3 },
  alliance: 'blue',
  a: copy('e-2', NOA, '2026-11-14T09:05:00+00:00', { auto_notes: 3 }),
  b: copy('e-1', DANA, '2026-11-14T09:00:00+00:00', { auto_notes: 1 }),
  counted: 'a',
  diff: [
    { field_key: 'robot_status', a: 'played', b: 'played', differs: false },
    { field_key: 'breakdown_seconds', a: null, b: null, differs: false },
    { field_key: 'auto_notes', a: 3, b: 1, differs: true },
  ],
};

const RESOLVED = {
  conflict_id: 'c-1',
  resolved_at: '2026-11-14T10:15:00+00:00',
  resolution: { keep: 'live' },
  row_id: 'e-0',
  new_version: null,
  soft_deleted: null,
};

type Answer = () => unknown;
const listOf = (items: ConflictItem[], settled: SettledConflict[] = []): ListConflictsOutput => ({
  items,
  next_cursor: null,
  settled,
});

function rpcFor(
  resolve: Answer = async () => RESOLVED,
  list = () => listOf([divergence, duplicate]),
) {
  return {
    call: vi.fn(async (name: string, _input?: unknown, _options?: unknown) => {
      if (name === 'listConflicts') return list();
      if (name === 'resolveConflict') return resolve();
      return {};
    }),
  } satisfies Rpc;
}

const resolveCalls = (rpc: ReturnType<typeof rpcFor>) =>
  rpc.call.mock.calls.filter(([name]) => name === 'resolveConflict');

const stamp = (iso: string) => `${formatDate(iso)} ${formatTime(iso)}`;

function renderPage(props: { role?: Role; rpc?: Rpc; syncNow?: () => Promise<unknown> } = {}) {
  return render(
    <MemoryRouter>
      <ConflictsPage
        eventId="ev-1"
        role={props.role ?? 'lead'}
        viewerName="Noa Levi"
        rpc={props.rpc ?? rpcFor()}
        syncNow={props.syncNow}
      />
    </MemoryRouter>,
  );
}

/** Only the timers the countdown uses: fake-indexeddb keeps its own (setImmediate) real. */
const fakeClock = () =>
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  await db.rows.bulkPut([
    { entity: 'events', id: 'ev-1', name: 'District #3 · Tel Aviv' },
    {
      entity: 'form_fields',
      id: 'f-1',
      form_version_id: 'fv-1',
      key: 'auto_notes',
      label: 'Auto notes',
      type: 'counter',
      display_order: 2,
      config: {},
      deprecated: false,
    },
    {
      entity: 'form_fields',
      id: 'f-2',
      form_version_id: 'fv-1',
      key: 'teleop_notes',
      label: 'Teleop notes',
      type: 'counter',
      display_order: 3,
      config: {},
      deprecated: false,
    },
    {
      entity: 'match_teams',
      id: 's-1',
      match_id: 'm-12',
      team_id: 't-2096',
      alliance: 'red',
      station: 2,
      deleted_at: null,
    },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ConflictsPage (SPEC-FINAL 9.5, 9.6; 18-conflicts final)', () => {
  it('lists open conflicts with team, match, both authors and both client timestamps', async () => {
    renderPage();
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    expect(item).toHaveTextContent('Q12');
    expect(item).toHaveTextContent('Red 2');
    expect(item).toHaveTextContent('Edited on two phones');
    expect(item).toHaveTextContent('1 field differs');
    expect(within(item).getByRole('columnheader', { name: /Dana/ })).toHaveTextContent(
      `Dana${stamp('2026-11-14T09:09:00+00:00')}Counted now`,
    );
    expect(within(item).getByRole('columnheader', { name: /Noa/ })).toHaveTextContent(
      `Noa${stamp('2026-11-14T09:07:00.000Z')}`,
    );
    expect(within(item).getByRole('columnheader', { name: /Noa/ })).not.toHaveTextContent(
      'Counted now',
    );
    const dup = screen.getByRole('article', { name: /1577 Steampunk/ });
    expect(dup).toHaveTextContent('Scouted twice');
    expect(screen.getByText('District #3 · Tel Aviv · 2 to review')).toBeInTheDocument();
  });

  it('shows only the differing fields until "Show the n that match", and marks each row', async () => {
    const user = userEvent.setup();
    renderPage();
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    expect(within(item).getByRole('row', { name: /Auto notes/ })).toHaveAttribute(
      'data-differs',
      'true',
    );
    expect(within(item).getByRole('row', { name: /Auto notes/ })).toHaveTextContent('Auto notes94');
    expect(within(item).queryByRole('row', { name: /Teleop notes/ })).not.toBeInTheDocument();
    // Robot status matches; breakdown time is null on both copies and is no row at all.
    await user.click(within(item).getByRole('button', { name: /Show the 2 that match/ }));
    expect(within(item).getByRole('row', { name: /Teleop notes/ })).toHaveAttribute(
      'data-differs',
      'false',
    );
    expect(within(item).getByRole('row', { name: /Robot status/ })).toHaveTextContent(
      'Robot statusPlayedPlayed',
    );
    expect(within(item).queryByRole('row', { name: /Breakdown/ })).not.toBeInTheDocument();
    await user.click(within(item).getByRole('button', { name: /Show only the differences/ }));
    expect(within(item).queryByRole('row', { name: /Teleop notes/ })).not.toBeInTheDocument();
  });

  it('offers Keep <live>’s and Restore <other>’s for a divergence, and restore sends keep: superseded', async () => {
    const rpc = rpcFor();
    renderPage({ rpc });
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    expect(within(item).getByRole('button', { name: 'Keep Dana’s' })).toBeEnabled();
    fakeClock();
    fireEvent.click(within(item).getByRole('button', { name: 'Restore Noa’s' }));
    await advance(UNDO_MS);
    vi.useRealTimers();
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('resolveConflict', {
        conflict_id: 'c-1',
        resolution: { keep: 'superseded' },
      }),
    );
  });

  it('offers Keep <author>’s for each row of a duplicate, earlier first, and sends keep_row_id', async () => {
    const rpc = rpcFor();
    renderPage({ rpc });
    const item = await screen.findByRole('article', { name: /1577 Steampunk/ });
    const keeps = within(item).getAllByRole('button', { name: /^Keep / });
    expect(keeps.map((b) => b.textContent)).toEqual(['Keep Dana’s', 'Keep Noa’s']);
    fakeClock();
    fireEvent.click(keeps[1]!);
    await advance(UNDO_MS);
    vi.useRealTimers();
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('resolveConflict', {
        conflict_id: 'c-2',
        resolution: { keep_row_id: 'e-2' },
      }),
    );
  });

  it('lets a scouter read the queue but disables every resolve action, saying who can', async () => {
    renderPage({ role: 'scouter' });
    expect(await screen.findByRole('article', { name: /2096 ROBACTIVE/ })).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /keep|restore/i });
    expect(buttons).toHaveLength(4);
    for (const button of buttons) expect(button).toBeDisabled();
    expect(screen.getByText(/a lead or an admin resolves these/i)).toBeInTheDocument();
    // Reading still works: the matching rows open.
    expect(screen.getAllByRole('button', { name: /that match/ })[0]).toBeEnabled();
  });

  it('reads from the cache while offline and disables resolving, saying a connection is needed', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await db.rows.bulkPut([
      {
        entity: 'sync_conflicts',
        id: 'c-1',
        event_id: 'ev-1',
        kind: 'divergence',
        row_id: 'e-0',
        superseded_payload: { robot_status: 'played', data: { auto_notes: 4 } },
        superseded_author_id: 'u-noa',
        superseded_client_updated_at: '2026-11-14T09:07:00.000Z',
        base_version: 2,
        duplicate_row_id: null,
        created_at: '2026-11-14T09:10:00+00:00',
        resolved_at: null,
      },
      {
        entity: 'scouting_entries',
        id: 'e-0',
        event_id: 'ev-1',
        form_kind: 'match',
        team_id: 't-2096',
        match_id: 'm-12',
        alliance: 'red',
        scouter_id: 'u-dana',
        form_version_id: 'fv-1',
        robot_status: 'played',
        breakdown_seconds: null,
        data: { auto_notes: 9 },
        client_updated_at: '2026-11-14T09:09:00.000Z',
        version: 3,
        deleted_at: null,
      },
      { entity: 'users', id: 'u-dana', full_name: 'Dana Levi', role: 'scouter' },
      { entity: 'users', id: 'u-noa', full_name: 'Noa Cohen', role: 'scouter' },
      { entity: 'teams', id: 't-2096', number: 2096, name: 'ROBACTIVE' },
      { entity: 'matches', id: 'm-12', event_id: 'ev-1', match_type: 'qualification', number: 12 },
    ]);
    const rpc = rpcFor();
    renderPage({ rpc });
    expect(await screen.findByText(/resolving needs a connection/i)).toBeInTheDocument();
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    expect(item).toHaveTextContent('Dana');
    expect(item).toHaveTextContent('Noa');
    const buttons = screen.getAllByRole('button', { name: /keep|restore/i });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button).toBeDisabled();
    expect(rpc.call).not.toHaveBeenCalled();
  });

  it('removes an item once it is resolved, and shows a finished state with today’s log at zero', async () => {
    let listed = [divergence];
    let settled: SettledConflict[] = [];
    const syncNow = vi.fn(async () => undefined);
    const rpc = rpcFor(
      async () => {
        listed = [];
        settled = [
          {
            id: 'c-1',
            kind: 'divergence',
            form_kind: 'match',
            team: divergence.team,
            match: divergence.match,
            resolution: { keep: 'live' },
            resolved_at: '2026-11-14T10:15:00+00:00',
            resolved_by: { id: 'u-lead', full_name: 'Noa Levi' },
            kept: { row_id: 'e-0', author_full_name: 'Dana Levi' },
          },
        ];
        return RESOLVED;
      },
      () => listOf(listed, settled),
    );
    renderPage({ rpc, syncNow });
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    fakeClock();
    fireEvent.click(within(item).getByRole('button', { name: 'Keep Dana’s' }));
    // Folded at once, the count already down.
    expect(screen.getByText('Kept Dana’s copy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Undo, 5 seconds left/ })).toBeInTheDocument();
    await advance(UNDO_MS);
    vi.useRealTimers();
    expect(await screen.findByText(/nothing left to review/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Sync' })).toHaveAttribute('href', '/sync');
    const log = screen.getByRole('region', { name: 'Settled today' });
    await waitFor(() =>
      expect(log).toHaveTextContent(
        `Q12 · 2096 kept Dana’s${formatTime('2026-11-14T10:15:00+00:00')} · Noa L.`,
      ),
    );
    expect(screen.getByText('District #3 · Tel Aviv · all settled')).toBeInTheDocument();
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('renders at 375 px as well as at 1280 px, because it cannot wait for a laptop', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    renderPage();
    expect(await screen.findByRole('article', { name: /2096 ROBACTIVE/ })).toBeInTheDocument();
    expect(screen.queryByText(/needs a computer/i)).not.toBeInTheDocument();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1280,
    });
  });
});

describe('ConflictsPage — Undo is a delayed send (README "Settling a card, and Undo")', () => {
  it('sends nothing before 5 s, then exactly one resolveConflict with the choice', async () => {
    const rpc = rpcFor();
    renderPage({ rpc });
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    fakeClock();
    fireEvent.click(within(item).getByRole('button', { name: 'Keep Dana’s' }));
    await advance(1_000);
    expect(screen.getByRole('button', { name: /^Undo, 4 seconds left/ })).toBeInTheDocument();
    await advance(UNDO_MS - 1 - 1_000);
    expect(resolveCalls(rpc)).toHaveLength(0);
    await advance(1);
    expect(resolveCalls(rpc)).toEqual([
      ['resolveConflict', { conflict_id: 'c-1', resolution: { keep: 'live' } }],
    ]);
  });

  it('Undo cancels: nothing is sent, and the card opens again', async () => {
    const rpc = rpcFor();
    renderPage({ rpc });
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    fakeClock();
    fireEvent.click(within(item).getByRole('button', { name: 'Keep Dana’s' }));
    await advance(3_000);
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    await advance(UNDO_MS * 3);
    expect(resolveCalls(rpc)).toHaveLength(0);
    expect(screen.getByRole('article', { name: /2096 ROBACTIVE/ })).toBeInTheDocument();
    expect(screen.queryByText('Kept Dana’s copy')).not.toBeInTheDocument();
  });

  it('a choice made again after Undo gets its own full 5 s, and only it is sent', async () => {
    const rpc = rpcFor();
    renderPage({ rpc });
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    fakeClock();
    fireEvent.click(within(item).getByRole('button', { name: 'Keep Dana’s' }));
    await advance(3_000);
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    const again = screen.getByRole('article', { name: /2096 ROBACTIVE/ });
    fireEvent.click(within(again).getByRole('button', { name: 'Restore Noa’s' }));
    // The first countdown would have ended here.
    await advance(UNDO_MS - 3_000);
    expect(resolveCalls(rpc)).toHaveLength(0);
    await advance(3_000);
    expect(resolveCalls(rpc)).toEqual([
      ['resolveConflict', { conflict_id: 'c-1', resolution: { keep: 'superseded' } }],
    ]);
  });

  it('leaving the page sends a pending choice at once', async () => {
    const rpc = rpcFor();
    const syncNow = vi.fn(async () => undefined);
    const { unmount } = renderPage({ rpc, syncNow });
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    fakeClock();
    fireEvent.click(within(item).getByRole('button', { name: 'Restore Noa’s' }));
    await advance(1_000);
    expect(resolveCalls(rpc)).toHaveLength(0);
    unmount();
    expect(resolveCalls(rpc)).toEqual([
      ['resolveConflict', { conflict_id: 'c-1', resolution: { keep: 'superseded' } }],
    ]);
    // Nothing more goes when the countdown would have ended.
    await advance(UNDO_MS);
    vi.useRealTimers();
    expect(resolveCalls(rpc)).toHaveLength(1);
    await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1));
  });

  it('pagehide sends a pending choice at once, kept alive past the page', async () => {
    const rpc = rpcFor();
    renderPage({ rpc });
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    fakeClock();
    fireEvent.click(within(item).getByRole('button', { name: 'Keep Dana’s' }));
    window.dispatchEvent(new Event('pagehide'));
    expect(resolveCalls(rpc)).toEqual([
      [
        'resolveConflict',
        { conflict_id: 'c-1', resolution: { keep: 'live' } },
        { keepalive: true },
      ],
    ]);
  });

  it('a failed send reopens the card with the error', async () => {
    const rpc = rpcFor(async () => {
      throw new RpcError('offline', 'could not reach the server', 0);
    });
    renderPage({ rpc });
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    fakeClock();
    fireEvent.click(within(item).getByRole('button', { name: 'Keep Dana’s' }));
    await advance(UNDO_MS);
    vi.useRealTimers();
    const again = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    expect(within(again).getByRole('alert')).toHaveTextContent(
      'Not settled: Could not reach the server.',
    );
    expect(within(again).getByRole('button', { name: 'Keep Dana’s' })).toBeEnabled();
  });

  it('409: someone else settled it — the card is dropped with a word, and the queue refreshed', async () => {
    const rpc = rpcFor(async () => {
      throw new RpcError('conflict', 'this conflict is already resolved', 409, true);
    });
    renderPage({ rpc });
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    fakeClock();
    fireEvent.click(within(item).getByRole('button', { name: 'Keep Dana’s' }));
    await advance(UNDO_MS);
    vi.useRealTimers();
    expect(
      await screen.findByText('Q12 2096: someone else settled this one first.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: /2096 ROBACTIVE/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Kept Dana’s copy')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(rpc.call.mock.calls.filter(([n]) => n === 'listConflicts')).toHaveLength(2),
    );
    // The other card is untouched.
    expect(screen.getByRole('article', { name: /1577 Steampunk/ })).toBeInTheDocument();
  });

  it('404: an entry it names is gone — the card is dropped', async () => {
    const rpc = rpcFor(async () => {
      throw new RpcError('not-found', 'no such conflict', 404, true);
    });
    renderPage({ rpc });
    const item = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    fakeClock();
    fireEvent.click(within(item).getByRole('button', { name: 'Keep Dana’s' }));
    await advance(UNDO_MS);
    vi.useRealTimers();
    expect(
      await screen.findByText('Q12 2096: an entry it names no longer exists.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: /2096 ROBACTIVE/ })).not.toBeInTheDocument();
  });

  it('two cards counting down at once each send their own choice', async () => {
    const rpc = rpcFor();
    renderPage({ rpc });
    const first = await screen.findByRole('article', { name: /2096 ROBACTIVE/ });
    const second = screen.getByRole('article', { name: /1577 Steampunk/ });
    fakeClock();
    fireEvent.click(within(first).getByRole('button', { name: 'Keep Dana’s' }));
    await advance(2_000);
    fireEvent.click(within(second).getByRole('button', { name: 'Keep Dana’s' }));
    expect(screen.getAllByRole('button', { name: /^Undo/ })).toHaveLength(2);
    expect(screen.getByText('District #3 · Tel Aviv · 0 to review')).toBeInTheDocument();
    await advance(UNDO_MS - 2_000);
    expect(resolveCalls(rpc)).toEqual([
      ['resolveConflict', { conflict_id: 'c-1', resolution: { keep: 'live' } }],
    ]);
    await advance(2_000);
    expect(resolveCalls(rpc)).toEqual([
      ['resolveConflict', { conflict_id: 'c-1', resolution: { keep: 'live' } }],
      ['resolveConflict', { conflict_id: 'c-2', resolution: { keep_row_id: 'e-1' } }],
    ]);
  });
});
