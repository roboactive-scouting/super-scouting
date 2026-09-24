import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/auth/session';
import { db, setMeta } from '@/data/db';
import type * as SyncModule from '@/data/sync';
import type { HydrationState } from '@/data/sync';
import { AppShell } from './AppShell';

const hydrate = vi.fn();
const syncNow = vi.fn();
vi.mock('@/data/sync', async (original) => ({
  ...(await original<typeof SyncModule>()),
  hydrate: (deps: unknown) => hydrate(deps),
  syncNow: (deps: unknown) => syncNow(deps),
}));

const user = {
  id: 'u-1',
  username: 'seed_scouter',
  full_name: 'Seed Scouter',
  role: 'scouter' as const,
  must_change_password: false,
};
vi.mock('@/data/api', () => ({ apiClient: () => ({ push: vi.fn(), pull: vi.fn() }) }));
vi.mock('@/config', () => ({
  clientConfig: () => ({
    apiBaseUrl: 'https://api.test',
    deviceWipeCode: 'wipe-me',
    appVersion: 'test',
  }),
}));

/** A first pull the test itself decides when to finish, so 'loading' can be observed. */
function deferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

const CHILD = 'the robot list';

const ENTRY_CHILD = 'the entry form';

function renderShell(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>the login page</p>} />
        <Route path="/change-password" element={<p>the change password page</p>} />
        <Route path="/" element={<AppShell eventId="ev-1" />}>
          <Route index element={<p>{CHILD}</p>} />
          <Route path="entries" element={<p>the entries list</p>} />
          <Route path="entry/:matchId/:teamId" element={<p>{ENTRY_CHILD}</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  hydrate.mockReset();
  syncNow.mockReset();
  await db.delete();
  await db.open();
  await session.signIn(user, 'token-abc');
});

describe('AppShell first load (SPEC-FINAL 9.3)', () => {
  it('holds child routes back while the first pull is still running', async () => {
    const first = deferred<HydrationState>();
    hydrate.mockReturnValue(first.promise);
    renderShell();

    expect(await screen.findByText(/loading the competition/i)).toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();

    first.settle('fresh');

    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    expect(screen.queryByText(/loading the competition/i)).not.toBeInTheDocument();
  });

  it('renders children under the cached-data notice when the first pull could not reach the server', async () => {
    hydrate.mockResolvedValue('cached');
    renderShell();

    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    expect(screen.getByText(/data already on this device/i)).toBeInTheDocument();
  });

  it('renders neither the shell nor children when this device has never loaded the event', async () => {
    hydrate.mockResolvedValue('blocked');
    renderShell();

    expect(await screen.findByText(/has not loaded the competition yet/i)).toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });
});

describe('AppShell and the session (SPEC-FINAL 7.5, task 1.15)', () => {
  it('redirects to /login with no session, and never pulls without a token', async () => {
    await session.signOut();
    renderShell('/');
    expect(await screen.findByText('the login page')).toBeInTheDocument();
    expect(hydrate).not.toHaveBeenCalled();
    expect(syncNow).not.toHaveBeenCalled();
  });

  it.each(['/', '/entries'])(
    'redirects %s to /login when the session has expired',
    async (path) => {
      await setMeta('sync.hydrated_event_id', 'ev-1');
      await session.expire();
      renderShell(path);
      expect(await screen.findByText('the login page')).toBeInTheDocument();
      expect(hydrate).not.toHaveBeenCalled();
    },
  );

  it('keeps the entry route working when the session expires, with one non-modal line', async () => {
    await setMeta('sync.hydrated_event_id', 'ev-1');
    await session.expire();
    renderShell('/entry/m-1/t-1');
    expect(await screen.findByText(ENTRY_CHILD)).toBeInTheDocument();
    expect(
      screen.getByText('Sign in again to sync — this entry is saved on this device'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('the login page')).not.toBeInTheDocument();
    expect(hydrate).not.toHaveBeenCalled();
  });

  it('keeps an entry in progress mounted when the session expires mid-entry', async () => {
    hydrate.mockResolvedValue('fresh');
    renderShell('/entry/m-1/t-1');
    const form = await screen.findByText(ENTRY_CHILD);
    await session.expire();
    expect(
      await screen.findByText('Sign in again to sync — this entry is saved on this device'),
    ).toBeInTheDocument();
    // The same node: nothing remounted, so a part-filled form keeps its state.
    expect(screen.getByText(ENTRY_CHILD)).toBe(form);
  });

  it('sends a signed-in user with must_change_password to the change-password screen', async () => {
    await session.signIn({ ...user, must_change_password: true }, 'token-abc');
    hydrate.mockResolvedValue('fresh');
    renderShell('/');
    expect(await screen.findByText('the change password page')).toBeInTheDocument();
  });

  it('names who is signed in and signs out without touching the outbox', async () => {
    hydrate.mockResolvedValue('fresh');
    await db.outbox.put({
      op_id: 'o-1',
      entity: 'scouting_entry',
      row_id: 'r-1',
      action: 'create',
      base_version: null,
      payload: {},
      author_user_id: 'u-1',
      client_created_at: 'x',
      client_updated_at: 'x',
      seq: 1,
    });
    renderShell('/');
    expect(await screen.findByText('Seed Scouter')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Sign out' }).click();
    expect(await screen.findByText('the login page')).toBeInTheDocument();
    await waitFor(async () => expect(await session.current()).toBeNull());
    expect(await db.outbox.count()).toBe(1);
  });
});
