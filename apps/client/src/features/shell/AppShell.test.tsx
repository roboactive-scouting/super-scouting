import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@frc/shared';
import { OFFLINE_SIGNED_IN_LINE, SERVER_UNREACHABLE_LINE } from '@/auth/messages';
import { pendingCredential } from '@/auth/pendingCredential';
import { PASSWORD_CHANGED_LINE, RECONNECT_TITLE } from '@/auth/ReconnectPrompt';
import { reconnectPrompt } from '@/auth/reconnect';
import { session } from '@/auth/session';
import { db, setMeta } from '@/data/db';
import type * as SyncModule from '@/data/sync';
import type { SyncDeps, SyncOutcome } from '@/data/sync';
import { AppShell } from './AppShell';
import { NO_HYDRATION, useActiveEventId } from './shellContext';

const syncNow = vi.fn<(deps: SyncDeps) => Promise<SyncOutcome>>();
vi.mock('@/data/sync', async (original) => ({
  ...(await original<typeof SyncModule>()),
  syncNow: (deps: SyncDeps) => syncNow(deps),
}));

const user = {
  id: 'u-1',
  username: 'seed_scouter',
  full_name: 'Seed Scouter',
  role: 'scouter' as Role,
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

/** getActiveContext answers uuids (the shared output schema checks them). */
const SEASON = '00000000-0000-4000-8000-000000000051';
const EVENT = '00000000-0000-4000-8000-0000000000e1';
const OTHER_EVENT = '00000000-0000-4000-8000-0000000000e2';

const LOADING = /loading the competition onto this device/i;
const INTERNET_REQUIRED = /internet connection is required/i;
const NO_COMPETITION = 'No competition is set up yet';

/** A pull the test itself decides when to finish, so an in-between state can be observed. */
function deferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

const OK: SyncOutcome = { status: 'ok', pushed: 0, pulled: 0 };
const OFFLINE: SyncOutcome = { status: 'offline', reason: 'could not reach the server' };

const CHILD = 'the robot list';
const ENTRY_CHILD = 'the entry form';
const USERS_CHILD = 'the user administration page';

/** The Scout stand-in: reads the event id the shell resolved, like the real routes do. */
function ScoutProbe() {
  const eventId = useActiveEventId();
  return (
    <div>
      <p>{CHILD}</p>
      <p>working on {eventId}</p>
      <label>
        Match number
        <input />
      </label>
    </div>
  );
}

function renderShell(path = '/') {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <p>the login page</p> },
      { path: '/change-password', element: <p>the change password page</p> },
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <ScoutProbe /> },
          { path: 'entries', element: <p>the entries list</p> },
          { path: 'entry/:matchId/:teamId', element: <p>{ENTRY_CHILD}</p> },
          { path: 'admin/users', element: <p>{USERS_CHILD}</p>, handle: NO_HYDRATION },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

/** A device that completed a pull of `eventId`: the watermark and the cached singleton. */
async function hydratedFor(eventId: string) {
  await db.rows.put({
    entity: 'app_settings',
    id: 'true',
    active_season_id: SEASON,
    active_event_id: eventId,
  });
  await setMeta('sync.hydrated_event_id', eventId);
}

/** Records whether `pattern` was EVER on screen, not only whether it is there now. */
function watchFor(pattern: RegExp) {
  const seen = { ever: false };
  const check = () => {
    if (pattern.test(document.body.textContent ?? '')) seen.ever = true;
  };
  const observer = new MutationObserver(check);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  check();
  return { seen, stop: () => observer.disconnect() };
}

