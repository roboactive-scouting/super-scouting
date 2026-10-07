import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { RpcError } from '@/data/rpc';
import { ManagePage } from './ManagePage';

// RB.17 fix 3: a line-up save belongs to the page and to the event it was typed for. It
// outlives a tab change, is counted by every "Leave without saving?" while it is still out,
// and never writes into another event's list.

type Call = Mock<(name: string, input?: unknown) => Promise<unknown>>;

function renderPage(call: Call) {
  const user = {
    id: 'u-1',
    username: 'seed_user',
    full_name: 'Seed User',
    role: 'admin' as const,
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
  render(<RouterProvider router={router} />);
  return router;
}

const S26 = { id: 's-26', year: 2026, game_name: 'REBUILT', field_image_path: 'f.webp' };
const EVENTS = [
  { id: 'e-1', season_id: 's-26', name: 'District #1 · Haifa', sort_order: 1 },
  { id: 'e-3', season_id: 's-26', name: 'District #3 · Tel Aviv', sort_order: 2 },
];
const ROSTER = [
  { team_id: 't-1', number: 1574, name: 'MisCar' },
  { team_id: 't-2', number: 1690, name: 'Orbit' },
];
const match = (eventId: string, n: number) => ({
  id: `${eventId}-m${n}`,
  event_id: eventId,
  match_type: 'qualification',
  number: n,
  slots: [],
});
/** e-3 (the default) holds Q1–Q3, e-1 holds Q41 and Q42. */
const MATCHES: Record<string, unknown[]> = {
  'e-3': [1, 2, 3].map((n) => match('e-3', n)),
  'e-1': [41, 42].map((n) => match('e-1', n)),
};

/** Every line-up save waits until the test answers it; `answers` holds them in order. */
function heldSaves() {
  const answers: Array<(out: unknown) => void> = [];
  const fails: Array<(e: unknown) => void> = [];
  const creates: Array<(out: unknown) => void> = [];
  const call: Call = vi.fn(async (name: string, input?: unknown) => {
    const body = (input ?? {}) as Record<string, unknown>;
    if (name === 'listSeasons') return { items: [S26], next_cursor: null };
    if (name === 'getActiveContext') return { active_season_id: 's-26', active_event_id: 'e-3' };
    if (name === 'listEvents') return { items: EVENTS, next_cursor: null };
    if (name === 'listEventRoster') return { items: ROSTER };
    if (name === 'listMatches') {
      return { items: MATCHES[body.event_id as string] ?? [], next_cursor: null };
    }
    if (name === 'listTeams') return { items: [], next_cursor: null };
    if (name === 'setMatchTeams') {
      return new Promise((done, fail) => {
        answers.push(done);
        fails.push(fail);
      });
    }
    if (name === 'createMatch') return new Promise((done) => creates.push(done));
    return undefined;
  });
  const saves = () => call.mock.calls.filter(([n]) => n === 'setMatchTeams');
  return { call, answers, fails, creates, saves };
}

/** What the server answers for Q1 of e-3 holding these teams in Red 1, Red 2, … */
function q1Row(...teams: string[]) {
  const slots = teams.map((team_id, i) => ({ alliance: 'red', station: i + 1, team_id }));
  return { ...match('e-3', 1), slots };
}

async function typeQ1(user: ReturnType<typeof userEvent.setup>, station: string, text: string) {
  await user.type(await screen.findByRole('combobox', { name: `Q1 ${station}` }), text);
  await user.tab();
}

function reloadPrevented() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ManagePage and a line-up save still on its way', () => {
  it('a save for one event that answers after another event loaded never changes its list', async () => {
    const { call, answers, saves } = heldSaves();
    const user = userEvent.setup();
    renderPage(call);
    await user.click(await screen.findByRole('tab', { name: 'Matches 3' }));
    await typeQ1(user, 'Red 1', '1574');
    await waitFor(() => expect(saves()).toHaveLength(1));

    await user.selectOptions(screen.getByLabelText('Event'), 'e-1');
    await user.click(screen.getByRole('button', { name: 'Switch anyway' }));
    expect(await screen.findByRole('tab', { name: 'Matches 2' })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Q41' })).toBeInTheDocument();

    await act(async () => answers[0]!(q1Row('t-1')));
    expect(screen.getByRole('tab', { name: 'Matches 2' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Q41' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Q1' })).toBeNull();
    expect(screen.queryByText('Not saved')).toBeNull();
  });

  it('a save answered in the same tick the next event’s matches arrive never empties them', async () => {
    const held = heldSaves();
    const lists: Array<() => void> = [];
    const call: Call = vi.fn(async (name: string, input?: unknown) => {
      if (name === 'listMatches' && (input as { event_id?: string }).event_id === 'e-1') {
        await new Promise<void>((done) => lists.push(done));
      }
      return held.call(name, input);
    });
    const user = userEvent.setup();
    renderPage(call);
    await user.click(await screen.findByRole('tab', { name: 'Matches 3' }));
    await typeQ1(user, 'Red 1', '1574');
    await waitFor(() => expect(held.saves()).toHaveLength(1));

    await user.selectOptions(screen.getByLabelText('Event'), 'e-1');
    await user.click(screen.getByRole('button', { name: 'Switch anyway' }));
    await waitFor(() => expect(lists).toHaveLength(1));

    // Both answers land before React renders: e-1's matches first, then e-3's save.
    const tick = () => new Promise((done) => setTimeout(done, 0));
    await act(async () => {
      lists[0]!();
      await tick();
      held.answers[0]!(q1Row('t-1'));
      await tick();
    });
    expect(await screen.findByRole('tab', { name: 'Matches 2' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Q41' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Q42' })).toBeInTheDocument();
  });

  it('a create for one event that answers after another event loaded never adds to its list', async () => {
    const { call, creates } = heldSaves();
    const user = userEvent.setup();
    renderPage(call);
    await user.click(await screen.findByRole('tab', { name: 'Matches 3' }));
    await user.type(screen.getByLabelText('Match number'), '4');
    await user.click(screen.getByRole('button', { name: 'Create match' }));
    await waitFor(() => expect(creates).toHaveLength(1));

    await user.selectOptions(screen.getByLabelText('Event'), 'e-1');
    expect(await screen.findByRole('tab', { name: 'Matches 2' })).toBeInTheDocument();
    await act(async () => creates[0]!({ created: 1, items: [match('e-3', 4)] }));
    expect(screen.getByRole('tab', { name: 'Matches 2' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Q4' })).toBeNull();
  });

  it('asks before an event switch or leaving while a save is still out', async () => {
    const { call, saves } = heldSaves();
    const user = userEvent.setup();
    const router = renderPage(call);
    await user.click(await screen.findByRole('tab', { name: 'Matches 3' }));
    await typeQ1(user, 'Red 1', '1574');
    await waitFor(() => expect(saves()).toHaveLength(1));

    await user.selectOptions(screen.getByLabelText('Event'), 'e-1');
    const confirm = screen.getByRole('dialog', { name: 'Leave without saving?' });
    expect(confirm).toHaveTextContent('Q1');
    expect(confirm).toHaveTextContent('1 match line-up was not saved.');
    await user.click(within(confirm).getByRole('button', { name: 'Stay' }));
    expect(screen.getByLabelText('Event')).toHaveValue('e-3');
    expect(call).not.toHaveBeenCalledWith('listMatches', { event_id: 'e-1' });

    await act(async () => {
      await router.navigate('/scout');
    });
    expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(reloadPrevented()).toBe(true);
  });

  it('a tab change keeps one send queue: the next save waits, and the newest line-up shows', async () => {
    const { call, answers, saves } = heldSaves();
    const user = userEvent.setup();
    renderPage(call);
    await user.click(await screen.findByRole('tab', { name: 'Matches 3' }));
    await typeQ1(user, 'Red 1', '1574');
    await waitFor(() => expect(saves()).toHaveLength(1));

    await user.click(screen.getByRole('tab', { name: /Teams & roster/ }));
    await user.click(screen.getByRole('tab', { name: /Matches/ }));
    expect(screen.getByRole('combobox', { name: 'Q1 Red 1' })).toHaveValue('1574');
    await typeQ1(user, 'Red 2', '1690');
    await act(async () => {});
    expect(saves()).toHaveLength(1);

    await act(async () => answers[0]!(q1Row('t-1')));
    await waitFor(() => expect(saves()).toHaveLength(2));
    expect(saves()[1]![1]).toEqual({
      match_id: 'e-3-m1',
      slots: [
        { alliance: 'red', station: 1, team_id: 't-1' },
        { alliance: 'red', station: 2, team_id: 't-2' },
      ],
    });
    expect(screen.getByRole('combobox', { name: 'Q1 Red 2' })).toHaveValue('1690');

    await act(async () => answers[1]!(q1Row('t-1', 't-2')));
    expect(screen.getByRole('combobox', { name: 'Q1 Red 1' })).toHaveValue('1574');
    expect(screen.getByRole('combobox', { name: 'Q1 Red 2' })).toHaveValue('1690');
    expect(screen.getByRole('group', { name: 'Q1' })).not.toHaveAttribute('aria-busy');
    expect(reloadPrevented()).toBe(false);
  });

  it('a save that comes back unreachable after a tab change keeps the typed line-up', async () => {
    const { call, fails, saves } = heldSaves();
    const user = userEvent.setup();
    renderPage(call);
    await user.click(await screen.findByRole('tab', { name: 'Matches 3' }));
    await typeQ1(user, 'Red 1', '1574');
    await waitFor(() => expect(saves()).toHaveLength(1));
    await user.click(screen.getByRole('tab', { name: /Teams & roster/ }));

    await act(async () => fails[0]!(new RpcError('unreachable', 'offline', 0, false)));
    await user.click(screen.getByRole('tab', { name: /Matches/ }));
    const q1 = screen.getByRole('group', { name: 'Q1' });
    expect(within(q1).getByText('Not saved')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Q1 Red 1' })).toHaveValue('1574');
  });
});

describe('ManagePage when no event is chosen any more', () => {
  it('a new season (no events yet) drops the old event’s "Not saved" rows: leaving does not ask', async () => {
    const call: Call = vi.fn(async (name: string, input?: unknown) => {
      const body = (input ?? {}) as Record<string, unknown>;
      if (name === 'listSeasons') return { items: [S26], next_cursor: null };
      if (name === 'getActiveContext') return { active_season_id: 's-26', active_event_id: 'e-3' };
      if (name === 'listEvents') {
        return { items: body.season_id === 's-26' ? EVENTS : [], next_cursor: null };
      }
      if (name === 'listEventRoster') return { items: ROSTER };
      if (name === 'listMatches') return { items: MATCHES['e-3'], next_cursor: null };
      if (name === 'listTeams') return { items: [], next_cursor: null };
      if (name === 'setMatchTeams') throw new RpcError('unreachable', 'offline', 0, false);
      if (name === 'createSeason') return { id: 's-27', ...(input as object) };
      return undefined;
    });
    const user = userEvent.setup();
    const router = renderPage(call);
    await user.click(await screen.findByRole('tab', { name: 'Matches 3' }));
    await typeQ1(user, 'Red 1', '1574');
    await screen.findByText('Not saved');

    await user.click(screen.getByRole('tab', { name: 'Competitions' }));
    await user.click(await screen.findByRole('button', { name: 'New season' }));
    await user.type(screen.getByLabelText('Year'), '2027');
    await user.type(screen.getByLabelText('Game name'), 'NEXT');
    await user.type(screen.getByLabelText('Game image path'), 'seasons/2027/field.webp');
    await user.click(screen.getByRole('button', { name: 'Create season' }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('listEvents', { season_id: 's-27' }));

    expect(reloadPrevented()).toBe(false);
    await act(async () => {
      await router.navigate('/scout');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('Scout page')).toBeInTheDocument();
  });
});
