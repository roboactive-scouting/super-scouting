import bcrypt from 'bcryptjs';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Operation } from '@frc/shared';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { NO_CACHED_ACCOUNTS_LINE } from './offlineLogin';
import { pendingCredential } from './pendingCredential';
import { session } from './session';
import { SwitchScouter } from './SwitchScouter';

vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

const DANA = '00000000-0000-4000-8000-00000000da4a';
const NOA = '00000000-0000-4000-8000-0000000000a0';
const dana = {
  id: DANA,
  username: 'dana',
  full_name: 'Dana Levi',
  role: 'scouter' as const,
  must_change_password: false,
};
const noa = {
  id: NOA,
  username: 'noa',
  full_name: 'נועה כהן',
  role: 'scouter' as const,
  must_change_password: false,
};

const danaHash = bcrypt.hashSync('dana-pass', 10);
const noaHash = bcrypt.hashSync('noa-pass', 10);
const gilHash = bcrypt.hashSync('gil-pass', 10);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const danaOp: Operation = {
  op_id: 'op-dana',
  entity: 'scouting_entry',
  row_id: 'row-dana',
  action: 'create',
  base_version: null,
  payload: { id: 'row-dana', scouter_id: DANA },
  author_user_id: DANA,
  client_created_at: '2026-09-24T10:00:00.000Z',
  client_updated_at: '2026-09-24T10:00:00.000Z',
  seq: 1,
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  await db.delete();
  await db.open();
  pendingCredential.clear();
  fetchMock.mockReset();
  // No connection unless a test says otherwise.
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetchMock);
  await db.rows.bulkPut([
    { entity: 'users', ...dana, password_hash: danaHash, disabled_at: null },
    { entity: 'users', ...noa, password_hash: noaHash, disabled_at: null },
    {
      entity: 'users',
      id: 'u-gil',
      username: 'gil',
      full_name: 'Gil Disabled',
      role: 'scouter',
      password_hash: gilHash,
      disabled_at: '2026-01-01T00:00:00.000Z',
    },
  ]);
  await session.signIn(dana, 'tok-dana');
  await db.outbox.put(danaOp);
  await db.syncState.put({
    row_id: 'row-dana',
    sync_state: 'pending',
    acked_at: null,
    origin: 'local',
  });
  await db.drafts.put({ key: 'fv:m:t', row_id: '', payload: { x: 1 }, updated_at: 'x' });
  await db.practiceDrafts.put({ key: 'practice', payload: { y: 1 }, row_id: '', updated_at: 'x' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderSwitch() {
  return render(
    <MemoryRouter initialEntries={['/switch-scouter']}>
      <Routes>
        <Route path="/switch-scouter" element={<SwitchScouter />} />
        <Route path="/" element={<p>the scout page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function switchTo(name: RegExp, password: string) {
  const u = userEvent.setup();
  const picker = await screen.findByRole('combobox', { name: 'Scouter' });
  await u.selectOptions(picker, screen.getByRole('option', { name }));
  await u.type(await screen.findByLabelText(/^Password for/), password);
  await u.click(screen.getByRole('button', { name: 'Switch scouter' }));
}

describe('switch scouter (SPEC-FINAL 7.3, 7.5)', () => {
  it('lists every cached, non-disabled user by full name and username', async () => {
    renderSwitch();
    const picker = await screen.findByRole('combobox', { name: 'Scouter' });
    const options = within(picker)
      .getAllByRole('option')
      .filter((o) => !(o as HTMLOptionElement).disabled);
    expect(options.map((o) => o.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Dana Levi.*dana/),
        expect.stringMatching(/נועה כהן.*noa/),
      ]),
    );
    expect(options).toHaveLength(2);
    expect(screen.queryByRole('option', { name: /Gil Disabled/ })).not.toBeInTheDocument();
    for (const option of options) expect(option).toHaveAttribute('dir', 'auto');
    expect(picker).toHaveClass('tap-target');
  });

  it("asks for the chosen user's own password", async () => {
    renderSwitch();
    const u = userEvent.setup();
    expect(screen.queryByLabelText(/^Password for/)).not.toBeInTheDocument();
    await u.selectOptions(
      await screen.findByRole('combobox', { name: 'Scouter' }),
      screen.getByRole('option', { name: /noa/ }),
    );
    const field = await screen.findByLabelText('Password for נועה כהן');
    expect(field).toHaveAttribute('type', 'password');
  });

  it('switches with the cached hash offline, without touching the outbox, the dataset or entry drafts', async () => {
    renderSwitch();
    await switchTo(/noa/, 'noa-pass');
    expect(await screen.findByText('the scout page')).toBeInTheDocument();

    const current = await session.current();
    expect(current?.user.id).toBe(NOA);
    expect(current?.user.full_name).toBe('נועה כהן');
    expect(current?.token).toBeNull();
    expect(current?.offline).toBe(true);

    // The previous scouter's unsynced op keeps HER author, untouched.
    const queued = await pending(10);
    expect(queued).toEqual([danaOp]);
    expect(await db.rows.where('entity').equals('users').count()).toBe(3);
    expect(await db.drafts.count()).toBe(1);
    // Session-scoped practice drafts go, as with sign-out.
    expect(await db.practiceDrafts.count()).toBe(0);
    // And the new scouter's password replaces any held one, in memory only.
    expect(pendingCredential.get()).toEqual({ username: 'noa', password: 'noa-pass' });
  });

  it('tries the server first and takes its token when it answers', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(json(200, { token: 'tok-noa', user: noa }));
    pendingCredential.set({ username: 'dana', password: 'dana-pass' });
    renderSwitch();
    await switchTo(/noa/, 'noa-pass');
    expect(await screen.findByText('the scout page')).toBeInTheDocument();
    expect(await session.token()).toBe('tok-noa');
    expect((await session.current())?.user.id).toBe(NOA);
    expect(pendingCredential.get()).toBeNull();
    expect(await pending(10)).toEqual([danaOp]);
  });

  it('never falls back on a definitive 401 — the previous scouter stays signed in', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'unauthenticated', message: 'no match' } }),
    );
    renderSwitch();
    // The cached hash WOULD match: a reset password must not open the device.
    await switchTo(/noa/, 'noa-pass');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That username and password do not match.',
    );
    expect((await session.current())?.user.id).toBe(DANA);
    expect(await session.token()).toBe('tok-dana');
    expect(await db.practiceDrafts.count()).toBe(1);
  });

  it('refuses a wrong password offline, and keeps the previous scouter', async () => {
    renderSwitch();
    await switchTo(/noa/, 'not-her-password');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That username and password do not match.',
    );
    expect(document.body).not.toHaveTextContent('not-her-password');
    expect((await session.current())?.user.id).toBe(DANA);
    expect(pendingCredential.get()).toBeNull();
  });

  it('asks for a password before trying anything', async () => {
    renderSwitch();
    const u = userEvent.setup();
    await u.selectOptions(
      await screen.findByRole('combobox', { name: 'Scouter' }),
      screen.getByRole('option', { name: /noa/ }),
    );
    await u.click(screen.getByRole('button', { name: 'Switch scouter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the password.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so plainly when the device has no cached accounts', async () => {
    await db.rows.clear();
    renderSwitch();
    expect(await screen.findByText(NO_CACHED_ACCOUNTS_LINE)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('offers a way back without switching', async () => {
    renderSwitch();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('link', { name: 'Cancel' }));
    expect(await screen.findByText('the scout page')).toBeInTheDocument();
    await waitFor(async () => expect((await session.current())?.user.id).toBe(DANA));
  });
});
