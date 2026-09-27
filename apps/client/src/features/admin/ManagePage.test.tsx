import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Role } from '@frc/shared';
import { ManagePage } from './ManagePage';

/** Mounts `<ManagePage rpc={{ call }} />` under the outlet context it reads its user from. */
function renderWithCall(role: Role, call: ReturnType<typeof vi.fn>) {
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
