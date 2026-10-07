import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { RosterRow, TeamRow } from '@frc/shared';
import { RpcError } from '@/data/rpc';
import { RosterPanel } from './RosterPanel';

const T0 = '2026-01-10T08:00:00.000Z';
const team = (number: number, name: string): TeamRow => ({
  id: `t-${number}`,
  number,
  name,
  created_at: T0,
  updated_at: T0,
});
const row = (t: TeamRow): RosterRow => ({ team_id: t.id, number: t.number, name: t.name });

const ROSTER_TEAMS: TeamRow[] = [
  [1574, 'MisCar'],
  [1690, 'Orbit'],
  [1937, 'Elysium'],
  [1943, 'NeatTeam'],
  [2096, 'RobActive'],
  [2231, 'OnyxTronix'],
  [2630, 'Thunderbolts'],
  [3075, 'Ha-Dream Team'],
  [3316, 'D-Bug'],
  [3339, 'BumbleB'],
  [4320, 'The Joker'],
  [4338, 'Falcons'],
  [4590, 'GreenBlitz'],
  [5135, 'Black Unicorns'],
  [5654, 'Phoenix'],
  [5951, 'Tiny Titans'],
  [5987, 'Galaxia'],
  [6230, 'Team Koi'],
  [6738, 'Excalibur'],
  [7039, 'Ultimate'],
  [7112, 'EverGreen'],
  [8175, 'Piece of Mind'],
].map(([n, name]) => team(n as number, name as string));
const ROSTER_ROWS = ROSTER_TEAMS.map(row);
const ROSTER_22 = ROSTER_ROWS;
const OFF = [team(7845, 'Rogue Robotics'), team(8223, 'Mariners')];
const REGISTRY = [...ROSTER_TEAMS, ...OFF].sort((a, b) => a.number - b.number);
const T_NEW = 't-9036';

type Call = Mock<(name: string, input?: unknown) => Promise<unknown>>;

/** The page's side: it owns the roster and the registry, and takes every change. */
function renderRoster({
  rpc,
  roster,
  registry = [],
}: {
  rpc: Call | Mock;
  roster: RosterRow[];
  registry?: TeamRow[];
}) {
  function Harness() {
    const [rows, setRows] = useState(roster);
    const [teams, setTeams] = useState<TeamRow[]>(registry);
    return (
      <RosterPanel
        rpc={{ call: rpc as Call }}
        eventId="ev-1"
        roster={rows}
        onRosterChange={setRows}
        registry={teams}
        registryFailure={null}
        onRegistryChange={setTeams}
        onRetryRegistry={() => undefined}
      />
    );
  }
  render(<Harness />);
}

/** `setEventRoster` answers with the roster it was sent, as the server does. */
function serverLike(fail?: { name: string; error: Error }): Call {
  return vi.fn(async (name: string, input?: unknown) => {
    if (fail && name === fail.name) throw fail.error;
    const body = (input ?? {}) as Record<string, unknown>;
    if (name === 'listTeams') {
      const q = String(body.query ?? '');
      return { items: REGISTRY.filter((t) => String(t.number).startsWith(q)), next_cursor: null };
    }
    if (name === 'setEventRoster') {
      const ids = body.team_ids as string[];
      return { items: REGISTRY.filter((t) => ids.includes(t.id)).map(row) };
    }
    return undefined;
  });
}

const rosterCards = () => {
  const list = screen.getAllByRole('list')[0]!;
  return within(list)
    .getAllByRole('listitem')
    .map((li) => li.textContent);
};

