import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { RosterRow, TeamRow } from '@frc/shared';
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
const ON = team(1574, 'MisCar');
const OFF = [team(7845, 'Rogue Robotics'), team(8223, 'Mariners')];

type Call = Mock<(name: string, input?: unknown) => Promise<unknown>>;

function renderRoster(rpc: Call, extra: { failed?: boolean; onRetry?: () => void } = {}) {
  function Harness() {
    const [rows, setRows] = useState([row(ON)]);
    const [teams, setTeams] = useState<TeamRow[]>([ON, ...OFF]);
    return (
      <RosterPanel
        rpc={{ call: rpc }}
        eventId="ev-1"
        roster={rows}
        onRosterChange={setRows}
        registry={extra.failed ? null : teams}
        registryFailure={extra.failed ? { unreachable: false, line: 'The teams are down.' } : null}
        onRegistryChange={setTeams}
        onRetryRegistry={extra.onRetry ?? (() => undefined)}
      />
    );
  }
  render(<Harness />);
}

const sent = (rpc: Call, name: string) => rpc.mock.calls.filter((c) => c[0] === name);

describe('RosterPanel failures', () => {
  it('retrying an add after the roster save failed does not create the team twice', async () => {
    let refuse = true;
    const rpc: Call = vi.fn(async (name: string, input?: unknown) => {
      if (name === 'listTeams') return { items: [], next_cursor: null };
      if (name === 'createTeam') return team(9036, 'Cyber Owls');
      if (name === 'setEventRoster') {
        if (refuse) throw new Error('the roster changed');
        const ids = (input as { team_ids: string[] }).team_ids;
        return { items: [ON, team(9036, 'Cyber Owls')].filter((t) => ids.includes(t.id)).map(row) };
      }
      return undefined;
    });
    renderRoster(rpc);
    await userEvent.type(screen.getByRole('combobox'), '9036');
    await userEvent.click(await screen.findByRole('option', { name: /New team 9036/ }));
    await userEvent.type(screen.getByLabelText('Team name'), 'Cyber Owls{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('the roster changed');

    refuse = false;
    await userEvent.click(screen.getByRole('button', { name: 'Add team' }));
    expect(await screen.findByRole('button', { name: 'Cyber Owls' })).toBeInTheDocument();
    expect(sent(rpc, 'createTeam')).toHaveLength(1);
    expect(sent(rpc, 'setEventRoster')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores a second pick while the first save is still in flight', async () => {
    let finish!: (out: unknown) => void;
    const rpc: Call = vi.fn(async (name: string) => {
      if (name === 'listTeams') return { items: OFF, next_cursor: null };
      if (name === 'setEventRoster') return new Promise((resolve) => (finish = resolve));
      return undefined;
    });
    renderRoster(rpc);
    const field = screen.getByRole('combobox');
    await userEvent.type(field, '78');
    await userEvent.click(await screen.findByRole('option', { name: /7845/ }));
    await waitFor(() => expect(sent(rpc, 'setEventRoster')).toHaveLength(1));

    await userEvent.type(field, '82');
    await userEvent.click(await screen.findByRole('option', { name: /8223/ }));
    expect(sent(rpc, 'setEventRoster')).toHaveLength(1);
    await act(async () => finish(undefined));
  });

  it('offers Try again when the registry did not load', async () => {
    const onRetry = vi.fn();
    renderRoster(
      vi.fn(async () => undefined),
      { failed: true, onRetry },
    );
    expect(screen.getByText('The teams are down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
