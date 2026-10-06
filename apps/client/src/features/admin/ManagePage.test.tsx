import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@frc/shared';
import { RpcError } from '@/data/rpc';
import { ManagePage } from './ManagePage';

/**
 * Mounts `<ManagePage rpc={{ call }} />` under the outlet context it reads its user from.
 * `strict` wraps it in `<StrictMode>` (follow-up fix): dev-mode's setup → cleanup → setup
 * of the mount effect is what exposed `mountedRef` never being set back to `true`.
 */
function renderWithCall(role: Role, call: ReturnType<typeof vi.fn>, strict = false) {
  const user = {
    id: 'u-1',
    username: 'seed_user',
    full_name: 'Seed User',
    role,
    must_change_password: false,
  };
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Outlet context={{ user, expired: false, eventId: null }} />,
      children: [{ index: true, element: <ManagePage rpc={{ call }} /> }],
    },
  ]);
  const tree = <RouterProvider router={router} />;
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/**
 * Orchestrator addendum item 2: the role gate. `ManagePage` reads the signed-in user
 * from the outlet context, exactly as `useSignedInUser()` does under the real shell, so
 * it is mounted the same way here — a parent route supplying that context — without the
 * whole of `AppShell` (that is `AppShell.test.tsx`'s job).
 */
function renderPage(role: Role) {
  const call = vi.fn(async (name: string) => {
    if (name === 'listSeasons') return { items: [], next_cursor: null };
    if (name === 'getActiveContext') return { active_season_id: null, active_event_id: null };
    return {};
  });
  const user = {
    id: 'u-1',
    username: 'seed_user',
    full_name: 'Seed User',
    role,
    must_change_password: false,
  };
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Outlet context={{ user, expired: false, eventId: null }} />,
      children: [{ index: true, element: <ManagePage rpc={{ call }} /> }],
    },
  ]);
  render(<RouterProvider router={router} />);
  return { call };
}

