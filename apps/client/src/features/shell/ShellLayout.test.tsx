import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_ENTER } from '@/lib/motion';
import type { Account } from './account';
import type { NavAudience } from './nav';
import { ShellLayout } from './ShellLayout';

const who: NavAudience = { user: { id: 'u-1', role: 'scouter' }, expired: false, override: false };
const account: Account = {
  name: 'Yael Shapira',
  role: 'scouter',
  canSwitch: true,
  canChangePassword: true,
  onSignOut: () => undefined,
};

function Harness() {
  const [desktop, setDesktop] = useState(false);
  const { pathname } = useLocation();
  return (
    <ShellLayout
      desktop={desktop}
      hideBottomBar={pathname.startsWith('/entry/')}
      who={who}
      account={account}
      version="1.4.0"
      notices={null}
      footer={null}
    >
      <p>the page</p>
      <button type="button" onClick={() => setDesktop((d) => !d)}>
        Resize
      </button>
    </ShellLayout>
  );
}

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '*', element: <Harness /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const animate = vi.fn();
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  animate.mockReset();
  Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
});
afterEach(() => {
  // @ts-expect-error jsdom has no animate; the stub is removed again
  delete HTMLElement.prototype.animate;
});

describe('the phone shell (redesign R.7)', () => {
  it('shows the menu button, a bottom bar with Home, Scout and Entries, and no sidebar', () => {
    renderAt('/entries');
    expect(screen.getByRole('button', { name: 'Open the menu' })).toBeInTheDocument();
    const quick = screen.getByRole('navigation', { name: 'Main' });
    for (const name of ['Home', 'Scout', 'Entries']) {
      expect(within(quick).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(within(quick).getByRole('link', { name: 'Entries' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).not.toBeInTheDocument();
  });

  it('tells sticky page actions how tall the bottom bar is, so they sit above it', () => {
    renderAt('/scout');
    const column = screen.getByText('the page').parentElement!.parentElement as HTMLElement;
    expect(column.style.getPropertyValue('--bottom-bar')).not.toBe('');
  });

  it('hides the bottom bar on the entry route', () => {
    renderAt('/entry/m-1/t-1');
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('opens the drawer with every destination and the account, and closes it on a choice', async () => {
    const router = renderAt('/');
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Open the menu' }));
    const drawer = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(drawer).getByText('Yael Shapira')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    await u.click(within(drawer).getByRole('link', { name: 'Entries' }));
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entries');
  });

  it('closes the drawer on Escape and returns focus to the menu button', async () => {
    renderAt('/');
    const u = userEvent.setup();
    const menu = screen.getByRole('button', { name: 'Open the menu' });
    await u.click(menu);
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(menu).toHaveFocus();
  });

  it('fades a new page in, but never into the data-entry path (SPEC-FINAL 17.9)', async () => {
    const router = renderAt('/');
    expect(animate).not.toHaveBeenCalled();
    await act(() => router.navigate('/entries'));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]![0]).toEqual(PAGE_ENTER);
    await act(() => router.navigate('/scout'));
    await act(() => router.navigate('/entry/m-1/t-1'));
    expect(animate).toHaveBeenCalledTimes(1);
    await act(() => router.navigate('/'));
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it('does not reopen the drawer after the width crosses the breakpoint and back', async () => {
    renderAt('/entries');
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Open the menu' }));
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Resize' }));
    await u.click(screen.getByRole('button', { name: 'Resize' }));
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('keeps the page mounted when the width crosses the desktop breakpoint', async () => {
    renderAt('/entries');
    const page = screen.getByText('the page');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Resize' }));
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument();
    expect(screen.getByText('the page')).toBe(page);
  });
});
