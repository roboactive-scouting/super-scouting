import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDate, type PublicUser } from '@frc/shared';
import { session } from '@/auth/session';
import { RpcError } from '@/data/rpc';
import { DISABLE_BODY, SELF_DISABLE_LINE, UserDetailPage } from './UserDetailPage';

// The generator is RB.14's (password.ts); the page only needs something to put in the field.
vi.mock('./password', () => ({ generatePassword: () => 'Tulip-Maple-42' }));

const stored = (over: Partial<PublicUser> & { id: string; username: string }): PublicUser => ({
  full_name: over.username,
  role: 'scouter',
  must_change_password: false,
  disabled_at: null,
  created_at: '2026-09-02T12:00:00.000Z',
  ...over,
});

const ME = stored({ id: 'u-me', username: 'tamar.m', full_name: 'Tamar Mizrahi', role: 'admin' });
const YAEL = stored({ id: 'u-yael', username: 'yael.s', full_name: 'Yael Shapira' });
const TAMAR_LAST_ADMIN = ME;
const RONI = stored({
  id: 'u-roni',
  username: 'roni.g',
  full_name: 'Roni Gal',
  disabled_at: '2026-09-14T08:00:00.000Z',
});

type Answer = (name: string, input: unknown) => unknown;

/**
 * Mounts `<UserDetailPage rpc={{ call }} />` at /admin/users/:id under the outlet context
 * the shell gives it. `rpc` answers first; `undefined` falls back to the default server:
 * the list holds `user`, any write answers with the user.
 */
function renderDetail({
  user,
  rpc: answer,
  me = ME,
}: {
  user: PublicUser;
  rpc?: Answer;
  me?: PublicUser;
}) {
  const call = vi.fn(async (name: string, input: unknown) => {
    const custom = answer?.(name, input);
    if (custom !== undefined) return custom;
    if (name === 'listUsers') return { items: [me, user], next_cursor: null };
    return user;
  });
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={{ user: me, expired: false, eventId: null, gate: 'ready' }} />,
        children: [
          { path: 'admin/users/:id', element: <UserDetailPage rpc={{ call }} /> },
          { path: 'admin/users', element: <p>The list</p> },
        ],
      },
    ],
    { initialEntries: [`/admin/users/${user.id}`] },
  );
  render(<RouterProvider router={router} />);
  return call;
}

const callsOf = (call: ReturnType<typeof vi.fn>, name: string) =>
  call.mock.calls.filter(([n]) => n === name);

afterEach(() => vi.restoreAllMocks());

describe('the header', () => {
  it('names the account: initials, name, username, created date', async () => {
    renderDetail({ user: YAEL });
    expect(await screen.findByRole('heading', { level: 1, name: 'Yael Shapira' })).toHaveAttribute(
      'dir',
      'auto',
    );
    expect(screen.getByText('yael.s')).toBeInTheDocument();
    expect(screen.getByText(`created ${formatDate(YAEL.created_at)}`)).toBeInTheDocument();
    expect(screen.queryByText('This is you')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All users' })).toHaveAttribute('href', '/admin/users');
  });

  it('tags your own account', async () => {
    renderDetail({ user: ME });
    expect(await screen.findByText('This is you')).toBeInTheDocument();
  });

  it('an unknown id says there is no such user, with a way back', async () => {
    const call = vi.fn(async () => ({ items: [ME], next_cursor: null }));
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <Outlet context={{ user: ME, expired: false, eventId: null, gate: 'ready' }} />,
          children: [{ path: 'admin/users/:id', element: <UserDetailPage rpc={{ call }} /> }],
        },
      ],
      { initialEntries: ['/admin/users/u-nobody'] },
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: /no user/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All users' })).toHaveAttribute('href', '/admin/users');
  });

  it('offline: the needs-the-server state, and Try again loads once more', async () => {
    let up = false;
    const call = vi.fn(async () => {
      if (!up) throw new RpcError('network', 'no connection', 0, false);
      return { items: [YAEL], next_cursor: null };
    });
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <Outlet context={{ user: ME, expired: false, eventId: null, gate: 'ready' }} />,
          children: [{ path: 'admin/users/:id', element: <UserDetailPage rpc={{ call }} /> }],
        },
      ],
      { initialEntries: ['/admin/users/u-yael'] },
    );
    render(<RouterProvider router={router} />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    up = true;
    await userEvent.click(retry);
    expect(await screen.findByRole('heading', { name: 'Yael Shapira' })).toBeInTheDocument();
  });
});

