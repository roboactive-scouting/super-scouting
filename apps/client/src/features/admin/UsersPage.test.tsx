import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate, type PublicUser, type Role } from '@frc/shared';
import { session } from '@/auth/session';
import { db, setMeta } from '@/data/db';
import type * as SyncModule from '@/data/sync';
import { routeTree } from '@/routes';
import { UsersPage } from './UsersPage';
import { MAX_LISTED_USERS } from './useUsers';

const hydrate = vi.fn();
vi.mock('@/data/sync', async (original) => ({
  ...(await original<typeof SyncModule>()),
  hydrate: (deps: unknown) => hydrate(deps),
  syncNow: vi.fn(),
}));
vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

const DISABLE_BODY =
  'Disabling keeps everything they scouted, with their name on it. It is not a delete.';

const admin = {
  id: 'u-admin',
  username: 'seed_admin',
  full_name: 'Seed Admin',
  role: 'admin' as Role,
  must_change_password: false,
};

function stored(over: Partial<PublicUser> & { id: string; username: string }): PublicUser {
  return {
    full_name: over.username,
    role: 'scouter',
    must_change_password: false,
    disabled_at: null,
    created_at: '2026-01-10T12:00:00.000Z',
    ...over,
  };
}

// ---------------------------------------------------------------------------------------
// A fake server with the real wire shapes: `{ error: { code, message } }` on failure.

type Call = { name: string; input: Record<string, unknown>; authorization: string | null };
type Handler = (input: Record<string, unknown>) => Response | Promise<Response>;

let users: PublicUser[];
let calls: Call[];
let overrides: Record<string, Handler>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fail = (status: number, code: string, message: string) =>
  json({ error: { code, message } }, status);

function serve(name: string, input: Record<string, unknown>): Response {
  const find = (id: unknown) => users.find((u) => u.id === id);
  switch (name) {
    // A fresh install: no season, no event (task 1.17b).
    case 'getActiveContext':
      return json({ active_season_id: null, active_event_id: null });
    case 'listUsers': {
      const all = users
        .filter((u) => input.include_disabled === true || u.disabled_at === null)
        .sort((a, b) => a.username.localeCompare(b.username));
      const limit = Math.min(Number(input.limit ?? 50), 200);
      const start = typeof input.cursor === 'string' ? Number(input.cursor) : 0;
      const items = all.slice(start, start + limit);
      const next = start + limit < all.length ? String(start + limit) : null;
      return json({ items, next_cursor: next });
    }
    case 'countEntriesByScouter':
      return json({ items: [] });
    case 'createUser': {
      if (users.some((u) => u.username === input.username)) {
        return fail(409, 'conflict', `the username '${String(input.username)}' is taken`);
      }
      const created = stored({
        id: `u-new-${users.length}`,
        username: String(input.username),
        full_name: String(input.full_name),
        role: input.role as Role,
        must_change_password: input.must_change === true,
        created_at: '2026-09-24T12:00:00.000Z',
      });
      users.push(created);
      return json(created);
    }
    case 'resetPassword': {
      const u = find(input.user_id);
      if (!u) return fail(404, 'not-found', 'no such user');
      u.must_change_password = input.must_change === true;
      return json(u);
    }
    case 'setUserRole': {
      const u = find(input.user_id);
      if (!u) return fail(404, 'not-found', 'no such user');
      u.role = input.role as Role;
      return json(u);
    }
    case 'disableUser': {
      const u = find(input.user_id);
      if (!u) return fail(404, 'not-found', 'no such user');
      u.disabled_at ??= '2026-09-24T12:00:00.000Z';
      return json(u);
    }
    case 'enableUser': {
      const u = find(input.user_id);
      if (!u) return fail(404, 'not-found', 'no such user');
      u.disabled_at = null;
      return json(u);
    }
    case 'renameUser': {
      const u = find(input.user_id);
      if (!u) return fail(404, 'not-found', 'no such user');
      if (typeof input.username === 'string') {
        const taken = users.some(
          (other) =>
            other.id !== u.id &&
            other.username.toLowerCase() === String(input.username).toLowerCase(),
        );
        if (taken)
          return fail(409, 'conflict', `the username '${String(input.username)}' is taken`);
        u.username = String(input.username);
      }
      if (typeof input.full_name === 'string') u.full_name = String(input.full_name);
      return json(u);
    }
    default:
      return fail(404, 'not-found', `no use case ${name}`);
  }
}

