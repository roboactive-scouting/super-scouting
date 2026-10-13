import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@frc/shared';
import { db } from '@/data/db';
import type { NavAudience } from './nav';
import { ShellLayout } from './ShellLayout';

function renderShell(
  path = '/entries',
  role: Role = 'admin',
  over: Partial<NavAudience> = {},
  eventId: string | null = null,
) {
  const who: NavAudience = { user: { id: 'u-1', role }, expired: false, override: false, ...over };
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <ShellLayout
            desktop
            hideBottomBar={false}
            who={who}
            eventId={eventId}
            account={{
              name: 'Tamar Mor',
              role,
              canSwitch: true,
              canChangePassword: true,
              onSignOut: () => undefined,
            }}
            version="1.4.0"
            notices={null}
            footer={null}
          >
            <p>the page</p>
          </ShellLayout>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => localStorage.clear());

describe('the sidebar (redesign R.6)', () => {
  it('lists Sync under This device with the waiting count, current on /sync and its log (task 1.43)', async () => {
    await db.delete();
    await db.open();
    await db.outbox.bulkPut(
      ['a', 'b'].map((id, i) => ({
        op_id: `op-${id}`,
        entity: 'scouting_entry' as const,
        row_id: id,
        action: 'create' as const,
        base_version: null,
        payload: {},
        author_user_id: 'u-1',
        client_created_at: '2026-10-12T09:00:00.000Z',
        client_updated_at: '2026-10-12T09:00:00.000Z',
        seq: i + 1,
      })),
    );
    renderShell('/sync/discarded');
    const device = screen.getByRole('list', { name: 'This device' });
    const sync = await screen.findByRole('link', { name: 'Sync, 2 waiting to send' });
    expect(device).toContainElement(sync);
    expect(sync).toHaveAttribute('href', '/sync');
    expect(sync).toHaveAttribute('aria-current', 'page');
    expect(
      screen
        .getAllByRole('link')
        .filter((l) => device.contains(l))
        .map((l) => l.textContent),
    ).toEqual(['Sync2', 'Conflicts', 'Settings']);
  });

  it('lists Conflicts under This device with the current event’s open count, for a lead (task 1.44)', async () => {
    await db.delete();
    await db.open();
    await db.rows.bulkPut([
      { entity: 'sync_conflicts', id: 'c-1', event_id: 'ev-1', resolved_at: null },
      { entity: 'sync_conflicts', id: 'c-2', event_id: 'ev-1', resolved_at: null },
      {
        entity: 'sync_conflicts',
        id: 'c-3',
        event_id: 'ev-1',
        resolved_at: '2026-10-12T09:00:00Z',
      },
      { entity: 'sync_conflicts', id: 'c-4', event_id: 'ev-0', resolved_at: null },
    ]);
    renderShell('/conflicts', 'lead', {}, 'ev-1');
    const conflicts = await screen.findByRole('link', { name: 'Conflicts, 2 to review' });
    expect(screen.getByRole('list', { name: 'This device' })).toContainElement(conflicts);
    expect(conflicts).toHaveAttribute('href', '/conflicts');
    expect(conflicts).toHaveAttribute('aria-current', 'page');
    expect(conflicts).toHaveTextContent(/^Conflicts2$/);
  });

  it('shows no count beside Conflicts at zero (task 1.44)', async () => {
    await db.delete();
    await db.open();
    renderShell('/entries', 'admin', {}, 'ev-1');
    const conflicts = await screen.findByRole('link', { name: 'Conflicts' });
    expect(conflicts).toHaveTextContent(/^Conflicts$/);
  });

  it('never lists Conflicts for a scouter, even with conflicts open (task 1.44)', async () => {
    await db.delete();
    await db.open();
    await db.rows.put({ entity: 'sync_conflicts', id: 'c-1', event_id: 'ev-1', resolved_at: null });
    renderShell('/entries', 'scouter', {}, 'ev-1');
    await screen.findByRole('link', { name: 'Sync' });
    expect(screen.queryByRole('link', { name: /Conflicts/ })).not.toBeInTheDocument();
  });

  it('lists every destination once, grouped, with the current one marked', () => {
    renderShell('/entries');
    expect(screen.getByRole('list', { name: 'Competition' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Admin' })).toBeInTheDocument();
    for (const name of ['Home', 'Scout', 'Entries', 'Users', 'Manage']) {
      expect(screen.getAllByRole('link', { name })).toHaveLength(1);
    }
    expect(screen.getByRole('link', { name: 'Entries' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('marks Home current on / alone', () => {
    renderShell('/');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows Scout as a disabled item, not a link, under a session override', () => {
    renderShell('/entries', 'scouter', { override: true });
    expect(screen.queryByRole('link', { name: 'Scout' })).not.toBeInTheDocument();
    expect(screen.getByText('Scout')).toHaveAttribute('aria-disabled', 'true');
  });

  it('collapses to a rail, keeps every name, and remembers it on this device', async () => {
    renderShell();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Collapse the sidebar' }));
    expect(screen.getByRole('button', { name: 'Expand the sidebar' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('link', { name: 'Entries' })).toBeInTheDocument();
    // The account corner keeps the name for assistive technology, the initials for the eye.
    expect(screen.getByRole('button', { name: /Tamar Mor/ })).toBeInTheDocument();
    expect(localStorage.getItem('shell.sidebar.collapsed')).toBe('true');
  });

  it('starts collapsed when this device last left it collapsed', () => {
    localStorage.setItem('shell.sidebar.collapsed', 'true');
    renderShell();
    expect(screen.getByRole('button', { name: 'Expand the sidebar' })).toBeInTheDocument();
  });

  it('never remounts the page when the sidebar collapses', async () => {
    renderShell();
    const page = screen.getByText('the page');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Collapse the sidebar' }));
    expect(screen.getByText('the page')).toBe(page);
  });
});