// The server, as far as the shell is concerned: getActiveContext through the real rpc.
const fetchMock = vi.fn<typeof fetch>();
let server: { activeEventId: string | null; reachable: boolean };
let online = true;
const activeContextCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/getActiveContext')).length;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(async () => {
  syncNow.mockReset();
  syncNow.mockResolvedValue(OK);
  server = { activeEventId: EVENT, reachable: true };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url) => {
    if (!server.reachable) throw new TypeError('Failed to fetch');
    if (String(url).endsWith('/api/getActiveContext')) {
      return json({
        active_season_id: server.activeEventId ? SEASON : null,
        active_event_id: server.activeEventId,
      });
    }
    throw new TypeError('Failed to fetch');
  });
  vi.stubGlobal('fetch', fetchMock);
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  await db.delete();
  await db.open();
  await session.signIn(user, 'token-abc');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AppShell first load of an event (SPEC-FINAL 9.3)', () => {
  it('asks the server which event, holds child routes back while its first pull runs, then renders', async () => {
    const first = deferred<SyncOutcome>();
    syncNow.mockReturnValueOnce(first.promise);
    renderShell();

    expect(await screen.findByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    expect(activeContextCalls()).toBe(1);
    await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1));
    expect(syncNow.mock.calls[0]?.[0]).toMatchObject({ eventId: EVENT });

    first.settle(OK);

    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    expect(screen.getByText(`working on ${EVENT}`)).toBeInTheDocument();
    expect(screen.queryByText(LOADING)).not.toBeInTheDocument();
  });

  it('keeps the header and footer on screen while the gate shows', async () => {
    syncNow.mockReturnValueOnce(new Promise(() => {}));
    renderShell();
    await screen.findByText(LOADING);
    expect(screen.getByRole('link', { name: 'Scout' })).toBeInTheDocument();
    expect(screen.getByText('Seed Scouter')).toBeInTheDocument();
  });

  it('shows "not loaded yet" when the first pull fails online — with the server line, never "internet required"', async () => {
    syncNow.mockResolvedValueOnce(OFFLINE);
    renderShell();
    expect(await screen.findByText(/has not loaded the competition yet/i)).toBeInTheDocument();
    expect(screen.getByText(SERVER_UNREACHABLE_LINE)).toBeInTheDocument();
    expect(screen.queryByText(INTERNET_REQUIRED)).not.toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });
});

