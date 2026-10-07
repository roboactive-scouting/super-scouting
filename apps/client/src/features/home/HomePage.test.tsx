import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@frc/shared';
import { SERVER_UNREACHABLE_LINE } from '@/auth/messages';
import { db, type CachedRow } from '@/data/db';
import type { Rpc } from '@/data/rpc';
import { setStation } from '@/data/station';
import { sessionOverride } from '@/features/context/sessionOverride';
import type { ShellContext } from '@/features/shell/shellContext';
import { HomePage } from './HomePage';

vi.mock('@/config', () => ({
  clientConfig: () => ({
    apiBaseUrl: 'https://api.test',
    deviceWipeCode: 'w',
    appVersion: '1.4.0',
  }),
}));

const EVENT = 'ev-1';
const ME = 'u-1';
const TEAMS = [1574, 2096, 4338, 7112, 5951, 8175];

/** Desktop at 1024 px and wider (lib/useMediaQuery); the stub from ShellLayout.test.tsx. */
function setWidth(width: number) {
  window.matchMedia = ((query: string) => ({
    matches: /min-width: 1024px/.test(query) && width >= 1024,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

/** District #3 · Tel Aviv: Q1–Q10 with full line-ups; Q1 fully scouted, Q2 and Q3 not. */
async function seedHomeDevice() {
  const rows: CachedRow[] = [
    { entity: 'app_settings', id: 'true', active_season_id: 's-1', active_event_id: EVENT },
    { entity: 'seasons', id: 's-1', year: 2026, game_name: 'REBUILT' },
    {
      entity: 'events',
      id: EVENT,
      season_id: 's-1',
      name: 'District #3 · Tel Aviv',
      sort_order: 3,
    },
    { entity: 'events', id: 'ev-2', season_id: 's-1', name: 'Week 3', sort_order: 4 },
    ...TEAMS.map((n) => ({
      entity: 'teams' as const,
      id: `t-${n}`,
      number: n,
      name: n === 5951 ? 'Tiny Titans' : `Team ${n}`,
    })),
  ];
  for (let q = 1; q <= 10; q++) {
    rows.push({
      entity: 'matches',
      id: `m-${q}`,
      event_id: EVENT,
      match_type: 'qualification',
      number: q,
    });
    TEAMS.forEach((n, k) =>
      rows.push({
        entity: 'match_teams',
        id: `mt-${q}-${k}`,
        match_id: `m-${q}`,
        team_id: `t-${n}`,
        alliance: k < 3 ? 'red' : 'blue',
        station: (k % 3) + 1,
      }),
    );
  }
  const entry = (q: number, k: number, scouter: string, at: string): CachedRow => ({
    entity: 'scouting_entries',
    id: `e-${q}-${k}`,
    event_id: EVENT,
    form_kind: 'match',
    match_id: `m-${q}`,
    team_id: `t-${TEAMS[k]}`,
    alliance: k < 3 ? 'red' : 'blue',
    scouter_id: scouter,
    deleted_at: null,
    client_created_at: at,
  });
  for (let k = 0; k < 6; k++) rows.push(entry(1, k, 'u-2', minutesAgo(90)));
  for (let k = 0; k < 5; k++) rows.push(entry(2, k, 'u-2', minutesAgo(60)));
  rows.push(entry(3, 0, ME, minutesAgo(30)), entry(3, 4, ME, minutesAgo(2)));
  // Someone else's newer entry is not "your last entry".
  rows.push(entry(3, 5, 'u-2', minutesAgo(1)));
  await db.rows.bulkPut(rows);
  await setStation('B2');
  await db.meta.put({ key: 'sync.last_success_at', value: '2026-10-07T06:08:00.000Z' });
  await db.outbox.bulkPut(
    [1, 2, 3].map((seq) => ({
      op_id: `op-${seq}`,
      entity: 'scouting_entry',
      row_id: `r-${seq}`,
      action: 'create',
      base_version: null,
      payload: {},
      author_user_id: ME,
      client_created_at: minutesAgo(5),
      client_updated_at: minutesAgo(5),
      seq,
    })) as never,
  );
}

function renderHome({
  role = 'lead',
  rpc,
  ...over
}: { role?: Role; rpc?: Rpc } & Partial<ShellContext> = {}) {
  const context: ShellContext = {
    user: {
      id: ME,
      username: 'noa.levi',
      full_name: 'Noa Levi',
      role,
      must_change_password: false,
    },
    expired: false,
    eventId: EVENT,
    gate: 'fresh',
    ...over,
  };
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Outlet context={context} />,
      children: [{ index: true, element: <HomePage rpc={rpc} /> }],
    },
  ]);
  render(<RouterProvider router={router} />);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  setWidth(375);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => {
  sessionOverride.clear();
  vi.restoreAllMocks();
});

describe('HomePage (Home README, RB.10)', () => {
  it('renders from the device alone — no RPC on load', async () => {
    const rpc = { call: vi.fn() };
    await seedHomeDevice();
    renderHome({ role: 'lead', rpc });
    expect(await screen.findByText('District #3 · Tel Aviv')).toBeInTheDocument();
    expect(await screen.findByText('Blue 2')).toBeInTheDocument();
    expect(await screen.findByText(/3 entries waiting to send/)).toBeInTheDocument();
    expect(rpc.call).not.toHaveBeenCalled();
  });

  it('names the matches missing a robot', async () => {
    await seedHomeDevice();
    setWidth(1440);
    renderHome({ role: 'lead' });
    expect(await screen.findByText('2 matches are missing a robot')).toBeInTheDocument();
    expect(screen.getByText('Q2 · Q3')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /1 All 6 robots, 2 Missing a robot, 7 Not played yet/ }),
    ).toBeInTheDocument();
  });

  it('a phone admin sees Matches but not Users; a scouter sees neither', async () => {
    await seedHomeDevice();
    setWidth(375);
    renderHome({ role: 'admin' });
    expect(await screen.findByRole('link', { name: /Matches/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Users/ })).toBeNull();
  });

  it('a phone scouter sees Entries and Switch scouter only', async () => {
    await seedHomeDevice();
    renderHome({ role: 'scouter' });
    expect(await screen.findByRole('link', { name: /^Entries/ })).toHaveAttribute(
      'href',
      '/entries',
    );
    expect(screen.getByRole('link', { name: /^Switch scouter/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Matches|^Manage|^Users/ })).toBeNull();
  });

  it('a desktop admin sees Manage and Users, marked ADMIN', async () => {
    await seedHomeDevice();
    setWidth(1440);
    renderHome({ role: 'admin' });
    const goTo = await screen.findByRole('region', { name: 'Go to' });
    expect(within(goTo).getByRole('link', { name: /^Manage/ })).toHaveAttribute(
      'href',
      '/admin/manage',
    );
    expect(within(goTo).getByRole('link', { name: /^Users.*ADMIN/ })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    expect(within(goTo).queryByRole('link', { name: /Scout/ })).toBeNull();
  });

  it('loads competitions only when Switch competition is opened', async () => {
    const rpc = { call: vi.fn().mockResolvedValue({ items: [], next_cursor: null }) };
    await seedHomeDevice();
    renderHome({ role: 'lead', rpc });
    expect(rpc.call).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'Switch competition' }));
    expect(rpc.call).toHaveBeenCalled();
  });

  it('shows the desktop tiles: station, waiting to send, your newest entry with Open', async () => {
    await seedHomeDevice();
    setWidth(1440);
    renderHome();
    expect(await screen.findByText('Waiting to send')).toBeInTheDocument();
    expect(await screen.findByText('Q3')).toBeInTheDocument();
    expect(screen.getByText(/2 min ago/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Q3 · 5951' })).toHaveAttribute(
      'href',
      '/entry/m-3/t-5951?alliance=blue',
    );
    expect(await screen.findByText(/· sends when online/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Scout a match' })).toHaveAttribute('href', '/scout');
  });

  it('says everything is sent when nothing waits', async () => {
    await seedHomeDevice();
    await db.outbox.clear();
    renderHome();
    expect(await screen.findByText(/^Everything is sent · last sync/)).toBeInTheDocument();
  });

  it('under a session override: the banner, Back to …, and no Scout (SPEC-FINAL 6.3)', async () => {
    await seedHomeDevice();
    sessionOverride.set('ev-2', 'Week 3');
    renderHome();
    expect(await screen.findByRole('heading', { level: 1, name: 'Week 3' })).toBeInTheDocument();
    expect(await screen.findByText('Looking at Week 3 for this session.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Scout a match' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back to District #3 · Tel Aviv' }));
    expect(sessionOverride.get()).toBeNull();
    expect(await screen.findByRole('link', { name: 'Scout a match' })).toBeInTheDocument();
  });

  it('shows the version quietly at the foot', async () => {
    await seedHomeDevice();
    renderHome();
    expect(await screen.findByText('version 1.4.0')).toBeInTheDocument();
  });
});

describe('HomePage before the event is on the device (task 1.17b)', () => {
  it('says there is no competition yet, and offers an admin the way to set one up', () => {
    renderHome({ eventId: null, gate: 'no-event', role: 'admin' });
    expect(
      screen.getByRole('heading', { level: 1, name: 'No competition yet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up a competition' })).toHaveAttribute(
      'href',
      '/admin/manage',
    );
  });

  it('offers a scouter nothing to do when there is no competition yet', () => {
    renderHome({ eventId: null, gate: 'no-event', role: 'scouter' });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('says the server did not answer when an online device has not loaded the event', () => {
    renderHome({ eventId: null, gate: 'blocked' });
    expect(screen.getByText(SERVER_UNREACHABLE_LINE)).toBeInTheDocument();
  });

  it('says a connection is needed once when an offline device has not loaded the event', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderHome({ eventId: null, gate: 'blocked' });
    expect(screen.getByText(/needs a connection once/i)).toBeInTheDocument();
  });

  it('says so while the competition loads onto the device', () => {
    renderHome({ gate: 'loading' });
    expect(
      screen.getByRole('heading', { name: 'Loading the competition onto this device' }),
    ).toBeInTheDocument();
  });

  it('shows a busy skeleton, and no wrong claim, while the shell is still resolving', () => {
    renderHome({ eventId: null, gate: 'resolving' });
    expect(screen.getByRole('status', { name: 'Checking the competition' })).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