describe('ManagePage', () => {
  it('shows the Seasons tab to an admin', async () => {
    renderPage('admin');
    expect(await screen.findByRole('tab', { name: 'Seasons' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Events' })).toBeInTheDocument();
  });

  it.each(['scouter', 'lead'] as const)(
    'shows the not-permitted state to a %s, and makes no request',
    async (role) => {
      const { call } = renderPage(role);
      expect(
        await screen.findByText(/only an admin can manage seasons and events/i),
      ).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(call).not.toHaveBeenCalled();
    },
  );

  // ---------------------------------------------------------------------------------
  // Review finding (task 1.20): an empty install's very first season must reach the
  // Events tab without a reload.
  it('picks up a season created on the Seasons tab as soon as the Events tab is opened', async () => {
    let seasons: Array<{
      id: string;
      year: number;
      game_name: string;
      field_image_path: string;
    }> = [];
    const call = vi.fn(async (name: string, input?: unknown) => {
      if (name === 'listSeasons') return { items: seasons, next_cursor: null };
      if (name === 'getActiveContext') return { active_season_id: null, active_event_id: null };
      if (name === 'createSeason') {
        const body = input as { year: number; game_name: string; field_image_path: string };
        const created = { id: 's-new', ...body };
        seasons = [created];
        return created;
      }
      if (name === 'listEvents') return { items: [], next_cursor: null };
      return {};
    });
    const user = userEvent.setup();
    renderWithCall('admin', call);

    // Before any season exists, the Events tab has nothing to manage.
    await user.click(await screen.findByRole('tab', { name: 'Events' }));
    expect(await screen.findByText(/create a season first/i)).toBeInTheDocument();

    // Create the first season from the Seasons tab.
    await user.click(screen.getByRole('tab', { name: 'Seasons' }));
    await user.click(await screen.findByRole('button', { name: /new season/i }));
    await user.type(screen.getByLabelText(/year/i), '2026');
    await user.type(screen.getByLabelText(/game name/i), 'CRESCENDO');
    await user.type(screen.getByLabelText(/game image path/i), 'seasons/2026/field.webp');
    await user.click(screen.getByRole('button', { name: /create season/i }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('createSeason', expect.anything()));

    // Switching to Events now finds the new season with no reload.
    await user.click(screen.getByRole('tab', { name: 'Events' }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('listEvents', { season_id: 's-new' }));
    expect(screen.queryByText(/create a season first/i)).not.toBeInTheDocument();
  });
});

// Follow-up fix: `mountedRef` was set false in the mount effect's cleanup but never back to
// true in its setup, so StrictMode's dev-mode setup → cleanup → setup left it false for
// good — silently disabling `onChanged`'s `refreshSeasons` call and bringing back exactly
// the task 1.20 bug the test above already covers, but only under StrictMode (main.tsx's
// real render tree).
describe('ManagePage under StrictMode', () => {
  it('still picks up a season created on the Seasons tab as soon as the Events tab is opened', async () => {
    let seasons: Array<{
      id: string;
      year: number;
      game_name: string;
      field_image_path: string;
    }> = [];
    const call = vi.fn(async (name: string, input?: unknown) => {
      if (name === 'listSeasons') return { items: seasons, next_cursor: null };
      if (name === 'getActiveContext') return { active_season_id: null, active_event_id: null };
      if (name === 'createSeason') {
        const body = input as { year: number; game_name: string; field_image_path: string };
        const created = { id: 's-new', ...body };
        seasons = [created];
        return created;
      }
      if (name === 'listEvents') return { items: [], next_cursor: null };
      return {};
    });
    const user = userEvent.setup();
    renderWithCall('admin', call, true);

    await user.click(await screen.findByRole('tab', { name: 'Events' }));
    expect(await screen.findByText(/create a season first/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Seasons' }));
    await user.click(await screen.findByRole('button', { name: /new season/i }));
    await user.type(screen.getByLabelText(/year/i), '2026');
    await user.type(screen.getByLabelText(/game name/i), 'CRESCENDO');
    await user.type(screen.getByLabelText(/game image path/i), 'seasons/2026/field.webp');
    await user.click(screen.getByRole('button', { name: /create season/i }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('createSeason', expect.anything()));

    // Under StrictMode, `mountedRef` must still read true here, or this never fires.
    await user.click(screen.getByRole('tab', { name: 'Events' }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('listEvents', { season_id: 's-new' }));
    expect(screen.queryByText(/create a season first/i)).not.toBeInTheDocument();
  });
});

// Branch review, finding 6: an Events-tab refresh started for one season must never land
// after the admin has picked another, or Roster/Matches would edit the other season's event.
describe('ManagePage and a stale events refresh', () => {
  it('drops a refresh for season X once season Y is selected', async () => {
    const seasons = [
      {
        id: 's-x',
        year: 2026,
        game_name: 'CRESCENDO',
        field_image_path: 'seasons/2026/field.webp',
      },
      {
        id: 's-y',
        year: 2025,
        game_name: 'REEFSCAPE',
        field_image_path: 'seasons/2026/field.webp',
      },
    ];
    const eventsOf: Record<
      string,
      Array<{ id: string; season_id: string; name: string; sort_order: number }>
    > = {
      's-x': [{ id: 'ex-1', season_id: 's-x', name: 'Week 1', sort_order: 1 }],
      's-y': [
        { id: 'ey-1', season_id: 's-y', name: 'Champs', sort_order: 1 },
        { id: 'ey-2', season_id: 's-y', name: 'Offseason', sort_order: 2 },
      ],
    };
    let holdX = false;
    const heldX: Array<() => void> = [];
    const call = vi.fn(async (name: string, input?: unknown) => {
      if (name === 'listSeasons') return { items: seasons, next_cursor: null };
      if (name === 'getActiveContext') return { active_season_id: 's-x', active_event_id: 'ex-1' };
      if (name === 'createEvent') {
        holdX = true;
        return { id: 'ex-2', season_id: 's-x', name: 'Week 2', sort_order: 2 };
      }
      if (name === 'listEvents') {
        const seasonId = (input as { season_id: string }).season_id;
        const answer = { items: eventsOf[seasonId] ?? [], next_cursor: null };
        if (seasonId === 's-x' && holdX) {
          return new Promise((resolve) => heldX.push(() => resolve(answer)));
        }
        return answer;
      }
      if (name === 'listEventRoster') return { items: [], next_cursor: null };
      if (name === 'listTeams') return { items: [], next_cursor: null };
      if (name === 'listMatches') return { items: [], next_cursor: null };
      return {};
    });
    const user = userEvent.setup();
    renderWithCall('admin', call);

    await user.click(await screen.findByRole('tab', { name: 'Events' }));
    await user.click(await screen.findByRole('button', { name: 'New event' }));
    await user.type(screen.getByLabelText('Name'), 'Week 2');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await waitFor(() => expect(heldX.length).toBeGreaterThan(0));

    await user.selectOptions(screen.getByLabelText('Season'), 's-y');
    await waitFor(() => expect(call).toHaveBeenCalledWith('listEvents', { season_id: 's-y' }));
    // The refresh for X answers only now, after Y was chosen.
    await act(async () => {
      for (const release of heldX) release();
    });

    await user.click(screen.getByRole('tab', { name: 'Matches' }));
    const eventPicker = await screen.findByLabelText('Event');
    expect(eventPicker).toHaveValue('ey-1');
    expect(screen.queryByRole('option', { name: 'Week 1' })).not.toBeInTheDocument();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Manage page fix: offline is said at once, with no request, and the page loads by itself
// when the connection returns.
describe('ManagePage while offline', () => {
  function emptyCall() {
    return vi.fn(async (name: string) => {
      if (name === 'listSeasons') return { items: [], next_cursor: null };
      if (name === 'getActiveContext') return { active_season_id: null, active_event_id: null };
      return {};
    });
  }

  it('says it needs a connection at once, mounts no panel and makes no request', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const call = emptyCall();
    renderWithCall('admin', call);

    expect(
      await screen.findByText(
        /managing seasons, events, rosters and matches needs a connection\. this page loads by itself when the connection returns\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it('loads by itself when the browser fires online', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const call = emptyCall();
    renderWithCall('admin', call);
    await screen.findByText(/needs a connection/i);
    expect(call).not.toHaveBeenCalled();

    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(await screen.findByRole('tab', { name: 'Seasons' })).toBeInTheDocument();
    expect(screen.queryByText(/needs a connection/i)).not.toBeInTheDocument();
    await waitFor(() => expect(call).toHaveBeenCalledWith('listSeasons', {}));
  });

  it('keeps the page and an open form, with what was typed, when the connection drops after load', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const call = emptyCall();
    const user = userEvent.setup();
    renderWithCall('admin', call);
    await user.click(await screen.findByRole('button', { name: /new season/i }));
    await user.type(screen.getByLabelText(/game name/i), 'CRESC');
    const requests = call.mock.calls.length;

    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(
      await screen.findByText('No connection — changes cannot be saved until it returns.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/game name/i)).toHaveValue('CRESC');
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.queryByText(/this page loads by itself/i)).not.toBeInTheDocument();
    expect(call.mock.calls.length).toBe(requests);

    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() =>
      expect(
        screen.queryByText(/no connection — changes cannot be saved/i),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/game name/i)).toHaveValue('CRESC');
  });
});

// Manage page fix: a request that failed is not "no seasons". The Events tab used to say
// "Create a season first" when listSeasons never answered.
describe.each(['listSeasons', 'getActiveContext'])('ManagePage when %s fails', (failing) => {
  it('shows a failure on the Events tab, never "Create a season first"', async () => {
    const call = vi.fn(async (name: string) => {
      if (name === failing) throw new Error('the database is unwell');
      if (name === 'listSeasons') return { items: [], next_cursor: null };
      if (name === 'getActiveContext') return { active_season_id: null, active_event_id: null };
      return {};
    });
    const user = userEvent.setup();
    renderWithCall('admin', call);
    await user.click(await screen.findByRole('tab', { name: 'Events' }));

    expect(await screen.findByText(/the database is unwell/i)).toBeInTheDocument();
    expect(screen.queryByText(/create a season first/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Matches' }));
    expect(await screen.findByText(/the database is unwell/i)).toBeInTheDocument();
    expect(screen.queryByText(/create a season first/i)).not.toBeInTheDocument();
  });

  it('shows the connection state for an unanswered request, and Try again recovers', async () => {
    let down = true;
    const call = vi.fn(async (name: string) => {
      if (down && name === failing) throw new RpcError('offline', 'could not reach the server', 0);
      if (name === 'listSeasons') {
        return {
          items: [
            { id: 's-1', year: 2026, game_name: 'CRESCENDO', field_image_path: 'seasons/f.webp' },
          ],
          next_cursor: null,
        };
      }
      if (name === 'getActiveContext') return { active_season_id: 's-1', active_event_id: null };
      if (name === 'listEvents') return { items: [], next_cursor: null };
      return {};
    });
    const user = userEvent.setup();
    renderWithCall('admin', call);
    await user.click(await screen.findByRole('tab', { name: 'Events' }));

    expect(await screen.findByText(/this needs the server/i)).toBeInTheDocument();
    expect(screen.queryByText(/create a season first/i)).not.toBeInTheDocument();

    down = false;
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('region', { name: 'Events' })).toBeInTheDocument();
  });
});

// Manage page fix: a reorder or "make the default" refreshes the page's own event list in
// the background; the Events panel stays mounted and never goes back to "Loading…".
describe('ManagePage and an Events-tab change', () => {
  it('refreshes its events in the background without remounting or blanking the panel', async () => {
    const events = [
      { id: 'e-1', season_id: 's-1', name: 'Week 1', sort_order: 1 },
      { id: 'e-2', season_id: 's-1', name: 'Week 3', sort_order: 2 },
    ];
    let reordered = false;
    let listings = 0;
    const call = vi.fn(async (name: string, input?: unknown) => {
      if (name === 'listSeasons') {
        return {
          items: [
            { id: 's-1', year: 2026, game_name: 'CRESCENDO', field_image_path: 'seasons/f.webp' },
          ],
          next_cursor: null,
        };
      }
      if (name === 'getActiveContext') return { active_season_id: 's-1', active_event_id: 'e-1' };
      if (name === 'listEvents') {
        listings += 1;
        // The listing after the move is the page's background one: hold it open.
        if (reordered) return new Promise(() => {});
        return { items: events, next_cursor: null };
      }
      if (name === 'reorderEvents') {
        reordered = true;
        const ids = (input as { event_ids: string[] }).event_ids;
        return {
          items: ids.map((id, i) => ({ ...events.find((e) => e.id === id)!, sort_order: i + 1 })),
        };
      }
      return {};
    });
    const user = userEvent.setup();
    renderWithCall('admin', call);
    await user.click(await screen.findByRole('tab', { name: 'Events' }));
    const panel = await screen.findByRole('region', { name: 'Events' });
    await screen.findByRole('button', { name: /move week 1 down/i });
    const before = listings;

    await user.click(screen.getByRole('button', { name: /move week 1 down/i }));
    await waitFor(() => expect(listings).toBe(before + 1));

    expect(screen.getByRole('region', { name: 'Events' })).toBe(panel);
    expect(screen.queryByText(/loading the events/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Week 3');
  });
});
