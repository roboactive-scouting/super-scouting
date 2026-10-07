import { StrictMode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Role } from '@frc/shared';
import { RpcError } from '@/data/rpc';
import { ManagePage } from './ManagePage';

type Call = Mock<(name: string, input?: unknown) => Promise<unknown>>;

/** Mounts the page under the outlet context it reads its user from (as under the shell). */
function renderWithCall(role: Role, call: Call, strict = false) {
  const user = {
    id: 'u-1',
    username: 'seed_user',
    full_name: 'Seed User',
    role,
    must_change_password: false,
  };
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Outlet context={{ user, expired: false, eventId: null }} />,
      children: [{ index: true, element: <ManagePage rpc={{ call }} /> }],
    },
    { path: '/scout', element: <p>Scout page</p> },
  ]);
  const tree = <RouterProvider router={router} />;
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return router;
}

const S26 = {
  id: 's-26',
  year: 2026,
  game_name: 'REBUILT',
  field_image_path: 'seasons/2026/field.webp',
};
const S25 = {
  id: 's-25',
  year: 2025,
  game_name: 'REEFSCAPE',
  field_image_path: 'seasons/2026/field.webp',
};
const EVENTS = [
  { id: 'e-1', season_id: 's-26', name: 'District #1 · Haifa', sort_order: 1 },
  { id: 'e-3', season_id: 's-26', name: 'District #3 · Tel Aviv', sort_order: 2 },
];
const ROSTER = [
  { team_id: 't-1', number: 1574, name: 'MisCar' },
  { team_id: 't-2', number: 1690, name: 'Orbit' },
];
const MATCHES = [1, 2, 3].map((n) => ({
  id: `m-${n}`,
  event_id: 'e-3',
  match_type: 'qualification',
  number: n,
  slots: [],
}));

/** A season with two events, District #3 the default, two teams and three matches. */
function fullCall(): Call {
  return vi.fn(async (name: string, input?: unknown) => {
    const body = (input ?? {}) as Record<string, unknown>;
    if (name === 'listSeasons') return { items: [S25, S26], next_cursor: null };
    if (name === 'getActiveContext') return { active_season_id: 's-26', active_event_id: 'e-3' };
    if (name === 'listEvents') {
      return { items: body.season_id === 's-26' ? EVENTS : [], next_cursor: null };
    }
    if (name === 'listEventRoster') return { items: body.event_id === 'e-3' ? ROSTER : [] };
    if (name === 'listMatches') {
      return { items: body.event_id === 'e-3' ? MATCHES : [], next_cursor: null };
    }
    if (name === 'listTeams') return { items: [], next_cursor: null };
    return undefined;
  });
}

