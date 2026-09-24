import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate, type PublicUser, type Role } from '@frc/shared';
import { session } from '@/auth/session';
import { db, setMeta } from '@/data/db';
import type * as SyncModule from '@/data/sync';
import { routeTree } from '@/routes';
import { PASSWORD_ALPHABET } from './password';
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
    case 'createUser': {
      if (users.some((u) => u.username === input.username)) {
        return fail(409, 'conflict', `the username '${String(input.username)}' is taken`);
      }
      const created = stored({
        id: `u-new-${users.length}`,
        username: String(input.username),
        full_name: String(input.full_name),
        role: input.role as Role,
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
  const router = createMemoryRouter(routeTree('ev-1'), { initialEntries: [path] });
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
      expect(screen.getByRole('link', { name: 'Back to scouting' })).toHaveAttribute('href', '/');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(named('listUsers')).toHaveLength(0);
    },
  );

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
        router={createMemoryRouter(routeTree('ev-1'), { initialEntries: ['/admin/users'] })}
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

  it('hides disabled accounts until "Show disabled accounts" is ticked', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const table = await screen.findByRole('table');
    expect(within(table).queryByText('Gone Person')).not.toBeInTheDocument();
    expect(named('listUsers')[0]!.input.include_disabled).toBe(false);

    await userEvent.setup().click(screen.getByLabelText('Show disabled accounts'));
    const row = await screen.findByRole('row', { name: /Gone Person/ });
    expect(row).toHaveTextContent(`Disabled since ${formatDate('2026-02-03T12:00:00.000Z')}`);
    expect(named('listUsers').at(-1)!.input.include_disabled).toBe(true);
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
  });

  it('a row opens the detail page, by click and by keyboard', async () => {
    await signInAs('admin');
    const router = renderAt('/admin/users');
    const u = userEvent.setup();
    const row = await screen.findByRole('row', { name: /Seed Lead/ });
    await u.click(within(row).getByText('Lead'));
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
    const form = await screen.findByRole('form', { name: 'Add a user' });
    await u.type(within(form).getByLabelText('Username'), 'noa');
    await u.type(within(form).getByLabelText('Full name'), 'נועה לוי');
    await u.selectOptions(within(form).getByLabelText('Role'), 'lead');
    await u.click(within(form).getByRole('button', { name: 'Generate' }));
    const password = (within(form).getByLabelText('Initial password') as HTMLInputElement).value;
    return { form, password };
  }

  it('generates a 12-character password shown in clear', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    const { form, password } = await fillCreateForm(u);
    expect(password).toMatch(new RegExp(`^[${PASSWORD_ALPHABET}]{12}$`));
    expect(within(form).getByLabelText('Initial password')).toHaveAttribute('type', 'text');
  });

  it('posts createUser, then resetPassword with the same password to force a change', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    const { form, password } = await fillCreateForm(u);
    expect(within(form).getByLabelText(/change it at first sign-in/i)).toBeChecked();
    await u.click(within(form).getByRole('button', { name: 'Add user' }));

    expect(await screen.findByRole('row', { name: /נועה לוי/ })).toHaveTextContent('Lead');
    expect(named('createUser')).toHaveLength(1);
    expect(named('createUser')[0]!.input).toEqual({
      username: 'noa',
      full_name: 'נועה לוי',
      role: 'lead',
      password,
    });
    expect(named('resetPassword')).toHaveLength(1);
    expect(named('resetPassword')[0]!.input).toEqual({
      user_id: users.at(-1)!.id, // the id the create returned
      password,
      must_change: true,
    });
    // The order matters: the reset needs the id the create returned.
    expect(calls.findIndex((c) => c.name === 'createUser')).toBeLessThan(
      calls.findIndex((c) => c.name === 'resetPassword'),
    );
    const done = screen.getByRole('status', { name: /created/i });
    expect(done).toHaveTextContent(password);
    expect(done).toHaveTextContent(/hand it over/i);
  });

  it('does not reset when "change it at first sign-in" is unticked', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    const { form } = await fillCreateForm(u);
    await u.click(within(form).getByLabelText(/change it at first sign-in/i));
    await u.click(within(form).getByRole('button', { name: 'Add user' }));
    expect(await screen.findByRole('row', { name: /נועה לוי/ })).toBeInTheDocument();
    expect(named('createUser')).toHaveLength(1);
    expect(named('resetPassword')).toHaveLength(0);
  });

  it('a failed reset after a successful create says the account exists, not a generic failure', async () => {
    overrides.resetPassword = () => fail(500, 'internal', 'boom');
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    const { form } = await fillCreateForm(u);
    await u.click(within(form).getByRole('button', { name: 'Add user' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/created, but the first-sign-in change could not be set/i);
    expect(alert).not.toHaveTextContent(/boom|internal/);
    expect(await screen.findByRole('row', { name: /נועה לוי/ })).toBeInTheDocument();
  });

  it("shows the server's sentence for a taken username, never the code", async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    const form = await screen.findByRole('form', { name: 'Add a user' });
    await u.type(within(form).getByLabelText('Username'), 'dana');
    await u.type(within(form).getByLabelText('Full name'), 'Another Dana');
    await u.type(within(form).getByLabelText('Initial password'), 'long-enough');
    await u.click(within(form).getByRole('button', { name: 'Add user' }));
    const alert = await within(form).findByRole('alert');
    expect(alert).toHaveTextContent("The username 'dana' is taken.");
    expect(alert).not.toHaveTextContent(/conflict|409/);
    expect(named('resetPassword')).toHaveLength(0);
  });

  it('checks the fields before calling, with the shared rules', async () => {
    await signInAs('admin');
    renderAt('/admin/users');
    const u = userEvent.setup();
    const form = await screen.findByRole('form', { name: 'Add a user' });
    await u.type(within(form).getByLabelText('Username'), 'noa');
    await u.type(within(form).getByLabelText('Full name'), 'Noa');
    await u.type(within(form).getByLabelText('Initial password'), 'short');
    await u.click(within(form).getByRole('button', { name: 'Add user' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'For the password, use at least 8 characters.',
    );
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
    expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument();
  });
});

describe('the detail page', () => {
  it('changes the role with a select, and confirms it in a line', async () => {
    await signInAs('admin');
    renderAt('/admin/users/u-dana');
    const u = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'דנה כהן' })).toHaveAttribute('dir', 'auto');
    await u.selectOptions(screen.getByLabelText('Role'), 'lead');
    expect(await screen.findByText(/^Saved\./)).toBeInTheDocument();
    expect(named('setUserRole')[0]!.input).toEqual({ user_id: 'u-dana', role: 'lead' });
    expect(screen.getByLabelText('Role')).toHaveValue('lead');
  });

  it("surfaces the server's last-admin refusal as a sentence and keeps the old role", async () => {
    overrides.setUserRole = () =>
      fail(400, 'invalid', 'this is the last enabled admin; make another admin first');
    await signInAs('admin');
    renderAt('/admin/users/u-admin');
    const u = userEvent.setup();
    await screen.findByRole('heading', { name: 'Seed Admin' });
    await u.selectOptions(screen.getByLabelText('Role'), 'scouter');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This is the last enabled admin; make another admin first.',
    );
    expect(screen.getByLabelText('Role')).toHaveValue('admin');
  });

  it('a 403 on a role change leaves the session intact', async () => {
    overrides.setUserRole = () => fail(403, 'forbidden', 'not permitted: manage_users');
    await signInAs('admin');
    renderAt('/admin/users/u-dana');
    const u = userEvent.setup();
    await screen.findByRole('heading', { name: 'דנה כהן' });
    await u.selectOptions(screen.getByLabelText('Role'), 'lead');
    expect(await screen.findByRole('alert')).toHaveTextContent(/only an admin/i);
    const current = await session.current();
    expect(current?.token).toBe('tok-admin');
    expect(current?.expired).toBe(false);
  });

  it('resets a password, shows it once, and forgets it on leaving the page', async () => {
    await signInAs('admin');
    const router = renderAt('/admin/users/u-dana');
    const u = userEvent.setup();
    const reset = await screen.findByRole('form', { name: 'Reset password' });
    await u.click(within(reset).getByRole('button', { name: 'Generate' }));
    const password = (within(reset).getByLabelText('New password') as HTMLInputElement).value;
    expect(password).toHaveLength(12);
    expect(within(reset).getByLabelText(/change it at next sign-in/i)).toBeChecked();
    await u.click(within(reset).getByRole('button', { name: 'Reset password' }));

    const shown = await screen.findByRole('status', { name: /new password/i });
    expect(shown).toHaveTextContent(password);
    expect(named('resetPassword')[0]!.input).toEqual({
      user_id: 'u-dana',
      password,
      must_change: true,
    });
    // Shown once: it is not left in the field either.
    expect(within(reset).getByLabelText('New password')).toHaveValue('');

    await act(() => router.navigate('/admin/users'));
    await screen.findByRole('table');
    await act(() => router.navigate('/admin/users/u-dana'));
    await screen.findByRole('heading', { name: 'דנה כהן' });
    expect(document.body.textContent).not.toContain(password);
  });

  it('disabling asks a plain confirm naming the person, and says it is not a delete', async () => {
    await signInAs('admin');
    renderAt('/admin/users/u-dana');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Disable account' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('דנה כהן');
    expect(dialog).toHaveTextContent(DISABLE_BODY);
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument(); // plain confirm
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(named('disableUser')).toHaveLength(0);

    await u.click(screen.getByRole('button', { name: 'Disable account' }));
    await u.click(screen.getByRole('button', { name: 'Disable דנה כהן' }));
    expect(named('disableUser')[0]!.input).toEqual({ user_id: 'u-dana' });
    expect(await screen.findByText(/This account is disabled/)).toBeInTheDocument();
    expect(screen.getByText(/re-enabling .* is not available yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enable/i })).not.toBeInTheDocument();
  });

  it('warns an admin who disables their own account', async () => {
    await signInAs('admin');
    renderAt('/admin/users/u-admin');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Disable account' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'You will be signed out on your next request.',
    );
  });

  it('a disabled account says so and offers no enable, role or reset', async () => {
    await signInAs('admin');
    renderAt('/admin/users/u-gone');
    expect(await screen.findByText(/This account is disabled/)).toHaveTextContent(
      formatDate('2026-02-03T12:00:00.000Z'),
    );
    expect(screen.queryByRole('button', { name: /enable/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable account' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();
  });

  it('an unknown id says there is no such user, with a way back', async () => {
    await signInAs('admin');
    renderAt('/admin/users/u-nobody');
    expect(await screen.findByRole('heading', { name: /no user/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All users' })).toHaveAttribute('href', '/admin/users');
  });
});

describe('a generated password is never stored', () => {
  it('lands in no Dexie table, localStorage or sessionStorage after create and reset', async () => {
    await signInAs('admin');
    const router = renderAt('/admin/users');
    const u = userEvent.setup();
    const form = await screen.findByRole('form', { name: 'Add a user' });
    await u.type(within(form).getByLabelText('Username'), 'noa');
    await u.type(within(form).getByLabelText('Full name'), 'Noa');
    await u.click(within(form).getByRole('button', { name: 'Generate' }));
    const created = (within(form).getByLabelText('Initial password') as HTMLInputElement).value;
    await u.click(within(form).getByRole('button', { name: 'Add user' }));
    await screen.findByRole('row', { name: /Noa/ });

    await act(() => router.navigate('/admin/users/u-dana'));
    const reset = await screen.findByRole('form', { name: 'Reset password' });
    await u.click(within(reset).getByRole('button', { name: 'Generate' }));
    const resetTo = (within(reset).getByLabelText('New password') as HTMLInputElement).value;
    await u.click(within(reset).getByRole('button', { name: 'Reset password' }));
    await screen.findByRole('status', { name: /new password/i });

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
