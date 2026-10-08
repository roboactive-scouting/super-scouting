import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type CachedRow } from '@/data/db';
import { pending } from '@/data/outbox';
import { getStation, setStation } from '@/data/station';
import { SelectRobotPage } from './SelectRobotPage';

const navigate = vi.fn();
const location = { state: null as unknown };
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate, useLocation: () => location }));

const props = { eventId: 'ev-1', author: { id: 'u-1', role: 'scouter' as const } };

function renderScout(author: { id: string; role: 'scouter' | 'lead' } = props.author) {
  return render(<SelectRobotPage eventId="ev-1" author={author} />);
}

/** Q39 with a full line-up (5654 Phoenix at Blue 2) and 3316 on the roster but not in it. */
async function seedEventWithLineup() {
  const lineup = [
    ['red', 1, 1690, 'Orbit'],
    ['red', 2, 3075, 'Ha-Dream Team'],
    ['red', 3, 6230, 'Team Koi'],
    ['blue', 1, 2231, 'OnyxTronix'],
    ['blue', 2, 5654, 'Phoenix'],
    ['blue', 3, 7039, 'Ultimate'],
  ] as const;
  await db.rows.bulkPut([
    { entity: 'matches', id: 'm-39', event_id: 'ev-1', match_type: 'qualification', number: 39 },
    { entity: 'teams', id: 't-3316', number: 3316, name: 'D-Bug' },
    { entity: 'event_teams', id: 'et-3316', event_id: 'ev-1', team_id: 't-3316', deleted_at: null },
    ...lineup.flatMap(([alliance, station, number, name]): CachedRow[] => [
      { entity: 'teams', id: `t-${number}`, number, name },
      {
        entity: 'event_teams',
        id: `et-${number}`,
        event_id: 'ev-1',
        team_id: `t-${number}`,
        deleted_at: null,
      },
      {
        entity: 'match_teams',
        id: `mt-${number}`,
        match_id: 'm-39',
        alliance,
        station,
        team_id: `t-${number}`,
      },
    ]),
  ]);
}

const typeMatch = async (user: ReturnType<typeof userEvent.setup>, n: string) =>
  user.type(await screen.findByLabelText('Match number'), n);

async function startWith(user: ReturnType<typeof userEvent.setup>, team: RegExp) {
  await user.click(await screen.findByRole('radio', { name: team }));
  await user.click(screen.getByRole('button', { name: /start entry/i }));
}

beforeEach(async () => {
  navigate.mockClear();
  location.state = null;
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    { entity: 'teams', id: 't-1', number: 118, name: 'Robonauts' },
    { entity: 'teams', id: 't-2', number: 254, name: 'The Cheesy Poofs' },
    { entity: 'teams', id: 't-3', number: 971, name: 'Spartan Robotics' },
    { entity: 'event_teams', id: 'et-1', event_id: 'ev-1', team_id: 't-1', deleted_at: null },
    { entity: 'event_teams', id: 'et-2', event_id: 'ev-1', team_id: 't-2', deleted_at: null },
    { entity: 'event_teams', id: 'et-3', event_id: 'ev-1', team_id: 't-3', deleted_at: null },
    { entity: 'matches', id: 'm-known', event_id: 'ev-1', match_type: 'qualification', number: 5 },
    {
      entity: 'match_teams',
      id: 'mt-1',
      match_id: 'm-known',
      alliance: 'red',
      station: 1,
      team_id: 't-1',
    },
    { entity: 'matches', id: 'm-bare', event_id: 'ev-1', match_type: 'qualification', number: 6 },
  ]);
});