function emptyCall(): Call {
  return vi.fn(async (name: string) => {
    if (name === 'listSeasons') return { items: [], next_cursor: null };
    if (name === 'getActiveContext') return { active_season_id: null, active_event_id: null };
    return {};
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ManagePage', () => {
  it('shows the three tabs, with the roster and match counts', async () => {
    renderWithCall('admin', fullCall());
    expect(await screen.findByRole('tab', { name: 'Competitions' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Teams & roster 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Matches 3' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Season and event management',
    );
  });

  it('names the event being worked on, and the picker changes it', async () => {
    const call = fullCall();
    const user = userEvent.setup();
    renderWithCall('admin', call);
    await user.click(await screen.findByRole('tab', { name: /Teams & roster/ }));
    expect(await screen.findByText(/Working on/)).toHaveTextContent(
      'Working on District #3 · Tel Aviv (default) · 2026',
    );
    await user.selectOptions(screen.getByLabelText('Event'), 'e-1');
    expect(screen.getByText(/Working on/)).toHaveTextContent(
      'Working on District #1 · Haifa · 2026',
    );
    await waitFor(() => expect(call).toHaveBeenCalledWith('listEventRoster', { event_id: 'e-1' }));
    expect(await screen.findByRole('tab', { name: 'Teams & roster 0' })).toBeInTheDocument();
  });

  it('loads each list once, however often the tabs change', async () => {
    const call = fullCall();
    const user = userEvent.setup();
    renderWithCall('admin', call);
    await screen.findByRole('tab', { name: 'Matches 3' });
    for (const tab of [/Teams/, /Matches/, /Competitions/, /Teams/]) {
      await user.click(screen.getByRole('tab', { name: tab }));
    }
    for (const name of ['listSeasons', 'listEvents', 'listEventRoster', 'listMatches']) {
      expect(call.mock.calls.filter(([n]) => n === name)).toHaveLength(1);
    }
  });

  it('a roster change on its tab updates the tab count', async () => {
    const call = fullCall();
    const user = userEvent.setup();
    renderWithCall('admin', call);
    await user.click(await screen.findByRole('tab', { name: 'Teams & roster 2' }));
    await user.click(
      await screen.findByRole('button', { name: 'Remove 1574 MisCar from the roster' }),
    );
    expect(screen.getByRole('tab', { name: 'Teams & roster 1' })).toBeInTheDocument();
  });

  it.each(['scouter', 'lead'] as const)(
    'shows the not-permitted state to a %s, and makes no request',
    async (role) => {
      const call = emptyCall();
      renderWithCall(role, call);
      expect(
        await screen.findByText(/only an admin can manage seasons and events/i),
      ).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(call).not.toHaveBeenCalled();
    },
  );
});

// Review finding (task 1.20): an empty install's first season must reach the other tabs
// without a reload — under StrictMode too (its setup → cleanup → setup once broke this).
describe.each([false, true])('ManagePage on an empty install (StrictMode: %s)', (strict) => {
  it('picks up a season created on Competitions at once', async () => {
    let seasons: unknown[] = [];
    const call: Call = vi.fn(async (name: string, input?: unknown) => {
      if (name === 'listSeasons') return { items: seasons, next_cursor: null };
      if (name === 'getActiveContext') return { active_season_id: null, active_event_id: null };
      if (name === 'createSeason') {
        const created = { id: 's-new', ...(input as object) };
        seasons = [created];
        return created;
      }
      if (name === 'listEvents') return { items: [], next_cursor: null };
      return {};
    });
    const user = userEvent.setup();
    renderWithCall('admin', call, strict);

    await user.click(await screen.findByRole('tab', { name: /Teams & roster/ }));
    expect(await screen.findByText(/create a season first/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Competitions' }));
    await user.click(await screen.findByRole('button', { name: 'New season' }));
    await user.type(screen.getByLabelText('Year'), '2026');
    await user.type(screen.getByLabelText('Game name'), 'CRESCENDO');
    await user.type(screen.getByLabelText('Game image path'), 'seasons/2026/field.webp');
    await user.click(screen.getByRole('button', { name: 'Create season' }));

    await waitFor(() => expect(call).toHaveBeenCalledWith('listEvents', { season_id: 's-new' }));
    await user.click(screen.getByRole('tab', { name: /Teams & roster/ }));
    expect(await screen.findByText(/create an event first/i)).toBeInTheDocument();
    expect(screen.queryByText(/create a season first/i)).not.toBeInTheDocument();
  });
});

// Branch review, finding 6: events asked for season X must never land once season Y is
// chosen, or the Roster and Matches tabs would edit an event of the other season.
describe('ManagePage and a stale events answer', () => {
  it('drops season X’s events once season Y is chosen', async () => {
    const eventsOf: Record<string, unknown[]> = {
      's-26': [{ id: 'ex-1', season_id: 's-26', name: 'Week 1', sort_order: 1 }],
      's-25': [
        { id: 'ey-1', season_id: 's-25', name: 'Champs', sort_order: 1 },
        { id: 'ey-2', season_id: 's-25', name: 'Offseason', sort_order: 2 },
      ],
    };
    const heldX: Array<() => void> = [];
    const call: Call = vi.fn(async (name: string, input?: unknown) => {
      if (name === 'listSeasons') return { items: [S26, S25], next_cursor: null };
      if (name === 'getActiveContext') return { active_season_id: 's-26', active_event_id: 'ex-1' };
      if (name === 'listEvents') {
        const seasonId = (input as { season_id: string }).season_id;
        const answer = { items: eventsOf[seasonId] ?? [], next_cursor: null };
        if (seasonId === 's-26') return new Promise((done) => heldX.push(() => done(answer)));
        return answer;
      }
      if (name === 'listEventRoster') return { items: [] };
      if (name === 'listTeams' || name === 'listMatches') return { items: [], next_cursor: null };
      return {};
    });
    const user = userEvent.setup();
    renderWithCall('admin', call);

    await waitFor(() => expect(heldX).toHaveLength(1));
    await user.click(await screen.findByRole('button', { name: /^2025/ }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('listEvents', { season_id: 's-25' }));
    await act(async () => {
      for (const release of heldX) release();
    });

    await user.click(screen.getByRole('tab', { name: /Matches/ }));
    expect(await screen.findByLabelText('Event')).toHaveValue('ey-1');
    expect(screen.queryByRole('option', { name: 'Week 1' })).not.toBeInTheDocument();
  });

  it('drops a deleted event and season in place, and works on the default again (RB.20)', async () => {
    const call = fullCall();
    const listed = call.getMockImplementation()!;
    call.mockImplementation(async (name, input) => {
      if (name !== 'deleteEvent' && name !== 'deleteSeason') return listed(name, input);
      const dryRun = (input as { dry_run?: boolean }).dry_run === true;
      return { deleted: !dryRun, events: 1, matches: 0, entries: 0, forms: 0 };
    });
    const user = userEvent.setup();
    renderWithCall('admin', call);
    await user.click(await screen.findByRole('tab', { name: /Teams & roster/ }));
    await user.selectOptions(await screen.findByLabelText('Event'), 'e-1');
    await user.click(screen.getByRole('tab', { name: 'Competitions' }));
    await user.click(screen.getByRole('button', { name: 'Rename District #1 · Haifa' }));
    await user.click(screen.getByRole('button', { name: 'Delete District #1 · Haifa' }));
    await user.type(await screen.findByLabelText(/Type District #1/), 'District #1 · Haifa');
    await user.click(screen.getByRole('button', { name: 'Delete District #1 · Haifa for good' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'District #1 · Haifa' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Teams & roster/ }));
    expect(await screen.findByText(/Working on/)).toHaveTextContent(
      'Working on District #3 · Tel Aviv (default) · 2026',
    );

    await user.click(screen.getByRole('tab', { name: 'Competitions' }));
    await user.click(screen.getByRole('button', { name: /^2025/ }));
    await user.click(screen.getByRole('button', { name: 'Edit season' }));
    await user.click(screen.getByRole('button', { name: 'Delete 2025' }));
    await user.type(await screen.findByLabelText(/Type 2025/), '2025');
    await user.click(screen.getByRole('button', { name: 'Delete 2025 for good' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^2025/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: '2026 — REBUILT' })).toBeInTheDocument();
    expect(call.mock.calls.filter(([n]) => n === 'listSeasons')).toHaveLength(1);
  });
});

describe('ManagePage while offline', () => {
  it('says it needs a connection at once, and makes no request', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const call = emptyCall();
    renderWithCall('admin', call);
    expect(
      await screen.findByText(
        /managing seasons, events, rosters and matches needs a connection\. this page loads by itself when the connection returns\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it('loads by itself when the browser fires online', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const call = emptyCall();
    renderWithCall('admin', call);
    await screen.findByText(/needs a connection/i);

    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByRole('tab', { name: 'Competitions' })).toBeInTheDocument();
    await waitFor(() => expect(call).toHaveBeenCalledWith('listSeasons', {}));
  });

  it('keeps the page and an open form, with what was typed, when the connection drops', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const call = emptyCall();
    const user = userEvent.setup();
    renderWithCall('admin', call);
    await user.click(await screen.findByRole('button', { name: 'New season' }));
    await user.type(screen.getByLabelText('Game name'), 'CRESC');
    const requests = call.mock.calls.length;

    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(
      await screen.findByText('No connection — changes cannot be saved until it returns.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Game name')).toHaveValue('CRESC');
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(call.mock.calls.length).toBe(requests);
  });
});

// A request that failed is not "no seasons": never "Create a season first".
describe.each(['listSeasons', 'getActiveContext'])('ManagePage when %s fails', (failing) => {
  it('shows the failure on every tab, never "Create a season first"', async () => {
    const call: Call = vi.fn(async (name: string) => {
      if (name === failing) throw new Error('the database is unwell');
      if (name === 'listSeasons') return { items: [], next_cursor: null };
      return { active_season_id: null, active_event_id: null };
    });
    const user = userEvent.setup();
    renderWithCall('admin', call);
    expect(await screen.findByText(/the database is unwell/i)).toBeInTheDocument();
    for (const tab of [/Teams & roster/, /Matches/]) {
      await user.click(screen.getByRole('tab', { name: tab }));
      expect(await screen.findByText(/the database is unwell/i)).toBeInTheDocument();
      expect(screen.queryByText(/create a season first/i)).not.toBeInTheDocument();
    }
  });

  it('shows the connection state for an unanswered request, and Try again recovers', async () => {
    let down = true;
    const call: Call = vi.fn(async (name: string) => {
      if (down && name === failing) throw new RpcError('offline', 'could not reach the server', 0);
      if (name === 'listSeasons') return { items: [S26], next_cursor: null };
      if (name === 'getActiveContext') return { active_season_id: 's-26', active_event_id: null };
      if (name === 'listEvents') return { items: [], next_cursor: null };
      return {};
    });
    const user = userEvent.setup();
    renderWithCall('admin', call);
    expect(await screen.findByText(/this needs the server/i)).toBeInTheDocument();

    down = false;
    await user.click(screen.getByRole('button', { name: /try again/i }));
    const events = await screen.findByRole('region', { name: 'Events' });
    expect(within(events).getByRole('button', { name: '+ New event' })).toBeInTheDocument();
  });
});

// RB.17 fix 2: "Not saved" line-ups belong to the page, next to the matches they were typed
// into — a tab change keeps them, and nothing drops them without asking.
describe('ManagePage with a line-up that could not be saved', () => {
  const MANAGE_UNREACHABLE =
    'Managing seasons, events, rosters and matches needs a connection — try again when this device is online.';

  /** fullCall, except that no line-up save reaches the server. */
  function offlineSaves(): Call {
    const base = fullCall();
    return vi.fn(async (name: string, input?: unknown) => {
      if (name === 'setMatchTeams') throw new RpcError('unreachable', 'offline', 0, false);
      return base(name, input);
    });
  }

  /** Matches tab, then 1574 typed into Q1 Red 1 and saved while the server is out of reach. */
  async function typeUnsavedQ1(call: Call) {
    const user = userEvent.setup();
    const router = renderWithCall('admin', call);
    await user.click(await screen.findByRole('tab', { name: 'Matches 3' }));
    await user.type(await screen.findByRole('combobox', { name: 'Q1 Red 1' }), '1574');
    await user.tab();
    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Q1' })).toHaveAttribute('aria-invalid', 'true'),
    );
    return { user, router };
  }

  function expectQ1NotSaved() {
    const q1 = screen.getByRole('group', { name: 'Q1' });
    expect(within(q1).getByText('Not saved')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Q1 Red 1' })).toHaveValue('1574');
    expect(screen.getByRole('alert')).toHaveTextContent(MANAGE_UNREACHABLE);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  }

  it('keeps "Not saved", the line and Try again across a tab change', async () => {
    const { user } = await typeUnsavedQ1(offlineSaves());
    await user.click(screen.getByRole('tab', { name: /Teams & roster/ }));
    await user.click(screen.getByRole('tab', { name: /Matches/ }));
    expectQ1NotSaved();
  });

  it('asks before an event switch drops them; Stay keeps the event and the line-up', async () => {
    const call = offlineSaves();
    const { user } = await typeUnsavedQ1(call);
    await user.selectOptions(screen.getByLabelText('Event'), 'e-1');
    const confirm = screen.getByRole('dialog', { name: 'Leave without saving?' });
    expect(confirm).toHaveTextContent(
      '1 match line-up was not saved. Switching competition drops them.',
    );
    expect(within(confirm).getByRole('button', { name: 'Stay' })).toHaveFocus();
    await user.click(within(confirm).getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Event')).toHaveValue('e-3');
    expect(call).not.toHaveBeenCalledWith('listMatches', { event_id: 'e-1' });
    expectQ1NotSaved();
  });

  it('Switch anyway changes the event and drops the "Not saved" line-ups', async () => {
    const call = offlineSaves();
    const { user } = await typeUnsavedQ1(call);
    await user.selectOptions(screen.getByLabelText('Event'), 'e-1');
    await user.click(screen.getByRole('button', { name: 'Switch anyway' }));
    expect(screen.getByText(/Working on/)).toHaveTextContent('Working on District #1 · Haifa');
    await waitFor(() => expect(call).toHaveBeenCalledWith('listMatches', { event_id: 'e-1' }));
    expect(await screen.findByRole('tab', { name: 'Matches 0' })).toBeInTheDocument();
    expect(screen.queryByText(MANAGE_UNREACHABLE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();

    await user.selectOptions(screen.getByLabelText('Event'), 'e-3');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks before choosing another season on Competitions', async () => {
    const call = offlineSaves();
    const { user } = await typeUnsavedQ1(call);
    await user.click(screen.getByRole('tab', { name: 'Competitions' }));
    await user.click(await screen.findByRole('button', { name: /^2025/ }));
    expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(call).not.toHaveBeenCalledWith('listEvents', { season_id: 's-25' });
  });

  it('asks before leaving the page; Stay keeps it, Leave anyway goes', async () => {
    const { user, router } = await typeUnsavedQ1(offlineSaves());
    await act(async () => {
      await router.navigate('/scout');
    });
    const confirm = screen.getByRole('dialog', { name: 'Leave without saving?' });
    expect(confirm).toHaveTextContent(
      '1 match line-up was not saved. Leaving this page drops them.',
    );
    await user.click(within(confirm).getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe('/');
    expectQ1NotSaved();

    await act(async () => {
      await router.navigate('/scout');
    });
    await user.click(screen.getByRole('button', { name: 'Leave anyway' }));
    expect(await screen.findByText('Scout page')).toBeInTheDocument();
  });
});