describe('AppShell cached-first start (task 1.17b)', () => {
  it('renders Scout at once on a hydrated device, with the sync hanging forever', async () => {
    await hydratedFor(EVENT);
    syncNow.mockReturnValue(new Promise(() => {})); // never settles
    const loading = watchFor(LOADING);
    renderShell();

    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    expect(screen.getByText(`working on ${EVENT}`)).toBeInTheDocument();
    expect(screen.getByText(/data already on this device/i)).toBeInTheDocument();
    // The sync really is in flight — the shell just did not wait for it.
    await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1));
    expect(syncNow.mock.calls[0]?.[0]).toMatchObject({ eventId: EVENT });
    // The cache named the event: the server was not asked.
    expect(activeContextCalls()).toBe(0);
    loading.stop();
    expect(loading.seen.ever).toBe(false);
  });

  it('moves from cached to fresh when the background sync lands, keeping a part-filled form', async () => {
    await hydratedFor(EVENT);
    const background = deferred<SyncOutcome>();
    syncNow.mockReturnValueOnce(background.promise);
    renderShell();

    const field = await screen.findByLabelText('Match number');
    expect(screen.getByText(/data already on this device/i)).toBeInTheDocument();
    await userEvent.setup().type(field, '42');

    await act(async () => background.settle(OK));

    await waitFor(() =>
      expect(screen.queryByText(/data already on this device/i)).not.toBeInTheDocument(),
    );
    // The same node, still holding what was typed: nothing remounted.
    expect(screen.getByLabelText('Match number')).toBe(field);
    expect(field).toHaveValue('42');
  });

  it('never shows the loading screen when the shell remounts after /change-password', async () => {
    await hydratedFor(EVENT);
    const loading = watchFor(LOADING);
    const router = renderShell();
    expect(await screen.findByText(CHILD)).toBeInTheDocument();

    await act(() => router.navigate('/change-password'));
    expect(await screen.findByText('the change password page')).toBeInTheDocument();
    await act(() => router.navigate('/'));

    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(2));
    loading.stop();
    expect(loading.seen.ever).toBe(false);
  });

  it('opens straight to Scout offline: hydrated, navigator offline, every network call rejecting', async () => {
    online = false;
    server.reachable = false;
    await hydratedFor(EVENT);
    // The real syncNow against an API whose every call rejects, as it does with no network.
    const actual = await vi.importActual<typeof SyncModule>('@/data/sync');
    const dead = {
      push: vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
      pull: vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    };
    syncNow.mockImplementation((deps) => actual.syncNow({ ...deps, api: dead }));
    await db.outbox.put({
      op_id: 'o-1',
      entity: 'scouting_entry',
      row_id: 'r-1',
      action: 'create',
      base_version: null,
      payload: { event_id: EVENT },
      author_user_id: 'u-1',
      client_created_at: 'x',
      client_updated_at: 'x',
      seq: 1,
    });
    const loading = watchFor(LOADING);
    const blocked = watchFor(/has not loaded the competition/i);
    renderShell();

    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    expect(screen.getByText(`working on ${EVENT}`)).toBeInTheDocument();
    expect(screen.getByText(/data already on this device/i)).toBeInTheDocument();
    await waitFor(() => expect(dead.push).toHaveBeenCalled());
    // The failed sync changes nothing on screen, and nothing on the device.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText(CHILD)).toBeInTheDocument();
    expect(screen.getByText(/data already on this device/i)).toBeInTheDocument();
    expect(await db.outbox.count()).toBe(1);
    expect(activeContextCalls()).toBe(0);
    loading.stop();
    blocked.stop();
    expect(loading.seen.ever).toBe(false);
    expect(blocked.seen.ever).toBe(false);
  });

  it('opens an entry in progress offline with an expired session, and never contacts the server', async () => {
    online = false;
    server.reachable = false;
    await hydratedFor(EVENT);
    await session.expire();
    const loading = watchFor(LOADING);
    renderShell('/entry/m-1/t-1');

    expect(await screen.findByText(ENTRY_CHILD)).toBeInTheDocument();
    expect(
      screen.getByText('Sign in again to sync — this entry is saved on this device'),
    ).toBeInTheDocument();
    expect(syncNow).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    loading.stop();
    expect(loading.seen.ever).toBe(false);
  });

  it('asks the server again when the cached event is gone, instead of saying offline', async () => {
    await hydratedFor(OTHER_EVENT);
    server.activeEventId = EVENT;
    syncNow.mockImplementation(async (deps) =>
      deps.eventId === OTHER_EVENT ? { status: 'event-gone' } : OK,
    );
    renderShell();

    expect(await screen.findByText(`working on ${EVENT}`)).toBeInTheDocument();
    expect(activeContextCalls()).toBe(1);
    expect(syncNow.mock.calls.map(([d]) => d.eventId)).toEqual([OTHER_EVENT, EVENT]);
    expect(screen.queryByText(/has not loaded the competition/i)).not.toBeInTheDocument();
  });

  it('says no competition is set up when the cached event is gone and the server names none', async () => {
    await hydratedFor(OTHER_EVENT);
    server.activeEventId = null;
    syncNow.mockResolvedValue({ status: 'event-gone' });
    renderShell();

    expect(await screen.findByRole('heading', { name: NO_COMPETITION })).toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });
});