describe('SelectRobotPage: your station and the line-up (Scout README 1–4, 6)', () => {
  it('asks for a station once, then remembers it and preselects that robot', async () => {
    await seedEventWithLineup();
    const user = userEvent.setup();
    renderScout();
    const sheet = await screen.findByRole('dialog', { name: 'Choose your station' });
    await user.click(within(sheet).getByRole('button', { name: 'Blue 2' }));
    await user.click(within(sheet).getByRole('button', { name: 'Use Blue 2' }));
    await waitFor(async () => expect(await getStation()).toBe('B2'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await typeMatch(user, '39');
    expect(await screen.findByRole('radio', { name: /YOUR STATION/ })).toBeChecked();
    expect(screen.getByRole('button', { name: /Start entry · 5654/ })).toBeEnabled();
  });

  it('"Not now" closes the sheet and leaves the station unset', async () => {
    const user = userEvent.setup();
    renderScout();
    const sheet = await screen.findByRole('dialog', { name: 'Choose your station' });
    await user.click(within(sheet).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await getStation()).toBeNull();
  });

  it('does not ask again once a station is set, and "Change" reopens it', async () => {
    await setStation('B2');
    const user = userEvent.setup();
    renderScout();
    await user.click(await screen.findByRole('button', { name: 'Change' }));
    const sheet = screen.getByRole('dialog', { name: 'Choose your station' });
    expect(within(sheet).getByRole('button', { name: 'Blue 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Red 3' }));
    await user.click(within(sheet).getByRole('button', { name: 'Use Red 3' }));
    await waitFor(async () => expect(await getStation()).toBe('R3'));
  });

  it('confirms before scouting a robot that is not your station', async () => {
    await seedEventWithLineup();
    await setStation('B2');
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '39');
    await user.click(await screen.findByRole('radio', { name: /RED 1/ }));
    const ask = screen.getByRole('dialog', { name: /Scout Red 1 instead\?/ });
    expect(ask).toHaveTextContent(
      'Your station is Blue 2. This entry will be for 1690 Orbit on Red 1. Your station stays Blue 2.',
    );
    await user.click(within(ask).getByRole('button', { name: 'Scout Red 1' }));
    expect(screen.getByRole('radio', { name: /RED 1/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Start entry · 1690 Orbit' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/entry/m-39/t-1690?alliance=red'));
    expect(await getStation()).toBe('B2');
  });

  it('"Keep Blue 2" keeps your own robot picked', async () => {
    await seedEventWithLineup();
    await setStation('B2');
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '39');
    await user.click(await screen.findByRole('radio', { name: /RED 1/ }));
    await user.click(screen.getByRole('button', { name: 'Keep Blue 2' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /YOUR STATION/ })).toBeChecked();
  });

  it('"Team not here?" lists the whole roster', async () => {
    await seedEventWithLineup();
    await setStation('B2');
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '39');
    await user.click(await screen.findByRole('button', { name: /Team not here\?/ }));
    await user.type(screen.getByRole('searchbox'), '3316');
    expect(screen.getByRole('radio', { name: /3316/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /5654/ })).not.toBeInTheDocument();
  });

  it('flags a team outside the line-up, and saves nothing about it', async () => {
    await seedEventWithLineup();
    await setStation('B2');
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '39');
    await user.click(await screen.findByRole('button', { name: /Team not here\?/ }));
    expect(screen.getByRole('heading', { name: 'Which team are you watching?' })).toBeVisible();
    expect(screen.getByRole('radio', { name: /Orbit · in this match, Red 1/ })).toBeEnabled();
    await startWith(user, /3316/);
    expect(screen.getByText('Not in line-up')).toBeInTheDocument();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/entry/m-39/t-3316?alliance=blue'));
    expect(await pending(10)).toHaveLength(0);
  });

  it('a line-up team picked from the roster keeps its alliance and is not flagged', async () => {
    await seedEventWithLineup();
    await setStation('B2');
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '39');
    await user.click(await screen.findByRole('button', { name: /Team not here\?/ }));
    await user.click(screen.getByRole('radio', { name: /1690/ }));
    expect(screen.getByRole('radio', { name: 'Red' })).toBeChecked();
    expect(screen.queryByText('Not in line-up')).not.toBeInTheDocument();
  });
});

describe('SelectRobotPage: Team not here? and Start entry stay in reach (UI fix round)', () => {
  it('"Team not here?" is a full-width secondary button that scrolls clear of the pinned bar', async () => {
    await seedEventWithLineup();
    await setStation('B2');
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '39');
    const notHere = await screen.findByRole('button', { name: /Team not here\?/ });
    expect(notHere).toHaveClass('w-full', 'border-control-border', 'min-h-11');
    expect(notHere.className).toContain('scroll-mb-[calc(var(--bottom-bar,0px)+6.5rem)]');
  });

  it('pins Start entry at every width, the desktop one flat on the page background', async () => {
    renderScout();
    const bar = (await screen.findByRole('button', { name: /start entry/i })).parentElement;
    expect(bar).toHaveClass('sticky', 'lg:bg-bg');
    expect(bar?.className).not.toMatch(/lg:static/);
    expect(bar?.closest('main')).toHaveAttribute('data-pinned-foot');
  });
});

