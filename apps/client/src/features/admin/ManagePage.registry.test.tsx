import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ManagePage } from './ManagePage';

const SEASON = { id: 's-26', year: 2026, game_name: 'REBUILT', field_image_path: 'f.webp' };
const EVENT = { id: 'e-1', season_id: 's-26', name: 'District #1', sort_order: 1 };

describe('ManagePage registry', () => {
  it('Try again on the teams list asks the registry once more', async () => {
    let teamsDown = true;
    const call = vi.fn(async (name: string, input?: unknown) => {
      if (name === 'listSeasons') return { items: [SEASON], next_cursor: null };
      if (name === 'getActiveContext') return { active_season_id: 's-26', active_event_id: 'e-1' };
      if (name === 'listEvents') return { items: [EVENT], next_cursor: null };
      if (name === 'listEventRoster') return { items: [] };
      if (name === 'listMatches') return { items: [], next_cursor: null };
      if (name === 'listTeams' && !(input as { query?: string }).query) {
        if (teamsDown) throw new Error('the teams are down');
        return { items: [{ id: 't-1', number: 1574, name: 'MisCar' }], next_cursor: null };
      }
      return undefined;
    });
    const user = {
      id: 'u-1',
      username: 'a',
      full_name: 'A',
      role: 'admin',
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
    await userEvent.click(await screen.findByRole('tab', { name: /Teams & roster/ }));
    expect(await screen.findByText('the teams are down')).toBeInTheDocument();

    teamsDown = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('button', { name: 'Add 1574 MisCar to the roster' }),
    ).toBeInTheDocument();
  });
});