describe('the role', () => {
  it('shows three described choices with the current one picked', async () => {
    renderDetail({ user: YAEL });
    expect(await screen.findByRole('radio', { name: /Scouter/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Scout lead/ })).toHaveTextContent(
      'Fixes any entry, pick list',
    );
    expect(screen.getByRole('radio', { name: /Admin/ })).toHaveTextContent(
      'Everything, incl. users',
    );
    expect(
      screen.getByText('Saves as soon as you pick. It applies from their next request.'),
    ).toBeInTheDocument();
  });

  it('saves a role on pick: Saving…, then Saved', async () => {
    let resolve!: (u: unknown) => void;
    const rpc = renderDetail({
      user: YAEL,
      rpc: (name) => (name === 'setUserRole' ? new Promise((r) => (resolve = r)) : undefined),
    });
    await userEvent.click(await screen.findByRole('radio', { name: /Scout lead/ }));
    expect(screen.getByRole('radio', { name: /Scout lead/ })).toHaveTextContent('Saving…');
    expect(screen.getByRole('radio', { name: /Admin/ })).toBeDisabled();
    await act(async () => resolve({ ...YAEL, role: 'lead' }));
    expect(
      screen.getByText('Saved. Yael Shapira is now a lead. It applies from their next request.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Scout lead/ })).toBeChecked();
    expect(rpc).toHaveBeenCalledWith('setUserRole', { user_id: YAEL.id, role: 'lead' });
  });

  it('a refused role change shows the server sentence and restores the role', async () => {
    renderDetail({
      user: TAMAR_LAST_ADMIN,
      rpc: (name) =>
        name === 'setUserRole'
          ? Promise.reject(
              new RpcError('conflict', 'The last enabled admin must stay an admin.', 409, true),
            )
          : undefined,
    });
    await userEvent.click(await screen.findByRole('radio', { name: /Scouter/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The last enabled admin must stay an admin.',
    );
    expect(screen.getByRole('radio', { name: /Admin/ })).toBeChecked();
  });

  it('a 403 says only an admin can do this, and leaves the session alone', async () => {
    const signedOut = vi.spyOn(session, 'signOut');
    renderDetail({
      user: YAEL,
      rpc: (name) =>
        name === 'setUserRole'
          ? Promise.reject(new RpcError('forbidden', 'not permitted: manage_users', 403, true))
          : undefined,
    });
    await userEvent.click(await screen.findByRole('radio', { name: /Scout lead/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/only an admin/i);
    expect(signedOut).not.toHaveBeenCalled();
  });

  it('on your own account warns first, and follows the new role in the session', async () => {
    const update = vi.spyOn(session, 'updateUser').mockResolvedValue(undefined);
    renderDetail({
      user: ME,
      rpc: (name) => (name === 'setUserRole' ? { ...ME, role: 'lead' } : undefined),
    });
    expect(
      await screen.findByText(
        'This is your own account. Another role takes away your access to this page.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Scout lead/ }));
    expect(await screen.findByText(/^Saved\. Tamar Mizrahi is now a lead/)).toBeInTheDocument();
    expect(update).toHaveBeenCalledWith({ role: 'lead' });
  });

  it('a saved role stays saved when the session could not follow it', async () => {
    vi.spyOn(session, 'updateUser').mockRejectedValue(new Error('IndexedDB is closed'));
    renderDetail({
      user: ME,
      rpc: (name) => (name === 'setUserRole' ? { ...ME, role: 'lead' } : undefined),
    });
    await userEvent.click(await screen.findByRole('radio', { name: /Scout lead/ }));
    expect(await screen.findByText(/^Saved\. Tamar Mizrahi is now a lead/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('rename', () => {
  it('posts renameUser with both fields and shows the new name', async () => {
    const rpc = renderDetail({
      user: YAEL,
      rpc: (name, input) => (name === 'renameUser' ? { ...YAEL, ...(input as object) } : undefined),
    });
    const form = await screen.findByRole('form', { name: 'Rename' });
    const username = within(form).getByLabelText('Username');
    await userEvent.clear(username);
    await userEvent.type(username, 'yael2');
    const full = within(form).getByLabelText('Full name');
    await userEvent.clear(full);
    await userEvent.type(full, 'Yael Levi');
    await userEvent.click(within(form).getByRole('button', { name: 'Save name' }));
    expect(rpc).toHaveBeenCalledWith('renameUser', {
      user_id: YAEL.id,
      username: 'yael2',
      full_name: 'Yael Levi',
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Yael Levi' })).toBeInTheDocument();
    expect(within(form).getByRole('status')).toHaveTextContent('Saved.');
  });

  it('says what an offline device does with the old name', async () => {
    renderDetail({ user: YAEL });
    const form = await screen.findByRole('form', { name: 'Rename' });
    expect(form).toHaveTextContent(/offline/i);
    expect(form).toHaveTextContent(/sync/i);
  });

  it("shows the server's sentence for a taken username, never the code", async () => {
    renderDetail({
      user: YAEL,
      rpc: (name) =>
        name === 'renameUser'
          ? Promise.reject(new RpcError('conflict', "the username 'noa' is taken", 409, true))
          : undefined,
    });
    const form = await screen.findByRole('form', { name: 'Rename' });
    const username = within(form).getByLabelText('Username');
    await userEvent.clear(username);
    await userEvent.type(username, 'noa');
    await userEvent.click(within(form).getByRole('button', { name: 'Save name' }));
    const alert = await within(form).findByRole('alert');
    expect(alert).toHaveTextContent("The username 'noa' is taken.");
    expect(alert).not.toHaveTextContent(/conflict|409/);
    // A refusal is the form's, not a field's: neither field is marked.
    expect(username).not.toHaveAttribute('aria-invalid');
    expect(within(form).getByLabelText('Full name')).not.toHaveAttribute('aria-invalid');
  });

  it('an empty username is a field error, not a call', async () => {
    const rpc = renderDetail({ user: YAEL });
    const form = await screen.findByRole('form', { name: 'Rename' });
    await userEvent.clear(within(form).getByLabelText('Username'));
    await userEvent.click(within(form).getByRole('button', { name: 'Save name' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(/enter a username/i);
    expect(callsOf(rpc, 'renameUser')).toHaveLength(0);
  });

  it('renaming yourself updates the session at once', async () => {
    const update = vi.spyOn(session, 'updateUser').mockResolvedValue(undefined);
    renderDetail({
      user: ME,
      rpc: (name, input) => (name === 'renameUser' ? { ...ME, ...(input as object) } : undefined),
    });
    const form = await screen.findByRole('form', { name: 'Rename' });
    const full = within(form).getByLabelText('Full name');
    await userEvent.clear(full);
    await userEvent.type(full, 'Tamar M');
    await userEvent.click(within(form).getByRole('button', { name: 'Save name' }));
    await screen.findByRole('heading', { level: 1, name: 'Tamar M' });
    expect(update).toHaveBeenCalledWith({ username: 'tamar.m', full_name: 'Tamar M' });
  });

  it('a saved rename stays saved when the session could not follow it', async () => {
    vi.spyOn(session, 'updateUser').mockRejectedValue(new Error('IndexedDB is closed'));
    renderDetail({
      user: ME,
      rpc: (name, input) => (name === 'renameUser' ? { ...ME, ...(input as object) } : undefined),
    });
    const form = await screen.findByRole('form', { name: 'Rename' });
    const full = within(form).getByLabelText('Full name');
    await userEvent.clear(full);
    await userEvent.type(full, 'Tamar M');
    await userEvent.click(within(form).getByRole('button', { name: 'Save name' }));
    expect(await within(form).findByRole('status')).toHaveTextContent('Saved.');
    expect(within(form).queryByRole('alert')).toBeNull();
  });
});

describe('reset password', () => {
  it('generates, resets, hands over once, and forgets it', async () => {
    const rpc = renderDetail({ user: YAEL });
    const form = await screen.findByRole('form', { name: 'Reset password' });
    await userEvent.click(within(form).getByRole('button', { name: 'Generate' }));
    const field = within(form).getByLabelText('New password') as HTMLInputElement;
    const password = field.value;
    expect(password.length).toBeGreaterThanOrEqual(8);
    expect(within(form).getByLabelText(/change it at next sign-in/i)).toBeChecked();
    await userEvent.click(within(form).getByRole('button', { name: 'Reset password' }));

    expect(await within(form).findByText('Yael Shapira', { selector: 'span' })).toBeInTheDocument();
    expect(within(form).getByText(password)).toBeInTheDocument();
    expect(
      within(form).getByText(/shown once and kept nowhere; they choose their own/),
    ).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('resetPassword', {
      user_id: YAEL.id,
      password,
      must_change: true,
    });
    expect(field).toHaveValue('');

    await userEvent.click(within(form).getByRole('button', { name: 'Done' }));
    expect(screen.queryByText(password)).not.toBeInTheDocument();
    expect(JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).not.toContain(password);
  });

  it('a short password is a sentence, not a call', async () => {
    const rpc = renderDetail({ user: YAEL });
    const form = await screen.findByRole('form', { name: 'Reset password' });
    await userEvent.type(within(form).getByLabelText('New password'), 'abc');
    await userEvent.click(within(form).getByRole('button', { name: 'Reset password' }));
    expect(await within(form).findByRole('alert')).toBeInTheDocument();
    expect(callsOf(rpc, 'resetPassword')).toHaveLength(0);
  });
});

describe('disable and enable', () => {
  it('disabling asks first, naming the person, and says it is not a delete', async () => {
    const rpc = renderDetail({
      user: YAEL,
      rpc: (name) =>
        name === 'disableUser' ? { ...YAEL, disabled_at: '2026-10-07T08:00:00.000Z' } : undefined,
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Disable account' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Yael Shapira');
    expect(dialog).toHaveTextContent(DISABLE_BODY);
    expect(dialog).not.toHaveTextContent(SELF_DISABLE_LINE);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(callsOf(rpc, 'disableUser')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Disable account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Disable Yael Shapira' }));
    expect(rpc).toHaveBeenCalledWith('disableUser', { user_id: YAEL.id });
    expect(await screen.findByText(/This account is disabled since/)).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('warns whoever disables their own account', async () => {
    renderDetail({ user: ME });
    await userEvent.click(await screen.findByRole('button', { name: 'Disable account' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(SELF_DISABLE_LINE);
  });

  it("a refused disable shows the server's sentence inside the dialog", async () => {
    renderDetail({
      user: YAEL,
      rpc: (name) =>
        name === 'disableUser'
          ? Promise.reject(
              new RpcError('conflict', 'The last enabled admin must stay enabled.', 409, true),
            )
          : undefined,
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Disable account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Disable Yael Shapira' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'The last enabled admin must stay enabled.',
    );
  });

  it('a disabled account shows one box with Enable, and no other section', async () => {
    const rpc = renderDetail({
      user: RONI,
      rpc: (name) => (name === 'enableUser' ? { ...RONI, disabled_at: null } : undefined),
    });
    expect(await screen.findByText(/This account is disabled since/)).toHaveTextContent(
      formatDate(RONI.disabled_at!),
    );
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable account' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Enable account' }));
    expect(rpc).toHaveBeenCalledWith('enableUser', { user_id: RONI.id });
    expect(await screen.findByRole('button', { name: 'Disable account' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Role' })).toBeInTheDocument();
  });
});