describe('SelectRobotPage: a match with no line-up (SPEC-FINAL 8.1, 6.4)', () => {
  beforeEach(() => setStation('R2'));

  it('presets the alliance from the station and offers the searchable roster', async () => {
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '6');
    expect(await screen.findByText(/Q6 has no robots listed on this device/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Red' })).toBeChecked();
    expect(screen.getByRole('button', { name: /start entry/i })).toBeDisabled();
    await user.type(screen.getByRole('searchbox'), 'chees');
    expect(screen.getAllByRole('radio', { name: /^\d/ })).toHaveLength(1);
    await startWith(user, /254/);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/entry/m-bare/t-2?alliance=red'));
    expect(await pending(10)).toHaveLength(0);
  });

  it('shows a notice for an unknown match number and creates it on choosing a robot', async () => {
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '9');
    expect(await screen.findByRole('status')).toHaveTextContent(/not on this device yet/i);

    await user.click(screen.getByRole('radio', { name: 'Blue' }));
    await startWith(user, /118/);

    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
    const [op] = await pending(10);
    if (!op) throw new Error('expected one pending operation');
    expect(op.entity).toBe('match');
    expect(op.action).toBe('create');
    expect(op.payload).toEqual({ event_id: 'ev-1', match_type: 'qualification', number: 9 });

    const localMatches = (await db.rows.where('entity').equals('matches').toArray()).filter(
      (m) => m.number === 9,
    );
    expect(localMatches).toHaveLength(1);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/\/t-1\?alliance=blue$/)),
    );
  });

  it('creates only one match when the same unknown number is chosen twice', async () => {
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '9');
    await startWith(user, /118/);
    // Wait for the page's own render to see the match as known — not just for the write.
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    await startWith(user, /254/);
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
    expect(await pending(10)).toHaveLength(1);
  });

  it('works the whole bare-match-creation flow with navigator.onLine false', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '9');
    await startWith(user, /118/);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(await pending(10)).toHaveLength(1);
  });

  it('attributes a bare match it creates to the signed-in user', async () => {
    const user = userEvent.setup();
    renderScout({ id: 'u-signed-in', role: 'scouter' });
    await typeMatch(user, '77');
    await startWith(user, /118/);
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
    expect((await pending(10))[0]!.author_user_id).toBe('u-signed-in');
  });
});

