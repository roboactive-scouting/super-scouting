import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/auth/session';
import { db } from '@/data/db';
import type * as SyncModule from '@/data/sync';
import { routeTree } from '@/routes';

vi.mock('@/data/sync', async (original) => ({
  ...(await original<typeof SyncModule>()),
  syncNow: vi.fn(async () => ({ status: 'offline', reason: 'test' })),
}));
vi.mock('@/data/api', () => ({ apiClient: () => ({ push: vi.fn(), pull: vi.fn() }) }));
vi.mock('@/config', () => ({
  clientConfig: () => ({
    apiBaseUrl: 'https://api.test',
    deviceWipeCode: 'wipe-me',
    appVersion: 'test',
  }),
}));

const lead = {
  id: 'u-lead',
  username: 'noa.levi',
  full_name: 'Noa Levi',
  role: 'lead' as const,
  must_change_password: false,
};

/** jsdom has no matchMedia: answer the desktop query for the width under test. */
function setWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return {
      matches: min ? width >= Number(min[1]) : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
  }) as unknown as typeof window.matchMedia;
}

/** `n` entry operations waiting to send, all by the signed-in lead. */
async function seedOutbox(n: number) {
  for (let i = 0; i < n; i++) {
    await db.outbox.put({
      op_id: `op-${i}`,
      entity: 'scouting_entry',
      row_id: `r-${i}`,
      action: 'create',
      base_version: null,
      payload: {},
      author_user_id: lead.id,
      client_created_at: 'x',
      client_updated_at: 'x',
      seq: i + 1,
    });
  }
}

async function renderShell({ width, path }: { width: number; path?: string }) {
  setWidth(width);
  const router = createMemoryRouter(routeTree(), { initialEntries: [path ?? '/'] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }),
  );
  await db.delete();
  await db.open();
  await session.signIn(lead, 'token-abc');
});

afterEach(() => {
  // @ts-expect-error the stub is removed again, so other suites keep jsdom's desktop default
  delete window.matchMedia;
  vi.unstubAllGlobals();
});

describe('the shell (redesign RB.6)', () => {
  it('opens the account menu from the sidebar corner with the three account actions', async () => {
    await renderShell({ width: 1440 });
    await userEvent.click(await screen.findByRole('button', { name: /Noa Levi/ }));
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['Switch scouter', 'Change password', 'Sign out']);
  });

  it('closes the account menu on Escape and gives focus back to the corner', async () => {
    await renderShell({ width: 1440 });
    const corner = await screen.findByRole('button', { name: /Noa Levi/ });
    await userEvent.click(corner);
    expect(screen.getByRole('menuitem', { name: 'Switch scouter' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(corner).toHaveFocus();
  });

  it('closes the account menu on a click outside it', async () => {
    await renderShell({ width: 1440 });
    await userEvent.click(await screen.findByRole('button', { name: /Noa Levi/ }));
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows the waiting count in the top-bar pill; Entries left the bar for the drawer (task 1.58)', async () => {
    await seedOutbox(3); // three entry ops by the signed-in user
    await renderShell({ width: 375 });
    expect(await screen.findByText('3 waiting')).toBeInTheDocument();
    const bar = screen.getByRole('navigation', { name: 'Main' });
    expect(within(bar).queryByRole('link', { name: /Entries/ })).toBeNull();
    expect(within(bar).queryByText('3')).toBeNull();
  });

  it('says "All sent" with nothing waiting, and the bar ends at Ranking', async () => {
    await renderShell({ width: 375 });
    expect(await screen.findByText('All sent')).toBeInTheDocument();
    const bar = screen.getByRole('navigation', { name: 'Main' });
    expect(within(bar).getByRole('link', { name: 'Ranking' })).toHaveAttribute('href', '/ranking');
  });

  it('puts Scout after Home, then Search and Ranking (task 1.58), and titles the top bar', async () => {
    await renderShell({ width: 375 });
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    expect(
      within(bar)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Home', 'Scout', 'Search', 'Ranking']);
    expect(within(screen.getByRole('banner')).getByText('Home')).toBeInTheDocument();
  });

  it('hides the bottom bar on the entry route', async () => {
    await renderShell({ width: 375, path: '/entry/m/t' });
    await screen.findByRole('button', { name: 'Open the menu' });
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
  });

  it('keeps the bottom bar on Scout', async () => {
    await renderShell({ width: 375, path: '/scout' });
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});

/** The phone bar on `path`: its tabs in order, the raised one(s) and the current one(s). */
async function phoneBar(path: string) {
  await renderShell({ width: 375, path });
  const bar = await screen.findByRole('navigation', { name: 'Main' });
  const links = within(bar).getAllByRole('link');
  const names = (keep: (l: HTMLElement) => boolean) =>
    links.filter(keep).map((l) => l.getAttribute('aria-label') ?? l.textContent);
  return {
    order: names(() => true),
    raised: names((l) => l.querySelector('[data-raised]') !== null),
    current: names((l) => l.getAttribute('aria-current') === 'page'),
  };
}

describe('the phone bar: the current page is the raised button (UF.10)', () => {
  it.each([
    ['/', 'Home'],
    ['/scout', 'Scout'],
    // Task 1.51: Search is the raised button on team search.
    ['/teams', 'Search'],
    // Task 1.58: Ranking took Entries' place.
    ['/ranking', 'Ranking'],
  ])('on %s raises %s, and only it, and marks it current', async (path, name) => {
    const bar = await phoneBar(path);
    expect(bar.order).toEqual(['Home', 'Scout', 'Search', 'Ranking']);
    expect(bar.raised).toEqual([name]);
    expect(bar.current).toEqual([name]);
  });

  it('raises nothing on any other page, Scout a flat tab in the middle', async () => {
    const bar = await phoneBar('/switch-scouter');
    expect(bar.order).toEqual(['Home', 'Scout', 'Search', 'Ranking']);
    expect(bar.raised).toEqual([]);
    expect(bar.current).toEqual([]);
  });

  it('raises nothing on Entries, now in the drawer (task 1.58)', async () => {
    await seedOutbox(3);
    const bar = await phoneBar('/entries');
    expect(bar.order).toEqual(['Home', 'Scout', 'Search', 'Ranking']);
    expect(bar.raised).toEqual([]);
    expect(bar.current).toEqual([]);
  });
});
