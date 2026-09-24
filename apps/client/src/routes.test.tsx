import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/auth/session';
import { db, setMeta } from '@/data/db';
import type * as SyncModule from '@/data/sync';
import { pending } from '@/data/outbox';
import { routeTree } from './routes';

const hydrate = vi.fn();
vi.mock('@/data/sync', async (original) => ({
  ...(await original<typeof SyncModule>()),
  hydrate: (deps: unknown) => hydrate(deps),
  syncNow: vi.fn(),
}));
vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

const user = {
  id: 'u-signed-in',
  username: 'dana',
  full_name: 'Dana',
  role: 'scouter' as const,
  must_change_password: false,
};

function renderAt(path: string) {
  const router = createMemoryRouter(routeTree('ev-1'), { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(async () => {
  hydrate.mockReset();
  hydrate.mockResolvedValue('fresh');
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    { entity: 'teams', id: 't-1', number: 118, name: 'Robonauts' },
    { entity: 'event_teams', id: 'et-1', event_id: 'ev-1', team_id: 't-1', deleted_at: null },
  ]);
  await setMeta('sync.hydrated_event_id', 'ev-1');
});

describe('the route tree and the session (task 1.15)', () => {
  it('attributes a locally authored operation to the signed-in user', async () => {
    await session.signIn(user, 'token-abc');
    renderAt('/');
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText(/match number/i), '42');
    await u.click(screen.getByRole('radio', { name: 'red' }));
    await u.selectOptions(
      screen.getByRole('combobox', { name: /robot/i }),
      await screen.findByRole('option', { name: /118/ }),
    );
    await u.click(screen.getByRole('button', { name: /start entry/i }));
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
    expect((await pending(10))[0]!.author_user_id).toBe('u-signed-in');
  });

  it.each(['/', '/entries', '/change-password'])(
    'an expired session sends %s to the login screen',
    async (path) => {
      await session.signIn(user, 'token-abc');
      await session.expire();
      const router = renderAt(path);
      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/login');
      await waitFor(() => expect(screen.getByLabelText('Username')).toHaveValue('dana'));
    },
  );

  it('an expired session does NOT leave the entry route', async () => {
    await session.signIn(user, 'token-abc');
    await session.expire();
    const router = renderAt('/entry/m-1/t-1?alliance=red');
    expect(
      await screen.findByText('Sign in again to sync — this entry is saved on this device'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entry/m-1/t-1');
  });

  it('no session sends every route to the login screen', async () => {
    for (const path of ['/', '/entries', '/entry/m-1/t-1', '/change-password']) {
      const router = renderAt(path);
      await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    }
  });
});