describe('SelectRobotPage: picks belong to the typed match and station', () => {
  it('forgets an alliance picked for another match when the typed match changes', async () => {
    await seedEventWithLineup();
    await setStation('B2');
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '39');
    await user.click(await screen.findByRole('button', { name: /Team not here\?/ }));
    await user.click(screen.getByRole('radio', { name: /1690/ }));
    expect(screen.getByRole('radio', { name: 'Red' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.clear(screen.getByLabelText('Match number'));
    await user.type(screen.getByLabelText('Match number'), '6');
    expect(await screen.findByText(/Q6 has no robots listed on this device/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Blue' })).toBeChecked();
  });

  it('resets the alliance preset when the station changes', async () => {
    await setStation('B2');
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '6');
    await user.click(await screen.findByRole('radio', { name: 'Red' }));
    expect(screen.getByRole('radio', { name: 'Red' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Change' }));
    const sheet = screen.getByRole('dialog', { name: 'Choose your station' });
    await user.click(within(sheet).getByRole('button', { name: 'Blue 3' }));
    await user.click(within(sheet).getByRole('button', { name: 'Use Blue 3' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Blue' })).toBeChecked());
  });

  it('does not ask again for the robot it already switched to', async () => {
    await seedEventWithLineup();
    await setStation('B2');
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '39');
    await user.click(await screen.findByRole('radio', { name: /RED 1/ }));
    await user.click(
      within(screen.getByRole('dialog', { name: /Scout Red 1 instead\?/ })).getByRole('button', {
        name: 'Scout Red 1',
      }),
    );
    await user.click(screen.getByRole('radio', { name: /RED 1/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /RED 1/ })).toBeChecked();
  });

  it('clears the roster search when the typed match changes', async () => {
    await setStation('R2');
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '6');
    await user.type(await screen.findByRole('searchbox'), 'chees');
    expect(screen.getAllByRole('radio', { name: /^\d/ })).toHaveLength(1);
    await user.clear(screen.getByLabelText('Match number'));
    await user.type(screen.getByLabelText('Match number'), '9');
    expect(await screen.findByRole('searchbox')).toHaveValue('');
    expect(screen.getAllByRole('radio', { name: /^\d/ })).toHaveLength(3);
  });

  it('starts one entry and creates one bare match when Start is tapped twice quickly', async () => {
    await setStation('R2');
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '9');
    await user.click(await screen.findByRole('radio', { name: /118/ }));
    const start = screen.getByRole('button', { name: /start entry/i });
    fireEvent.click(start);
    fireEvent.click(start);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(await pending(10)).toHaveLength(1);
    expect(await db.rows.where('entity').equals('matches').toArray()).toHaveLength(3);
  });
});

describe('SelectRobotPage: the saved banner (SPEC-FINAL 8.1)', () => {
  it('confirms what was saved after a submit, and says it is on this device, not synced', async () => {
    location.state = {
      saved: {
        matchType: 'qualification',
        number: 21,
        matchLabel: 'Q21',
        teamLabel: '118 Robonauts',
        edited: false,
      },
    };
    renderScout();
    const notice = await screen.findByRole('status', { name: /entry saved/i });
    expect(notice).toHaveTextContent('Entry saved on this device');
    expect(notice).toHaveTextContent('Q21 · 118 Robonauts');
    expect(notice).toHaveTextContent(/safe here with no network/);
    expect(notice).not.toHaveTextContent(/synced/i);
  });

  it('offers the next match of the same type after a new entry, with no robot picked (v1.17)', async () => {
    await setStation('R1');
    location.state = {
      saved: {
        matchType: 'practice',
        number: 8,
        matchLabel: 'P8',
        teamLabel: '118 Robonauts',
        edited: false,
      },
    };
    const user = userEvent.setup();
    renderScout();
    const number = await screen.findByLabelText('Match number');
    expect(number).toHaveValue(9);
    expect(screen.getByLabelText('Match type')).toHaveValue('practice');
    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start entry/i })).toBeDisabled();
    // Still editable.
    await user.clear(number);
    await user.type(number, '12');
    expect(number).toHaveValue(12);
  });

  it('fills in no match after an edit', async () => {
    location.state = {
      saved: {
        matchType: 'practice',
        number: 8,
        matchLabel: 'P8',
        teamLabel: '118 Robonauts',
        edited: true,
      },
    };
    renderScout();
    expect(await screen.findByLabelText('Match number')).toHaveValue(null);
    expect(screen.getByLabelText('Match type')).toHaveValue('qualification');
  });

  it('shows no confirmation on an ordinary visit', async () => {
    renderScout();
    await screen.findByLabelText('Match number');
    expect(screen.queryByRole('status', { name: /entry saved/i })).not.toBeInTheDocument();
  });
});

describe('SelectRobotPage: a robot this device already scouted (SPEC-FINAL 8.1, 7.6)', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    entity: 'scouting_entries' as const,
    id: 'e-1',
    event_id: 'ev-1',
    form_kind: 'match',
    form_version_id: 'fv-1',
    match_id: 'm-known',
    team_id: 't-1',
    alliance: 'blue',
    scouter_id: 'u-1',
    robot_status: 'played',
    breakdown_seconds: null,
    data: {},
    client_created_at: new Date().toISOString(),
    deleted_at: null,
    ...over,
  });
  const tile = () => screen.findByRole('radio', { name: /RED 1/ });

  beforeEach(() => setStation('R1'));

  it('opens the existing entry inside the edit window instead of starting a second', async () => {
    await db.rows.put(entry());
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '5');
    expect(await tile()).toHaveTextContent(/Scouted · edit until \d/);
    expect(await tile()).toBeChecked();
    expect(screen.getByText(/You can change that entry until/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start entry/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /edit the existing entry/i }));
    // The entry's own alliance, not the tile's.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/entry/m-known/t-1?alliance=blue'));
    expect(await pending(10)).toHaveLength(0);
  });

  it('shows it as scouted and locked, and not choosable, once the window has passed', async () => {
    await db.rows.put(
      entry({ client_created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString() }),
    );
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '5');
    expect(await tile()).toHaveTextContent('Scouted · locked');
    expect(await tile()).toBeDisabled();
    expect(await tile()).not.toBeChecked();
    expect(screen.getByRole('button', { name: /start entry/i })).toBeDisabled();
  });

  it("treats another scout's cached entry as locked for a scouter", async () => {
    await db.rows.put(entry({ scouter_id: 'u-other' }));
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '5');
    expect(await tile()).toBeDisabled();
  });

  it("lets a lead open any entry, another scout's and an old one alike (SPEC-FINAL 7.6)", async () => {
    await db.rows.put(
      entry({
        scouter_id: 'u-other',
        client_created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      }),
    );
    const user = userEvent.setup();
    renderScout({ id: 'u-lead', role: 'lead' });
    await typeMatch(user, '5');
    expect(await tile()).toBeEnabled();
    expect(await tile()).not.toHaveTextContent(/locked|edit until/);
    await user.click(screen.getByRole('button', { name: /edit the existing entry/i }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/entry/m-known/t-1?alliance=blue'));
  });

  it('only marks the match that entry belongs to', async () => {
    await db.rows.put(entry({ match_id: 'm-other' }));
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '5');
    expect(await tile()).not.toHaveTextContent(/Scouted/);
    expect(screen.getByRole('button', { name: 'Start entry · 118 Robonauts' })).toBeEnabled();
  });

  it('ignores a soft-deleted entry', async () => {
    await db.rows.put(entry({ deleted_at: new Date().toISOString() }));
    const user = userEvent.setup();
    renderScout();
    await typeMatch(user, '5');
    expect(await tile()).not.toHaveTextContent(/Scouted/);
  });
});