describe('AppShell with no active event (task 1.17b)', () => {
  beforeEach(() => {
    server.activeEventId = null;
  });

  it('says no competition is set up — online, never "internet connection is required"', async () => {
    renderShell();
    expect(await screen.findByRole('heading', { name: NO_COMPETITION })).toBeInTheDocument();
    expect(screen.getByText(/an admin sets up the season and competition/i)).toBeInTheDocument();
    expect(screen.queryByText(INTERNET_REQUIRED)).not.toBeInTheDocument();
    expect(screen.queryByText(/has not loaded the competition/i)).not.toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
    // Nothing to pull: the pull needs an event id.
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('renders the Users page for an admin, while Scout and Entries stay gated', async () => {
    await session.signIn({ ...user, role: 'admin' }, 'token-admin');
    const router = renderShell('/admin/users');
    expect(await screen.findByText(USERS_CHILD)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
    expect(screen.queryByText(NO_COMPETITION)).not.toBeInTheDocument();

    await act(() => router.navigate('/'));
    expect(await screen.findByRole('heading', { name: NO_COMPETITION })).toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();

    await act(() => router.navigate('/entries'));
    expect(await screen.findByRole('heading', { name: NO_COMPETITION })).toBeInTheDocument();
    expect(screen.queryByText('the entries list')).not.toBeInTheDocument();

    // The header link still gets the admin back to the page that works.
    await userEvent.setup().click(screen.getByRole('link', { name: 'Users' }));
    expect(await screen.findByText(USERS_CHILD)).toBeInTheDocument();
  });

  it('picks the event up as soon as an admin sets one, on the next connection event', async () => {
    renderShell();
    await screen.findByRole('heading', { name: NO_COMPETITION });

    server.activeEventId = EVENT;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(await screen.findByText(`working on ${EVENT}`)).toBeInTheDocument();
    expect(screen.queryByText(NO_COMPETITION)).not.toBeInTheDocument();
  });

  it('re-asks on the 45 s auto-refresh tick as well', async () => {
    // Only the interval is faked: IndexedDB and the rpc still run on real timers.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      renderShell();
      await screen.findByRole('heading', { name: NO_COMPETITION });
      server.activeEventId = EVENT;
      expect(activeContextCalls()).toBe(1);
      await act(async () => {
        vi.advanceTimersByTime(44_999);
      });
      expect(activeContextCalls()).toBe(1);
      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(await screen.findByText(`working on ${EVENT}`)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AppShell on a device that has never loaded the event (task 1.17b)', () => {
  it('online but the server is unreachable: "cannot reach the server", never "internet connection is required"', async () => {
    server.reachable = false;
    renderShell();
    expect(await screen.findByText(/has not loaded the competition yet/i)).toBeInTheDocument();
    expect(screen.getByText(SERVER_UNREACHABLE_LINE)).toBeInTheDocument();
    expect(screen.queryByText(INTERNET_REQUIRED)).not.toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });

  it('offline: keeps "an internet connection is required once", and does not try the server', async () => {
    online = false;
    renderShell();
    expect(await screen.findByText(INTERNET_REQUIRED)).toBeInTheDocument();
    expect(screen.queryByText(SERVER_UNREACHABLE_LINE)).not.toBeInTheDocument();
    expect(activeContextCalls()).toBe(0);
  });

  it('renders an ungated route in every state, and never remounts it', async () => {
    await session.signIn({ ...user, role: 'admin' }, 'token-admin');
    const first = deferred<SyncOutcome>();
    syncNow.mockReturnValueOnce(first.promise);
    const router = renderShell('/admin/users');
    const page = await screen.findByText(USERS_CHILD);
    await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1)); // 'loading'
    expect(screen.getByText(USERS_CHILD)).toBe(page);
    await act(async () => first.settle(OFFLINE)); // 'blocked'
    await act(() => router.navigate('/'));
    expect(await screen.findByText(/has not loaded the competition yet/i)).toBeInTheDocument();
    await act(() => router.navigate('/admin/users'));
    expect(await screen.findByText(USERS_CHILD)).toBeInTheDocument();
  });
});

describe('AppShell and the session (SPEC-FINAL 7.5, task 1.15)', () => {
  it('redirects to /login with no session, and never pulls without a token', async () => {
    await session.signOut();
    renderShell('/');
    expect(await screen.findByText('the login page')).toBeInTheDocument();
    expect(syncNow).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['/', '/entries'])(
    'redirects %s to /login when the session has expired',
    async (path) => {
      await hydratedFor(EVENT);
      await session.expire();
      renderShell(path);
      expect(await screen.findByText('the login page')).toBeInTheDocument();
      expect(syncNow).not.toHaveBeenCalled();
    },
  );

  it('keeps the entry route working when the session expires, with one non-modal line', async () => {
    await hydratedFor(EVENT);
    await session.expire();
    renderShell('/entry/m-1/t-1');
    expect(await screen.findByText(ENTRY_CHILD)).toBeInTheDocument();
    expect(
      screen.getByText('Sign in again to sync — this entry is saved on this device'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('the login page')).not.toBeInTheDocument();
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('sends an expired session on the entry route to sign-in when the event never loaded', async () => {
    await session.expire();
    renderShell('/entry/m-1/t-1');
    expect(await screen.findByText('the login page')).toBeInTheDocument();
  });

  it('keeps an entry in progress mounted when the session expires mid-entry', async () => {
    await hydratedFor(EVENT);
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
    renderShell('/');
    expect(await screen.findByText('the change password page')).toBeInTheDocument();
  });

  it('names who is signed in and signs out without touching the outbox', async () => {
    await hydratedFor(EVENT);
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

describe('AppShell and an offline sign-in (SPEC-FINAL 7.5, task 1.16)', () => {
  const loginOk = () => json({ token: 'tok-minted', user: loginUser });
  const loginUser = { ...user, id: '00000000-0000-4000-8000-000000000001' };

  beforeEach(async () => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    pendingCredential.clear();
    reconnectPrompt.reset();
    await hydratedFor(EVENT);
    await session.signIn(loginUser, null, true);
  });

  it('says it is signed in from the cached accounts, and offers no password change', async () => {
    online = false;
    renderShell('/');
    expect(await screen.findByText(OFFLINE_SIGNED_IN_LINE)).toBeInTheDocument();
    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Change password' })).not.toBeInTheDocument();
    expect(syncNow).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers switch scouter from the header as one 48 px action', async () => {
    online = false;
    renderShell('/');
    const link = await screen.findByRole('link', { name: 'Switch scouter' });
    expect(link).toHaveAttribute('href', '/switch-scouter');
    expect(link).toHaveClass('tap-target');
  });

  it('exchanges the held password for a token when the connection returns, then syncs at once', async () => {
    online = false;
    pendingCredential.set({ username: 'seed_scouter', password: 'seedpass1' });
    renderShell('/');
    await screen.findByText(OFFLINE_SIGNED_IN_LINE);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(loginOk());
    online = true;
    window.dispatchEvent(new Event('online'));

    await waitFor(async () => expect(await session.token()).toBe('tok-minted'));
    expect(pendingCredential.get()).toBeNull();
    // Not on the 45 s tick: straight away. (The `online` run and the token's own run can
    // both land after the exchange, so this is at least once, not exactly once.)
    await waitFor(() => expect(syncNow).toHaveBeenCalled());
    expect(syncNow.mock.calls.every(([d]) => d.eventId === EVENT)).toBe(true);
    await waitFor(() => expect(screen.queryByText(OFFLINE_SIGNED_IN_LINE)).not.toBeInTheDocument());
  });

  it('asks once for the password when none is held (the app was closed), without a dialog', async () => {
    renderShell('/');
    const prompt = await screen.findByRole('region', { name: RECONNECT_TITLE });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(prompt).toHaveTextContent(/safe on this device/i);
    // It never takes focus from whatever the scout is doing.
    expect(within(prompt).getByLabelText('Password')).not.toHaveFocus();
    expect(screen.getByText(CHILD)).toBeInTheDocument();

    await userEvent.setup().click(within(prompt).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('region', { name: RECONNECT_TITLE })).not.toBeInTheDocument();

    window.dispatchEvent(new Event('online'));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('region', { name: RECONNECT_TITLE })).not.toBeInTheDocument();
  });

  it('signs in from the prompt and syncs', async () => {
    renderShell('/');
    const prompt = await screen.findByRole('region', { name: RECONNECT_TITLE });
    fetchMock.mockResolvedValueOnce(loginOk());
    const u = userEvent.setup();
    await u.type(within(prompt).getByLabelText('Password'), 'seedpass1');
    await u.click(within(prompt).getByRole('button', { name: 'Sign in' }));
    await waitFor(async () => expect(await session.token()).toBe('tok-minted'));
    await waitFor(() => expect(syncNow).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: RECONNECT_TITLE })).not.toBeInTheDocument();
  });

  it('asks again, saying why, when the held password was changed since', async () => {
    pendingCredential.set({ username: 'seed_scouter', password: 'old-pass' });
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: 'unauthenticated', message: 'no' } }, 401),
    );
    renderShell('/');
    const prompt = await screen.findByRole('region', { name: RECONNECT_TITLE });
    expect(within(prompt).getByRole('alert')).toHaveTextContent(PASSWORD_CHANGED_LINE);
    expect(pendingCredential.get()).toBeNull();
    expect(await session.token()).toBeNull();
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('syncs as soon as a token arrives in place, not on the next tick', async () => {
    online = false;
    renderShell('/');
    await screen.findByText(OFFLINE_SIGNED_IN_LINE);
    expect(syncNow).not.toHaveBeenCalled();
    await session.signIn(loginUser, 'tok-other-path');
    await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1));
  });
});