describe('RosterPanel', () => {
  it('adds an unknown team in one step: create, then roster', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'listTeams') return { items: [], next_cursor: null };
      if (name === 'createTeam') return { id: T_NEW, number: 9036, name: 'Cyber Owls' };
      if (name === 'setEventRoster')
        return { items: [...ROSTER_ROWS, { team_id: T_NEW, number: 9036, name: 'Cyber Owls' }] }; // real shape: { items: rosterRow[] } (teams.ts:110)
    });
    renderRoster({ rpc, roster: ROSTER_22 });
    await userEvent.type(
      screen.getByRole('combobox', { name: 'Add a team to the roster' }),
      '9036',
    );
    await userEvent.click(await screen.findByRole('option', { name: /New team 9036/ }));
    await userEvent.type(screen.getByLabelText('Team name'), 'Cyber Owls{Enter}');
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['createTeam', 'setEventRoster']),
    );
    expect(await screen.findByText('Cyber Owls')).toBeInTheDocument();
  });

  it('creates first, then sends the whole roster with the new team', async () => {
    const rpc = vi.fn(async (name: string, _input?: unknown) => {
      if (name === 'listTeams') return { items: [], next_cursor: null };
      if (name === 'createTeam') return { ...team(9036, 'Cyber Owls'), id: T_NEW };
      return undefined;
    });
    renderRoster({ rpc, roster: ROSTER_22.slice(0, 2) });
    await userEvent.type(screen.getByRole('combobox'), '9036');
    await userEvent.click(await screen.findByRole('option', { name: /New team 9036/ }));
    await userEvent.type(screen.getByLabelText('Team name'), 'Cyber Owls{Enter}');
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('setEventRoster', {
        event_id: 'ev-1',
        team_ids: ['t-1574', 't-1690', T_NEW],
      }),
    );
    const names = rpc.mock.calls.map((c) => c[0]);
    expect(names.indexOf('createTeam')).toBeLessThan(names.indexOf('setEventRoster'));
    expect(rpc).toHaveBeenCalledWith('createTeam', { number: 9036, name: 'Cyber Owls' });
  });

  it('suggests registry teams for a typed number, and a pick adds it', async () => {
    const rpc = serverLike();
    renderRoster({ rpc, roster: ROSTER_22, registry: REGISTRY });
    await userEvent.type(screen.getByRole('combobox'), '78');
    await userEvent.click(await screen.findByRole('option', { name: /7845/ }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('setEventRoster', {
        event_id: 'ev-1',
        team_ids: expect.arrayContaining(['t-7845']),
      }),
    );
    expect(rpc).toHaveBeenCalledWith('listTeams', { query: '78' });
    expect(screen.queryByRole('option', { name: /New team/ })).not.toBeInTheDocument();
  });

  it('lists the roster and the registry teams not on it, with counts', () => {
    renderRoster({ rpc: serverLike(), roster: ROSTER_22, registry: REGISTRY });
    expect(screen.getByText(/22 teams · click a name to rename/)).toBeInTheDocument();
    expect(rosterCards()).toHaveLength(22);
    expect(
      screen.getByRole('button', { name: 'Add 7845 Rogue Robotics to the roster' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add 8223 Mariners to the roster' })).toBeVisible();
    expect(screen.getByText('A team number is permanent. Only the name can change.')).toBeVisible();
  });

  it('+ puts a registry team on the roster at once, sending the whole roster', async () => {
    const rpc = serverLike();
    renderRoster({ rpc, roster: ROSTER_22.slice(0, 1), registry: REGISTRY.slice(0, 3) });
    await userEvent.click(screen.getByRole('button', { name: 'Add 1690 Orbit to the roster' }));
    expect(rosterCards()).toHaveLength(2);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('setEventRoster', {
        event_id: 'ev-1',
        team_ids: ['t-1574', 't-1690'],
      }),
    );
  });

  it('× takes a team off, and puts it back when the server refuses', async () => {
    renderRoster({
      rpc: serverLike({ name: 'setEventRoster', error: new Error('the roster changed') }),
      roster: ROSTER_22.slice(0, 2),
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove 1574 MisCar from the roster' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('the roster changed');
    expect(rosterCards()).toHaveLength(2);
  });

  it('renames a team in place: click the name, type, Enter', async () => {
    const rpc = serverLike();
    renderRoster({ rpc, roster: ROSTER_22.slice(0, 2) });
    await userEvent.click(screen.getByRole('button', { name: 'Orbit' }));
    const field = screen.getByLabelText('Team name');
    await userEvent.clear(field);
    await userEvent.type(field, 'Orbit 2{Enter}');
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('updateTeam', { team_id: 't-1690', name: 'Orbit 2' }),
    );
    expect(screen.getByRole('button', { name: 'Orbit 2' })).toBeInTheDocument();
  });

  it('Escape keeps the old name and sends nothing', async () => {
    const rpc = serverLike();
    renderRoster({ rpc, roster: ROSTER_22.slice(0, 2) });
    await userEvent.click(screen.getByRole('button', { name: 'Orbit' }));
    await userEvent.type(screen.getByLabelText('Team name'), 'xyz{Escape}');
    expect(screen.getByRole('button', { name: 'Orbit' })).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('updateTeam', expect.anything());
  });

  it('filters both lists by number or name', async () => {
    renderRoster({ rpc: serverLike(), roster: ROSTER_22, registry: REGISTRY });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter' }), 'phoe');
    expect(rosterCards()).toEqual(['5654Phoenix']);
    expect(screen.queryByRole('button', { name: /Add 7845/ })).not.toBeInTheDocument();
  });

  it("says Manage needs a connection when a change can't reach the server", async () => {
    renderRoster({
      rpc: serverLike({
        name: 'setEventRoster',
        error: new RpcError('offline', 'could not reach the server', 0),
      }),
      roster: ROSTER_22.slice(0, 2),
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove 1574 MisCar from the roster' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Managing seasons, events, rosters and matches needs a connection — try again when this device is online.',
    );
  });
});
