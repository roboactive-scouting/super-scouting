import bcrypt from 'bcryptjs';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('switch scouter on a shared device (SPEC-FINAL 7.3, task 1.16)', () => {
  const noa = {
    id: 'u-noa',
    username: 'noa',
    full_name: 'Noa',
    role: 'scouter' as const,
    must_change_password: false,
  };

  beforeEach(async () => {
    // No connection at all: the switch goes through the cached hash.
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')));
    await db.rows.bulkPut([
      {
        entity: 'users',
        ...user,
        password_hash: bcrypt.hashSync('dana-pass', 10),
        disabled_at: null,
      },
      {
        entity: 'users',
        ...noa,
        password_hash: bcrypt.hashSync('noa-pass', 10),
        disabled_at: null,
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function startEntry(u: ReturnType<typeof userEvent.setup>, matchNumber: string) {
    await u.type(await screen.findByLabelText(/match number/i), matchNumber);
    await u.click(screen.getByRole('radio', { name: 'red' }));
    await u.selectOptions(
      screen.getByRole('combobox', { name: /robot/i }),
      await screen.findByRole('option', { name: /118/ }),
    );
    await u.click(screen.getByRole('button', { name: /start entry/i }));
  }

  it('attributes what is entered after a switch to the new scouter, and never re-authors the old ops', async () => {
    await session.signIn(user, 'token-abc');
    const router = renderAt('/');
    const u = userEvent.setup();

    // Dana starts an entry (its bare match op is hers), then hands the device over.
    await startEntry(u, '42');
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
    const [danas] = await pending(10);
    expect(danas!.author_user_id).toBe('u-signed-in');

    await router.navigate('/');
    await u.click(await screen.findByRole('link', { name: 'Switch scouter' }));
    await u.selectOptions(
      await screen.findByRole('combobox', { name: 'Scouter' }),
      screen.getByRole('option', { name: /noa/ }),
    );
    await u.type(screen.getByLabelText(/^Password for/), 'noa-pass');
    await u.click(screen.getByRole('button', { name: 'Switch scouter' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByText('Noa')).toBeInTheDocument(); // "Signed in as Noa"

    await startEntry(u, '43');
    await waitFor(async () => expect(await pending(10)).toHaveLength(2));
    const [first, second] = await pending(10);
    expect(first).toEqual(danas); // untouched, still Dana's
    expect(second!.author_user_id).toBe('u-noa');
  });

  it('attributes an entry submitted after a switch to whoever submits it, even from a draft begun before', async () => {
    await db.rows.bulkPut([
      { entity: 'matches', id: 'm-1', event_id: 'ev-1', match_type: 'qualification', number: 21 },
      { entity: 'forms', id: 'f-1', kind: 'match', season_id: 'se-1', active_version_id: 'fv-1' },
      { entity: 'app_settings', id: 'singleton', active_season_id: 'se-1' },
    ]);
    // Dana began this entry on the shared device; drafts are keyed by form, match and
    // team, not by scouter, so the draft survives the hand-over.
    await db.drafts.put({
      key: 'fv-1:m-1:t-1',
      row_id: '',
      payload: { robot_status: 'broke_down', breakdown_seconds: 30, data: {} },
      updated_at: '2026-09-24T10:00:00.000Z',
    });
    await session.signIn(user, 'token-abc');
    const router = renderAt('/switch-scouter');
    const u = userEvent.setup();
    await u.selectOptions(
      await screen.findByRole('combobox', { name: 'Scouter' }),
      screen.getByRole('option', { name: /noa/ }),
    );
    await u.type(screen.getByLabelText(/^Password for/), 'noa-pass');
    await u.click(screen.getByRole('button', { name: 'Switch scouter' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));

    await router.navigate('/entry/m-1/t-1?alliance=red');
    // Dana's draft is what Noa picks up.
    await waitFor(() => expect(screen.getByRole('radio', { name: /broke down/i })).toBeChecked());
    await u.click(await screen.findByRole('radio', { name: /no show/i }));
    await u.click(screen.getByRole('button', { name: /review entry/i }));
    await u.click(await screen.findByRole('button', { name: /submit entry/i }));

    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
    const [op] = await pending(10);
    expect(op!.entity).toBe('scouting_entry');
    expect(op!.author_user_id).toBe('u-noa');
    expect(op!.payload.scouter_id).toBe('u-noa');
    expect(await db.drafts.get('fv-1:m-1:t-1')).toBeUndefined();
  });
});
