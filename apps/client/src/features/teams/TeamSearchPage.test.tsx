import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { RpcError, type Rpc } from '@/data/rpc';
import { sessionOverride } from '@/features/context/sessionOverride';
import { EVENT_ID, SERVER_TEAMS, seedTeamCache } from '@/test/teamSearchFixtures';
import { TeamSearchPage } from './TeamSearchPage';

/*
 * Task 1.51 (SPEC-FINAL 13.2; 23-team-search final, A2). The plan's test predates the design, so
 * it is adapted (DEVIATIONS "Task 1.51"): the whole row is the link (no "Open" button), At this
 * event is the default chip, the jump's button is "<team>: other event", the are-you-sure says
 * Keep <event> / Switch and open, and the offline line is the design's.
 */

const rpcFor = (): Rpc & { call: ReturnType<typeof vi.fn> } => ({
  call: vi.fn(async (name: string) => {
    if (name === 'searchTeams') return SERVER_TEAMS;
    if (name === 'listTeamEvents') {
      return {
        items: [
          {
            id: 'ev-2',
            name: 'Week 3 · Haifa',
            entry_count: 6,
            last_entry_at: '2026-03-04T09:00:00.000Z',
          },
        ],
        next_cursor: null,
      };
    }
    return {};
  }),
});

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<object>('react-router-dom')),
  useNavigate: () => navigate,
}));

const online = vi.spyOn(navigator, 'onLine', 'get');

function renderPage(rpc: Rpc = rpcFor()) {
  return render(
    <MemoryRouter initialEntries={['/teams']}>
      <TeamSearchPage eventId={EVENT_ID} rpc={rpc} />
    </MemoryRouter>,
  );
}

/** The table row of the team whose number is `n`. */
const rowOf = async (n: number) => {
  const number = await screen.findByText(String(n), { selector: 'span' });
  return number.closest('tr') as HTMLElement;
};

beforeEach(async () => {
  navigate.mockClear();
  sessionOverride.clear();
  online.mockReturnValue(true);
  await db.delete();
  await db.open();
});

afterEach(() => {
  sessionOverride.clear();
});

