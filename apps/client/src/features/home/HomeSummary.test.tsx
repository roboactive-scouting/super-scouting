import { render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@frc/shared';
import { db } from '@/data/db';
import { sessionOverride } from '@/features/context/sessionOverride';
import type { ShellContext } from '@/features/shell/shellContext';
import { HomeSummary } from './HomeSummary';

const EVENT = 'ev-1';

function renderHome(over: Partial<ShellContext> = {}, role: Role = 'scouter') {
  const context: ShellContext = {
    user: {
      id: 'u-1',
      username: 'seed_scouter',
      full_name: 'Seed Scouter',
      role,
      must_change_password: false,
    },
    expired: false,
    eventId: EVENT,
    gate: 'fresh',
    ...over,
  };
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Outlet context={context} />,
      children: [{ index: true, element: <HomeSummary /> }],
    },
  ]);
  render(<RouterProvider router={router} />);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.put({ entity: 'events', id: EVENT, season_id: 'se-1', name: 'Week 1' });
});
afterEach(() => sessionOverride.clear());

describe('HomeSummary (redesign R.8, SPEC-FINAL 17.9)', () => {
  it('names the competition this device works on, with Scout as the one primary action', async () => {
    renderHome();
    expect(await screen.findByRole('heading', { level: 1, name: 'Week 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Scout a match' })).toHaveAttribute('href', '/scout');
    expect(screen.getByRole('link', { name: 'Review entries' })).toHaveAttribute(
      'href',
      '/entries',
    );
    expect(screen.queryByRole('link', { name: 'Manage competitions' })).not.toBeInTheDocument();
  });

  it('gives an admin the way to manage competitions', async () => {
    renderHome({}, 'admin');
    expect(await screen.findByRole('link', { name: 'Manage competitions' })).toHaveAttribute(
      'href',
      '/admin/manage',
    );
  });

  it('under a session override, names the other event and offers no new entry (SPEC-FINAL 6.3)', async () => {
    sessionOverride.set('ev-3', 'Week 3');
    renderHome();
    expect(await screen.findByRole('heading', { level: 1, name: 'Week 3' })).toBeInTheDocument();
    expect(await screen.findByText(/new entries are paused/i)).toHaveTextContent('Week 1');
    expect(screen.queryByRole('link', { name: 'Scout a match' })).not.toBeInTheDocument();
  });

  it('says there is no competition yet, and offers an admin the way to set one up', () => {
    renderHome({ eventId: null, gate: 'no-event' }, 'admin');
    expect(
      screen.getByRole('heading', { level: 1, name: 'No competition yet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up a competition' })).toHaveAttribute(
      'href',
      '/admin/manage',
    );
  });

  it('offers a scouter nothing to do when there is no competition yet', () => {
    renderHome({ eventId: null, gate: 'no-event' });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('says so while the competition loads onto the device', () => {
    renderHome({ eventId: EVENT, gate: 'loading' });
    expect(
      screen.getByRole('heading', { name: 'Loading the competition onto this device' }),
    ).toBeInTheDocument();
  });

  it('shows a busy skeleton, and no wrong claim, while the shell is still resolving', () => {
    renderHome({ eventId: null, gate: 'resolving' });
    expect(screen.getByRole('status', { name: 'Checking the competition' })).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
