import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { ChangePasswordPage } from './ChangePasswordPage';
import { session } from './session';

vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

const user = {
  id: '00000000-0000-4000-8000-000000000006',
  username: 'seed_scouter',
  full_name: 'Seed Scouter',
  role: 'scouter' as const,
  must_change_password: true,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  await db.delete();
  await db.open();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  await session.signIn(user, 'token-abc');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/change-password']}>
      <Routes>
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/" element={<p>the scout page</p>} />
        <Route path="/login" element={<p>the login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fill(current: string, next: string, confirm = next) {
  const u = userEvent.setup();
  await u.type(await screen.findByLabelText('Current password'), current);
  await u.type(screen.getByLabelText('New password'), next);
  await u.type(screen.getByLabelText('Confirm new password'), confirm);
  await u.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('ChangePasswordPage (SPEC-FINAL 7.3)', () => {
  it('labels all three fields with the right autocomplete hints', async () => {
    renderPage();
    expect(await screen.findByLabelText('Current password')).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });

  it("refuses fewer than 8 characters with the server's own message, sending nothing", async () => {
    renderPage();
    await fill('seedpass1', 'short');
    expect(await screen.findByRole('alert')).toHaveTextContent(/^use at least 8 characters\.?$/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a confirmation that does not match, sending nothing', async () => {
    renderPage();
    await fill('seedpass1', 'longenough1', 'longenough2');
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('changes the password, clears the must-change flag and goes to the scout page', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, {
        ...user,
        must_change_password: false,
        disabled_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
      }),
    );
    renderPage();
    await fill('seedpass1', 'longenough1');
    expect(await screen.findByText('the scout page')).toBeInTheDocument();
    expect((await session.current())?.user.must_change_password).toBe(false);
    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, string>;
    expect(sent).toEqual({ current_password: 'seedpass1', new_password: 'longenough1' });
  });

  it("shows the server's message for a wrong current password, and keeps the session", async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, { error: { code: 'invalid', message: 'the current password is not right' } }),
    );
    renderPage();
    await fill('nope', 'longenough1');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The current password is not right.',
    );
    expect(document.body).not.toHaveTextContent('invalid');
    expect(await session.token()).toBe('token-abc');
  });

  it('keeps the session on a 403', async () => {
    fetchMock.mockResolvedValueOnce(
      json(403, { error: { code: 'forbidden', message: 'disabled' } }),
    );
    renderPage();
    await fill('seedpass1', 'longenough1');
    expect(await screen.findByRole('alert')).toHaveTextContent(/disabled\. ask an admin/i);
    expect(await session.token()).toBe('token-abc');
  });

  it('sends an expired session to sign in again', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'sign in again' } }),
    );
    renderPage();
    await fill('seedpass1', 'longenough1');
    expect(await screen.findByText('the login page')).toBeInTheDocument();
    expect((await session.current())?.expired).toBe(true);
  });
});
