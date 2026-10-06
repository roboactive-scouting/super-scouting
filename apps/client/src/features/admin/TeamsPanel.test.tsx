import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TeamsPanel } from './TeamsPanel';

const teams = [
  { id: 't-1', number: 2096, name: 'ROBACTIVE' },
  { id: 't-2', number: 1577, name: 'Steampunk' },
];

const rpcFor = (roster = ['t-1']) => ({
  call: vi.fn(async (name: string) => {
    if (name === 'listTeams') return { items: teams, next_cursor: null };
    if (name === 'listEventRoster')
      return { items: roster.map((id) => ({ team_id: id })), next_cursor: null };
    return {};
  }),
});

describe('TeamsPanel', () => {
  it('marks which teams are on this event roster', async () => {
    render(<TeamsPanel eventId="ev-1" rpc={rpcFor()} />);
    expect(await screen.findByRole('checkbox', { name: /2096 ROBACTIVE/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /1577 Steampunk/ })).not.toBeChecked();
  });

  it('sends the whole roster when a team is added', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<TeamsPanel eventId="ev-1" rpc={rpc} />);
    await user.click(await screen.findByRole('checkbox', { name: /1577 Steampunk/ }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('setEventRoster', {
        event_id: 'ev-1',
        team_ids: ['t-1', 't-2'],
      }),
    );
  });

  it('creates a team with a number and a name', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<TeamsPanel eventId="ev-1" rpc={rpc} />);
    await user.type(await screen.findByLabelText(/team number/i), '5987');
    await user.type(screen.getByLabelText(/team name/i), 'Galaxia');
    await user.click(screen.getByRole('button', { name: /add team/i }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('createTeam', { number: 5987, name: 'Galaxia' }),
    );
  });

  it('says that a team number is permanent and only the name can change', async () => {
    render(<TeamsPanel eventId="ev-1" rpc={rpcFor()} />);
    expect(await screen.findByText(/number is permanent/i)).toBeInTheDocument();
  });
});