const named = (name: string) => calls.filter((c) => c.name === name);

function setWidth(px: number) {
  window.matchMedia = ((query: string) => ({
    matches: px >= 1024,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function renderAt(path: string) {
  const router = createMemoryRouter(routeTree(), { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

async function signInAs(role: Role) {
  await session.signIn({ ...admin, role }, 'tok-admin');
}

/** Every Dexie table, localStorage and sessionStorage, as one string. */
async function everythingStored(): Promise<string> {
  const parts: string[] = [];
  for (const table of db.tables) parts.push(JSON.stringify(await table.toArray()));
  for (const store of [localStorage, sessionStorage]) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)!;
      parts.push(key, store.getItem(key) ?? '');
    }
  }
  return parts.join('\n');
}

beforeEach(async () => {
  hydrate.mockReset();
  hydrate.mockResolvedValue('fresh');
  await db.delete();
  await db.open();
  await setMeta('sync.hydrated_event_id', 'ev-1');
  localStorage.clear();
  sessionStorage.clear();
  setWidth(1280);
  users = [
    stored({ id: admin.id, username: admin.username, full_name: admin.full_name, role: 'admin' }),
    stored({ id: 'u-dana', username: 'dana', full_name: 'דנה כהן', role: 'scouter' }),
    stored({ id: 'u-lead', username: 'seed_lead', full_name: 'Seed Lead', role: 'lead' }),
    stored({
      id: 'u-gone',
      username: 'gone',
      full_name: 'Gone Person',
      disabled_at: '2026-02-03T12:00:00.000Z',
    }),
  ];
  calls = [];
  overrides = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const name = String(url).split('/api/')[1] ?? '';
      const input = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ name, input, authorization: headers.authorization ?? null });
      const override = overrides[name];
      return override ? override(input) : serve(name, input);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------------------

describe('who reaches the user administration page (SPEC-FINAL 7.2, 7.4, 17.2)', () => {
  it('shows the Users link in the header to an admin only', async () => {
    await signInAs('admin');
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'Users' })).toHaveAttribute(
      'href',
      '/admin/users',
    );
  });

  it.each(['lead', 'scouter'] as const)('hides the Users link from a %s', async (role) => {
    await signInAs(role);
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'Entries' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it.each(['/admin/users', '/admin/users/u-dana'])(
    'a lead at %s gets the not-permitted state, and no user call is made',
    async (path) => {
      await signInAs('lead');
      renderAt(path);
      expect(
        await screen.findByRole('heading', { name: 'Only an admin can manage users' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to scouting' })).toHaveAttribute(
        'href',
        '/scout',
      );
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(named('listUsers')).toHaveLength(0);
    },
  );

  it('reaches the users table on an install with no competition set up, while Scout says so (task 1.17b)', async () => {
    await signInAs('admin');
    const router = renderAt('/admin/users');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByText(/no competition is set up yet/i)).not.toBeInTheDocument();
    await act(() => router.navigate('/scout'));
    expect(
      await screen.findByRole('heading', { name: 'No competition is set up yet' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/internet connection is required/i)).not.toBeInTheDocument();
  });

  it('is gated by DesktopOnly: a phone gets the needs-a-computer panel and no call', async () => {
    setWidth(640);
    await signInAs('admin');
    renderAt('/admin/users');
    expect(await screen.findByRole('heading', { name: /needs a computer/i })).toBeInTheDocument();
    expect(screen.getByText(/the user administration page/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(named('listUsers')).toHaveLength(0);
  });
});

describe('the users table', () => {
  it('shows skeleton rows, not a spinner, while the list loads', async () => {
    let release!: () => void;
    overrides.listUsers = (input) =>
      new Promise((resolve) => {
        release = () => resolve(serve('listUsers', input));
      });
    await signInAs('admin');
    const { container } = render(
      <RouterProvider
        router={createMemoryRouter(routeTree(), { initialEntries: ['/admin/users'] })}
      />,
    );
    const busy = await screen.findByRole('status', { name: 'Loading the users' });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(container.innerHTML).not.toMatch(/animate-spin/);
    await waitFor(() => expect(named('listUsers')).toHaveLength(1));
    act(() => release());
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading the users' })).not.toBeInTheDocument();
  });

  it('lists full name, username, role and status, with the bearer on every call', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const table = await screen.findByRole('table');
    const dana = within(table).getByRole('row', { name: /דנה כהן/ });
    expect(dana).toHaveTextContent('dana');
    expect(dana).toHaveTextContent('Scouter');
    expect(dana).toHaveTextContent('Active');
    expect(within(dana).getByText('דנה כהן')).toHaveAttribute('dir', 'auto');
    expect(calls.every((c) => c.authorization === 'Bearer tok-admin')).toBe(true);
  });

  it('loads every account once, disabled too; the Disabled chip shows them', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const table = await screen.findByRole('table');
    expect(within(table).queryByText('Gone Person')).not.toBeInTheDocument();
    expect(named('listUsers')).toHaveLength(1);
    expect(named('listUsers')[0]!.input.include_disabled).toBe(true);

    await userEvent.setup().click(screen.getByRole('button', { name: /^Disabled 1/ }));
    const row = await screen.findByRole('row', { name: /Gone Person/ });
    expect(row).toHaveTextContent(`Disabled since ${formatDate('2026-02-03T12:00:00.000Z')}`);
    expect(within(row).queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
    expect(named('listUsers')).toHaveLength(1);
  });

  it('asks for the season counts only when a season is active', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    await screen.findByRole('table');
    expect(named('getActiveContext').length).toBeGreaterThan(0);
    expect(named('countEntriesByScouter')).toHaveLength(0);
  });

  it('follows next_cursor until every page is loaded', async () => {
    for (let i = 0; i < 250; i++) {
      users.push(stored({ id: `u-bulk-${i}`, username: `bulk${String(i).padStart(3, '0')}` }));
    }
    await signInAs('admin');
    renderAt('/admin/users');
    const table = await screen.findByRole('table');
    // 253 enabled users: a header row plus one row each.
    expect(within(table).getAllByRole('row')).toHaveLength(254);
    expect(named('listUsers')).toHaveLength(2);
    expect(named('listUsers')[1]!.input.cursor).toBe('200');
  });

  it(`stops at ${MAX_LISTED_USERS} accounts and says so`, async () => {
    overrides.listUsers = (input) => {
      const start = typeof input.cursor === 'string' ? Number(input.cursor) : 0;
      const items = Array.from({ length: 200 }, (_, i) =>
        stored({ id: `u-${start + i}`, username: `user${start + i}` }),
      );
      return json({ items, next_cursor: String(start + 200) });
    };
    await signInAs('admin');
    renderAt('/admin/users');
    expect(
      await screen.findByText(`Showing the first ${MAX_LISTED_USERS} accounts.`, { exact: false }),
    ).toBeInTheDocument();
    expect(named('listUsers')).toHaveLength(MAX_LISTED_USERS / 200);
    // A 1000-row render: ~1.5 s alone, past 5 s when the whole monorepo suite shares the CPU.
  }, 15_000);

  it('a row opens the detail page, by click and by keyboard', async () => {
    await signInAs('admin');
    const router = renderAt('/admin/users');
    const u = userEvent.setup();
    const row = await screen.findByRole('row', { name: /Seed Lead/ });
    await u.click(within(row).getByText('seed_lead'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users/u-lead'));
    expect(await screen.findByRole('heading', { name: 'Seed Lead' })).toBeInTheDocument();

    await act(() => router.navigate('/admin/users'));
    const link = await screen.findByRole('link', { name: 'דנה כהן' });
    link.focus();
    await u.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users/u-dana'));
  });

  it('offline: the needs-the-server state says the data is safe, and Try again reloads', async () => {
    overrides.listUsers = () => {
      throw new TypeError('Failed to fetch');
    };
    await signInAs('admin');
    renderAt('/admin/users');
    expect(await screen.findByRole('heading', { name: /needs the server/i })).toBeInTheDocument();
    expect(screen.getByText(/safe on this device/)).toBeInTheDocument();
    delete overrides.listUsers;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});

describe('creating a user', () => {
  async function fillCreateForm(u: ReturnType<typeof userEvent.setup>) {
    await u.click(await screen.findByRole('button', { name: 'Add a user' }));
    const form = screen.getByRole('dialog', { name: 'Add a user' });
    await u.type(within(form).getByLabelText('Full name'), 'נועה לוי');
    const username = within(form).getByLabelText('Username');
    await u.clear(username);
    await u.type(username, 'noa');
    await u.click(within(form).getByRole('radio', { name: /Scout lead/ }));
    await u.click(within(form).getByRole('button', { name: 'Generate' }));
    const password = (within(form).getByLabelText('Initial password') as HTMLInputElement).value;
    return { form, password };
  }

  it('generates a word-word-digits password shown in clear', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    const { form, password } = await fillCreateForm(u);
    expect(password).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
    expect(within(form).getByLabelText('Initial password')).not.toHaveAttribute('type', 'password');
  });

  it('posts createUser with must_change: true when the checkbox is ticked', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    const { form, password } = await fillCreateForm(u);
    expect(within(form).getByLabelText(/change it at next sign-in/i)).toBeChecked();
    await u.click(within(form).getByRole('button', { name: 'Add user' }));

    expect(await screen.findByRole('row', { name: /נועה לוי/ })).toHaveTextContent('Scout lead');
    expect(named('createUser')).toHaveLength(1);
    expect(named('createUser')[0]!.input).toEqual({
      username: 'noa',
      full_name: 'נועה לוי',
      role: 'lead',
      password,
      must_change: true,
    });
    // No separate reset call: createUser sets must_change_password directly (spec §5.4 item 3).
    expect(named('resetPassword')).toHaveLength(0);
    // The new row comes from the answer: the list is not fetched again.
    expect(named('listUsers')).toHaveLength(1);
    const done = within(form).getByRole('status');
    expect(done).toHaveTextContent(password);
    expect(done).toHaveTextContent(/hand it over/i);
    expect(within(form).getByRole('button', { name: 'Done' })).toHaveFocus();
  });

  it('posts createUser with must_change: false when "change it at next sign-in" is unticked', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    const { form } = await fillCreateForm(u);
    await u.click(within(form).getByLabelText(/change it at next sign-in/i));
    await u.click(within(form).getByRole('button', { name: 'Add user' }));
    expect(await screen.findByRole('row', { name: /נועה לוי/ })).toBeInTheDocument();
    expect(named('createUser')[0]!.input).toMatchObject({ must_change: false });
    expect(within(form).getByRole('status')).not.toHaveTextContent(/next sign-in/);
  });

  it('Add another empties the form; Done drops the password', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    const { form, password } = await fillCreateForm(u);
    await u.click(within(form).getByRole('button', { name: 'Add user' }));
    await u.click(await within(form).findByRole('button', { name: 'Add another' }));
    expect(within(form).getByLabelText('Full name')).toHaveValue('');
    expect(within(form).getByLabelText('Full name')).toHaveFocus();
    expect(within(form).getByLabelText('Initial password')).toHaveValue('');
    expect(within(form).getByRole('radio', { name: /Scouter/ })).toBeChecked();
    await u.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(password);
  });

  it("shows the server's sentence for a taken username, never the code", async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Add a user' }));
    const form = screen.getByRole('dialog', { name: 'Add a user' });
    await u.type(within(form).getByLabelText('Full name'), 'Another Dana');
    const username = within(form).getByLabelText('Username');
    await u.clear(username);
    await u.type(username, 'dana');
    await u.type(within(form).getByLabelText('Initial password'), 'long-enough');
    await u.click(within(form).getByRole('button', { name: 'Add user' }));
    const alert = await within(form).findByRole('alert');
    expect(alert).toHaveTextContent("The username 'dana' is taken.");
    expect(alert).not.toHaveTextContent(/conflict|409/);
  });

  it('flags a username already loaded (any case) on the field, before any call', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Add a user' }));
    const form = screen.getByRole('dialog', { name: 'Add a user' });
    await u.type(within(form).getByLabelText('Full name'), 'Another Dana');
    const username = within(form).getByLabelText('Username');
    await u.clear(username);
    await u.type(username, 'DANA');
    await u.type(within(form).getByLabelText('Initial password'), 'long-enough');
    await u.click(within(form).getByRole('button', { name: 'Add user' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      "The username 'DANA' is taken.",
    );
    expect(username).toHaveAttribute('aria-invalid', 'true');
    expect(named('createUser')).toHaveLength(0);
  });

  it("still shows the server's sentence when the name was taken after the list loaded", async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Add a user' }));
    const form = screen.getByRole('dialog', { name: 'Add a user' });
    await u.type(within(form).getByLabelText('Full name'), 'Late Bird');
    const username = within(form).getByLabelText('Username');
    await u.clear(username);
    await u.type(username, 'latebird');
    users.push(stored({ id: 'u-late', username: 'latebird' }));
    await u.type(within(form).getByLabelText('Initial password'), 'long-enough');
    await u.click(within(form).getByRole('button', { name: 'Add user' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      "The username 'latebird' is taken.",
    );
    expect(named('createUser')).toHaveLength(1);
  });

  it('suggests a username nobody has, and keeps an edited one', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Add a user' }));
    const form = screen.getByRole('dialog', { name: 'Add a user' });
    await u.type(within(form).getByLabelText('Full name'), 'Dana');
    expect(within(form).getByLabelText('Username')).toHaveValue('dana2');
    expect(within(form).getByText('Suggested from the name')).toBeInTheDocument();
    await u.type(within(form).getByLabelText('Username'), 'x');
    await u.type(within(form).getByLabelText('Full name'), ' Cohen');
    expect(within(form).getByLabelText('Username')).toHaveValue('dana2x');
  });

  it('checks the fields before calling, with the shared rules', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Add a user' }));
    const form = screen.getByRole('dialog', { name: 'Add a user' });
    await u.type(within(form).getByLabelText('Full name'), 'Noa');
    await u.type(within(form).getByLabelText('Initial password'), 'short');
    await u.click(within(form).getByRole('button', { name: 'Add user' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'For the password, use at least 8 characters.',
    );
    expect(within(form).getByLabelText('Initial password')).toHaveAttribute('aria-invalid', 'true');
    expect(named('createUser')).toHaveLength(0);
  });

  it('a 403 from an admin call leaves the session intact', async () => {
    overrides.createUser = () => fail(403, 'forbidden', 'not permitted: manage_users');
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    const { form } = await fillCreateForm(u);
    await u.click(within(form).getByRole('button', { name: 'Add user' }));
    const alert = await within(form).findByRole('alert');
    expect(alert).toHaveTextContent(/only an admin can manage users/i);
    expect(alert).not.toHaveTextContent(/manage_users|forbidden/);
    const current = await session.current();
    expect(current?.token).toBe('tok-admin');
    expect(current?.expired).toBe(false);
    expect(screen.getByRole('heading', { name: 'Users', level: 1 })).toBeInTheDocument();
  });
});

describe('row quick actions', () => {
  it('resets a password from the row and shows it once', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    const row = await screen.findByRole('row', { name: /דנה כהן/ });
    await u.click(within(row).getByRole('button', { name: 'Reset password' }));
    const dlg = screen.getByRole('dialog', { name: 'Reset password' });
    const password = (within(dlg).getByLabelText('New password') as HTMLInputElement).value;
    expect(password).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
    await u.click(within(dlg).getByRole('button', { name: 'Reset password' }));
    expect(await within(dlg).findByRole('status')).toHaveTextContent(password);
    expect(named('resetPassword')[0]!.input).toEqual({
      user_id: 'u-dana',
      password,
      must_change: true,
    });
    await u.click(within(dlg).getByRole('button', { name: 'Done' }));
    expect(document.body.textContent).not.toContain(password);
  });

  it('disables from the row after the confirm, and the row moves to Disabled', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    const row = await screen.findByRole('row', { name: /דנה כהן/ });
    await u.click(within(row).getByRole('button', { name: 'Disable' }));
    const dialog = screen.getByRole('dialog', { name: 'Disable this account?' });
    expect(dialog).toHaveTextContent(DISABLE_BODY);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await u.click(within(dialog).getByRole('button', { name: 'Disable דנה כהן' }));
    expect(named('disableUser')[0]!.input).toEqual({ user_id: 'u-dana' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('row', { name: /דנה כהן/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Disabled 2/ })).toBeInTheDocument();
  });

  it('warns an admin who disables their own account', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    const row = await screen.findByRole('row', { name: /Seed Admin/ });
    await u.click(within(row).getByRole('button', { name: 'Disable' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'You will be signed out on your next request.',
    );
  });
});

describe('a generated password is never stored', () => {
  it('lands in no Dexie table, localStorage or sessionStorage after create and reset', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Add a user' }));
    const form = screen.getByRole('dialog', { name: 'Add a user' });
    await u.type(within(form).getByLabelText('Full name'), 'Noa');
    await u.click(within(form).getByRole('button', { name: 'Generate' }));
    const created = (within(form).getByLabelText('Initial password') as HTMLInputElement).value;
    await u.click(within(form).getByRole('button', { name: 'Add user' }));
    await u.click(await within(form).findByRole('button', { name: 'Done' }));

    const row = await screen.findByRole('row', { name: /דנה כהן/ });
    await u.click(within(row).getByRole('button', { name: 'Reset password' }));
    const reset = screen.getByRole('dialog', { name: 'Reset password' });
    const resetTo = (within(reset).getByLabelText('New password') as HTMLInputElement).value;
    await u.click(within(reset).getByRole('button', { name: 'Reset password' }));
    await within(reset).findByRole('status');

    const dump = await everythingStored();
    expect(dump).not.toContain(created);
    expect(dump).not.toContain(resetTo);

    // Positive control: the dump does see what is written to each kind of storage.
    await setMeta('probe', 'marker-in-dexie');
    localStorage.setItem('probe', 'marker-in-local');
    sessionStorage.setItem('probe', 'marker-in-session');
    const probed = await everythingStored();
    for (const marker of ['marker-in-dexie', 'marker-in-local', 'marker-in-session']) {
      expect(probed).toContain(marker);
    }
  });
});

// ---------------------------------------------------------------------------------------
// The page alone, with an injected rpc (as ManagePage's tests do): the design's twelve.

const ID = {
  tamar: 'u-01',
  eldad: 'u-02',
  noa: 'u-03',
  daniel: 'u-04',
  amit: 'u-05',
  yael: 'u-06',
} as const;

const USERS_12: PublicUser[] = (
  [
    [ID.tamar, 'Tamar Mizrahi', 'tamar.m', 'admin'],
    [ID.eldad, 'Eldad Gross', 'eldad.g', 'admin'],
    [ID.noa, 'Noa Levi', 'noa.levi', 'lead'],
    [ID.daniel, 'Daniel Rosen', 'daniel.r', 'lead'],
    [ID.amit, 'Amit Ben-David', 'amit.bd', 'scouter'],
    [ID.yael, 'Yael Shapira', 'yael.s', 'scouter'],
    ['u-07', 'Omer Katz', 'omer.k', 'scouter'],
    ['u-08', 'Itai Cohen', 'itai.c', 'scouter'],
    ['u-09', 'Maya Friedman', 'maya.f', 'scouter'],
    ['u-10', 'Lior Avraham', 'lior.a', 'scouter'],
    ['u-11', 'Shira Peretz', 'shira.p', 'scouter'],
    ['u-12', 'Roni Gal', 'roni.g', 'scouter', '2026-09-14T08:00:00.000Z'],
  ] as const
).map(([id, full_name, username, role, off]) =>
  stored({ id, full_name, username, role, disabled_at: off ?? null }),
);

function renderUsers({
  users: list,
  counts,
  failCount = false,
}: {
  users: PublicUser[];
  counts: { scouter_id: string; count: number }[];
  failCount?: boolean;
}) {
  const rows = [...list];
  const rpc = vi.fn(async (name: string, input?: unknown) => {
    const body = (input ?? {}) as Record<string, unknown>;
    if (name === 'listUsers') return { items: rows, next_cursor: null };
    if (name === 'getActiveContext') return { active_season_id: 's-2026', active_event_id: null };
    if (name === 'countEntriesByScouter') {
      if (failCount) throw new Error('count failed');
      return { items: counts };
    }
    if (name === 'createUser') {
      return stored({
        id: 'u-new',
        username: String(body.username),
        full_name: String(body.full_name),
        role: body.role as Role,
      });
    }
    throw new Error(`no answer for ${name}`);
  });
  const user = { ...admin, id: ID.tamar };
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Outlet context={{ user, expired: false, eventId: null }} />,
      children: [{ index: true, element: <UsersPage rpc={{ call: rpc }} /> }],
    },
  ]);
  render(<RouterProvider router={router} />);
  return rpc;
}

describe('the Users page with an injected rpc (RB.14)', () => {
  it('filters by role chip and shows entries this season', async () => {
    renderUsers({ users: USERS_12, counts: [{ scouter_id: ID.yael, count: 52 }] });
    await userEvent.click(await screen.findByRole('button', { name: /^Leads 2/ }));
    expect(screen.getAllByRole('row')).toHaveLength(1 + 2);
    await userEvent.click(screen.getByRole('button', { name: /^All/ }));
    expect(
      within(screen.getByRole('row', { name: /Yael Shapira/ })).getByText('52'),
    ).toBeInTheDocument();
  });

  it('counts active accounts per chip, and Disabled apart', async () => {
    renderUsers({ users: USERS_12, counts: [] });
    expect(await screen.findByRole('button', { name: 'All 11' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Scouters 7' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Admins 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disabled 1' })).toBeInTheDocument();
  });

  it('shows 0 in warn for someone with no entries, and searches name or username', async () => {
    renderUsers({ users: USERS_12, counts: [{ scouter_id: ID.yael, count: 52 }] });
    const shira = await screen.findByRole('row', { name: /Shira Peretz/ });
    expect(within(shira).getByText('0')).toHaveClass('text-warn');
    await userEvent.type(screen.getByRole('searchbox', { name: /Search/ }), 'NOA.');
    expect(screen.getAllByRole('row')).toHaveLength(1 + 1);
    expect(screen.getByRole('row', { name: /Noa Levi/ })).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox', { name: /Search/ }));
    await userEvent.type(screen.getByRole('searchbox', { name: /Search/ }), 'shapira');
    expect(screen.getByRole('row', { name: /Yael Shapira/ })).toBeInTheDocument();
  });

  it('loads the list and the season counts once each', async () => {
    const rpc = renderUsers({ users: USERS_12, counts: [] });
    await screen.findByRole('table');
    expect(rpc).toHaveBeenCalledWith(
      'listUsers',
      expect.objectContaining({ include_disabled: true }),
    );
    expect(rpc).toHaveBeenCalledWith('countEntriesByScouter', { season_id: 's-2026' });
    expect(rpc.mock.calls.filter(([name]) => name === 'listUsers')).toHaveLength(1);
  });

  it('adds a user in a dialog and hands the password over once', async () => {
    const rpc = renderUsers({ users: USERS_12, counts: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Add a user' }));
    const dlg = screen.getByRole('dialog', { name: 'Add a user' });
    await userEvent.type(within(dlg).getByLabelText('Full name'), 'Gal Levy');
    expect(within(dlg).getByLabelText('Username')).toHaveValue('gal.l');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Generate' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add user' }));
    expect(rpc).toHaveBeenCalledWith(
      'createUser',
      expect.objectContaining({ username: 'gal.l', role: 'scouter', must_change: true }),
    );
    expect(await within(dlg).findByText(/Created Gal Levy · gal.l/)).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Gal Levy/ })).toBeInTheDocument();
  });

  it('a failing entry count does not fail the page: the cell shows a dash', async () => {
    const rpc = renderUsers({
      users: USERS_12,
      counts: [],
      failCount: true,
    });
    const yael = await screen.findByRole('row', { name: /Yael Shapira/ });
    expect(rpc).toHaveBeenCalledWith('countEntriesByScouter', { season_id: 's-2026' });
    expect(within(yael).getByText('–')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /needs the server/i })).not.toBeInTheDocument();
  });

  it('the created handover labels the password', async () => {
    renderUsers({ users: USERS_12, counts: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Add a user' }));
    const dlg = screen.getByRole('dialog', { name: 'Add a user' });
    await userEvent.type(within(dlg).getByLabelText('Full name'), 'Gal Levy');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Generate' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Add user' }));
    expect(await within(dlg).findByText('Their password')).toBeInTheDocument();
  });

  it('disable from the row asks first', async () => {
    renderUsers({ users: USERS_12, counts: [] });
    const row = await screen.findByRole('row', { name: /Yael Shapira/ });
    await userEvent.hover(row);
    await userEvent.click(within(row).getByRole('button', { name: 'Disable' }));
    expect(screen.getByRole('dialog', { name: 'Disable this account?' })).toBeInTheDocument();
  });
});