describe('TeamSearchPage (SPEC-FINAL 13.2)', () => {
  it('opens on At this event, then filters as you type, by number and by name', async () => {
    await seedTeamCache();
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('button', { name: /At this event/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await screen.findByRole('link', { name: '2096 ROBACTIVE, team page' });
    // 3339 is elsewhere: not in the default list, offered by the Show all line.
    expect(screen.queryByText('BumbleB')).not.toBeInTheDocument();
    expect(screen.getByText('1 more 2026 team at other events')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/search teams/i), '1577');
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(1));
    expect(screen.getByRole('link', { name: '1577 Steampunk, team page' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/search teams/i));
    await user.type(screen.getByLabelText(/search teams/i), 'galax');
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(1));
    // The matched text is highlighted.
    expect(screen.getByText('Galax', { selector: 'mark' })).toBeInTheDocument();
  });

  it('shows the season, the team count and the event in its head', async () => {
    await seedTeamCache();
    renderPage();
    expect(
      await screen.findByText('2026 season · 4 teams · ranks from District #3 · Tel Aviv'),
    ).toBeInTheDocument();
  });

  it('Show all selects All, so a search never looks empty when the team is elsewhere', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText(/search teams/i), '3339');
    expect(await screen.findByText('1 more team matches at other events')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all ›' }));
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Bumble', { exact: false })).toBeInTheDocument();
  });

  it('shows a rank badge only for teams in the active event', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /^All/ }));
    const inEvent = await rowOf(2096);
    expect(within(inEvent).getByLabelText(/rank 1/i)).toBeInTheDocument();
    const outside = await rowOf(3339);
    expect(within(outside).queryByLabelText(/rank/i)).not.toBeInTheDocument();
    expect(within(outside).getByText('not at this event')).toBeInTheDocument();
  });

  it('shows a medal on the top three and on nobody else', async () => {
    renderPage();
    // ranks 1 and 3 are listed, 9 is not a medal
    expect(await screen.findAllByLabelText(/medal/i)).toHaveLength(2);
    expect(within(await rowOf(5987)).getByLabelText('Rank 9')).toBeInTheDocument();
    expect(within(await rowOf(5987)).queryByLabelText(/medal/i)).not.toBeInTheDocument();
  });

  it('makes the whole row of a team at the event its link to /teams/<id>', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: '2096 ROBACTIVE, team page' });
    expect(link).toHaveAttribute('href', '/teams/t-1');
    // There is no separate open button: the row is the way in.
    expect(screen.queryByRole('button', { name: /open 2096/i })).not.toBeInTheDocument();
  });

  it('offers the events a team competed at for a team outside the active event', async () => {
    const user = userEvent.setup();
    const rpc = rpcFor();
    renderPage(rpc);
    await user.click(await screen.findByRole('button', { name: /^All/ }));
    await user.click(await screen.findByRole('button', { name: '3339 BumbleB: other event' }));
    const pick = await screen.findByRole('dialog', { name: '3339 BumbleB wasn’t at District #3' });
    expect(await within(pick).findByRole('radio', { name: /Week 3 · Haifa/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(pick).getByText('6 entries · Mar 2026')).toBeInTheDocument();
    expect(rpc.call).toHaveBeenCalledWith(
      'listTeamEvents',
      expect.objectContaining({ team_id: 't-4' }),
    );
  });

  it('asks are you sure before switching, and does nothing if the answer is no', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /^All/ }));
    await user.click(await screen.findByRole('button', { name: '3339 BumbleB: other event' }));
    await user.click(await screen.findByRole('radio', { name: /Week 3/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const sure = await screen.findByRole('dialog', { name: 'Switch to another event?' });
    expect(sure).toHaveTextContent('Switch this session to Week 3 · Haifa and open 3339 BumbleB?');
    expect(sure).toHaveTextContent('Scouting still saves to');
    const buttons = within(sure).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Keep District #3', 'Switch and open']);
    await user.click(within(sure).getByRole('button', { name: 'Keep District #3' }));
    expect(sessionOverride.get()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sets a session-only override on yes and lands on the team page', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /^All/ }));
    await user.click(await screen.findByRole('button', { name: '3339 BumbleB: other event' }));
    await user.click(await screen.findByRole('radio', { name: /Week 3/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Switch and open' }));
    expect(sessionOverride.get()).toBe('ev-2');
    expect(sessionOverride.name()).toBe('Week 3 · Haifa');
    expect(navigate).toHaveBeenCalledWith('/teams/t-4');
  });

  it('asks the server for the overridden event while an override is set', async () => {
    sessionOverride.set('ev-2', 'Week 3 · Haifa');
    const rpc = rpcFor();
    renderPage(rpc);
    await screen.findByRole('link', { name: '2096 ROBACTIVE, team page' });
    expect(rpc.call).toHaveBeenCalledWith(
      'searchTeams',
      expect.objectContaining({ event_id: 'ev-2', filter: 'all' }),
    );
  });

  it('disables the cross-event path entirely while offline, says why, and asks the server nothing', async () => {
    online.mockReturnValue(false);
    await seedTeamCache();
    const user = userEvent.setup();
    const rpc = rpcFor();
    renderPage(rpc);
    await user.click(await screen.findByRole('button', { name: /^All/ }));
    const other = await screen.findByRole('button', { name: '3339 BumbleB: other event' });
    expect(other).toBeDisabled();
    await user.click(other);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Other events need a connection; teams at District #3 still open\./),
    ).toBeInTheDocument();
    expect(rpc.call).not.toHaveBeenCalledWith('listTeamEvents', expect.anything());
    expect(rpc.call).not.toHaveBeenCalled();
  });

  it('builds the list from the device offline, with the shared ranks', async () => {
    online.mockReturnValue(false);
    await seedTeamCache();
    renderPage();
    const links = await screen.findAllByRole('link');
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual([
      '2096 ROBACTIVE, team page',
      '1577 Steampunk, team page',
      '5987 Galaxia, team page',
      '4590 GreenBlitz, team page',
      '1690 Orbit, team page',
    ]);
    expect(within(await rowOf(5987)).getByLabelText('Rank 3, medal')).toBeInTheDocument();
    expect(within(await rowOf(4590)).getByLabelText('Rank 4')).toBeInTheDocument();
    expect(within(await rowOf(1690)).getByText('not ranked yet')).toBeInTheDocument();
    // Teams at this event still open offline.
    expect(screen.getByRole('link', { name: '1690 Orbit, team page' })).toHaveAttribute(
      'href',
      '/teams/t-5',
    );
  });

  it('falls back to the device when the server does not answer and no override is set', async () => {
    await seedTeamCache();
    const rpc: Rpc = {
      call: vi.fn(async () => {
        throw new RpcError('offline', 'could not reach the server', 0);
      }),
    };
    renderPage(rpc);
    expect(
      await screen.findByRole('link', { name: '4590 GreenBlitz, team page' }),
    ).toBeInTheDocument();
  });

  it('under an override with no connection, says the event needs the server and offers the way back', async () => {
    online.mockReturnValue(false);
    await seedTeamCache();
    sessionOverride.set('ev-2', 'Week 3 · Haifa');
    const user = userEvent.setup();
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'This needs the server' }),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Back to District #3' }));
    expect(sessionOverride.get()).toBeNull();
  });
});

describe('TeamSearchPage on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists link rows, our team marked "· us", and names a team’s other events', async () => {
    const user = userEvent.setup();
    renderPage();
    const us = await screen.findByRole('link', { name: '2096 ROBACTIVE, team page' });
    expect(us).toHaveTextContent('· us');
    expect(us).toHaveTextContent('11 entries here');
    await user.click(screen.getByRole('button', { name: /^All/ }));
    expect(await screen.findByText('Week 3 · not at this event')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
