import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@frc/shared';
import type { NavAudience } from './nav';
import { ShellLayout } from './ShellLayout';

function renderShell(path = '/entries', role: Role = 'admin', over: Partial<NavAudience> = {}) {
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
