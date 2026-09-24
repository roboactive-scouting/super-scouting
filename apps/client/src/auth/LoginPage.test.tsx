import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { join } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { LoginPage } from './LoginPage';
import { NO_CACHED_ACCOUNTS_LINE } from './offlineLogin';
import { pendingCredential } from './pendingCredential';
import { session } from './session';

vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

const user = {
  id: '00000000-0000-4000-8000-000000000006',
  username: 'seed_scouter',
  full_name: 'Seed Scouter',
  role: 'scouter' as const,
  must_change_password: false,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();
let online = true;

beforeEach(async () => {
  await db.delete();
  await db.open();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>the scout page</p>} />
        <Route path="/change-password" element={<p>the change password page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function signInWith(username: string, password: string) {
  const u = userEvent.setup();
  await u.type(await screen.findByLabelText('Username'), username);
  await u.type(screen.getByLabelText('Password'), password);
  await u.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage (SPEC-FINAL 7.3, 7.5)', () => {
  it('labels both fields and sets their autocomplete hints', async () => {
    renderLogin();
    expect(await screen.findByLabelText('Username')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('has no forgot-password link, and says to ask an admin', async () => {
    renderLogin();
    expect(await screen.findByText(/ask an admin to reset it/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /forgot/i })).not.toBeInTheDocument();
  });

  it('gives the submit button the 48 px touch-target class', async () => {
    renderLogin();
    const button = await screen.findByRole('button', { name: 'Sign in' });
    expect(button).toHaveClass('tap-target');
    const css = readFileSync(join(import.meta.dirname, '../styles/index.css'), 'utf8');
    expect(css).toMatch(/\.tap-target\s*\{[^}]*min-block-size:\s*48px/);
  });

  it('signs in, stores the session and goes to the scout page', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { token: 'token-abc', user }));
    renderLogin();
    await signInWith('  seed_scouter ', 'seedpass1');

    expect(await screen.findByText('the scout page')).toBeInTheDocument();
    expect(await session.token()).toBe('token-abc');
    expect((await session.current())?.user.id).toBe(user.id);
    // The username is trimmed before it is sent (the schema caps the raw value).
    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { username: string };
    expect(sent.username).toBe('seed_scouter');
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has('authorization')).toBe(false);
  });

  it('routes must_change_password to the change-password screen', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { token: 't', user: { ...user, must_change_password: true } }),
    );
    renderLogin();
    await signInWith('seed_scouter', 'seedpass1');
    expect(await screen.findByText('the change password page')).toBeInTheDocument();
  });

  it('shows one clear line for a wrong password, and no raw error code', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, {
        error: { code: 'unauthenticated', message: 'that username and password do not match' },
      }),
    );
    renderLogin();
    await signInWith('seed_scouter', 'wrong');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That username and password do not match.');
    expect(document.body).not.toHaveTextContent(/unauthenticated|401/);
    expect(await session.current()).toBeNull();
  });

  it('does not expire an existing (expired-then-retrying) session on a wrong password', async () => {
    await session.signIn(user, 'old');
    await session.expire();
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'no match' } }),
    );
    renderLogin();
    const u = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Username')).toHaveValue('seed_scouter'));
    await u.type(screen.getByLabelText('Password'), 'wrong');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('alert');
    expect((await session.current())?.expired).toBe(true);
    expect((await session.current())?.user.id).toBe(user.id);
  });

  it.each([
    [403, 'forbidden', 'This account has been disabled. Ask an admin.'],
    [429, 'rate-limited', 'Too many attempts. Wait a few minutes and try again.'],
    [500, 'invalid', 'The server is having trouble. Try again in a minute.'],
  ])('maps HTTP %i to a sentence, never the code', async (status, code, line) => {
    fetchMock.mockResolvedValueOnce(json(status, { error: { code, message: 'raw server text' } }));
    renderLogin();
    await signInWith('seed_scouter', 'seedpass1');
    expect(await screen.findByRole('alert')).toHaveTextContent(line);
    expect(document.body).not.toHaveTextContent(code);
  });

  it('while offline, says it will use the credentials cached on this device', async () => {
    online = false;
    renderLogin();
    expect(
      await screen.findByText(/will use the credentials cached on this device/i),
    ).toBeInTheDocument();
  });

  it('says the device has no cached accounts when it cannot reach the server and never synced', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderLogin();
    await signInWith('seed_scouter', 'seedpass1');
    expect(await screen.findByRole('alert')).toHaveTextContent(NO_CACHED_ACCOUNTS_LINE);
    expect(await session.current()).toBeNull();
  });
});

describe('LoginPage offline (SPEC-FINAL 7.5, task 1.16)', () => {
  beforeEach(async () => {
    pendingCredential.clear();
    await db.rows.put({
      entity: 'users',
      ...user,
      // A reset is pending on the server; offline it must not block entering data.
      must_change_password: true,
      password_hash: bcrypt.hashSync('seedpass1', 10),
      disabled_at: null,
    });
  });

  it.each([
    ['no connection', () => Promise.reject(new TypeError('Failed to fetch'))],
    [
      'a captive portal page',
      () =>
        Promise.resolve(
          new Response('<html>Accept the terms</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
        ),
    ],
    ['a 502 from a proxy', () => Promise.resolve(new Response('Bad gateway', { status: 502 }))],
  ])('signs in against the cached hash on %s', async (_name, answer) => {
    fetchMock.mockImplementationOnce(answer);
    renderLogin();
    await signInWith('Seed_Scouter', 'seedpass1');
    expect(await screen.findByText('the scout page')).toBeInTheDocument();
    const current = await session.current();
    expect(current?.user.id).toBe(user.id);
    expect(current?.token).toBeNull();
    expect(current?.offline).toBe(true);
    expect(pendingCredential.get()?.password).toBe('seedpass1');
  });

  it('refuses a wrong password offline', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderLogin();
    await signInWith('seed_scouter', 'wrong-pass');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That username and password do not match.',
    );
    expect(await session.current()).toBeNull();
  });

  it('never falls back to the cached hash on a definitive 401', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'no match' } }),
    );
    renderLogin();
    // The cached hash matches this password; the server says it is no longer right.
    await signInWith('seed_scouter', 'seedpass1');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That username and password do not match.',
    );
    expect(await session.current()).toBeNull();
    expect(pendingCredential.get()).toBeNull();
  });

  it('refuses a disabled account offline', async () => {
    await db.rows.put({
      entity: 'users',
      ...user,
      password_hash: bcrypt.hashSync('seedpass1', 10),
      disabled_at: '2026-01-01T00:00:00.000Z',
    });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderLogin();
    await signInWith('seed_scouter', 'seedpass1');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This account has been disabled. Ask an admin.',
    );
    expect(await session.current()).toBeNull();
  });

  it('prefills the username and explains an expired sign-in', async () => {
    await session.signIn(user, 'old');
    await session.expire();
    renderLogin();
    await waitFor(() => expect(screen.getByLabelText('Username')).toHaveValue('seed_scouter'));
    expect(
      screen.getByText(
        'Your sign-in expired. Everything you entered is saved on this device and will sync after you sign in.',
      ),
    ).toBeInTheDocument();
  });

  it('sends a signed-in user straight on', async () => {
    await session.signIn(user, 'live');
    renderLogin();
    expect(await screen.findByText('the scout page')).toBeInTheDocument();
  });
});
