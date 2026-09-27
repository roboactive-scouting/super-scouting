import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MatchesPanel } from './MatchesPanel';

const matches = [{ id: 'm-1', event_id: 'ev-1', match_type: 'qualification', number: 1 }];
const roster = [{ team_id: 't-1', number: 2096, name: 'ROBACTIVE' }];

const rpcFor = () => ({
  call: vi.fn(async (name: string) => {
    if (name === 'listMatches') return { items: matches, next_cursor: null };
    if (name === 'listEventRoster') return { items: roster, next_cursor: null };
    if (name === 'deleteMatch')
      throw Object.assign(
        new Error('this match has 6 entries — correct the number or delete the entries first'),
        { code: 'conflict' },
      );
    return {};
  }),
});

describe('MatchesPanel', () => {
  it('creates qualification matches in bulk from a count', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<MatchesPanel eventId="ev-1" rpc={rpc} />);
    await user.clear(await screen.findByLabelText(/how many qualification matches/i));
    await user.type(screen.getByLabelText(/how many qualification matches/i), '60');
    await user.click(screen.getByRole('button', { name: /create matches/i }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('createMatch', {
        event_id: 'ev-1',
        match_type: 'qualification',
        count: 60,
      }),
    );
  });

  it('fills a station from the roster and allows a slot to be left empty', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<MatchesPanel eventId="ev-1" rpc={rpc} />);
    await user.selectOptions(await screen.findByLabelText(/red 1/i), 't-1');
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('setMatchTeams', {
        match_id: 'm-1',
        slots: [{ alliance: 'red', station: 1, team_id: 't-1' }],
      }),
    );
    expect(screen.getByLabelText(/red 2/i)).toHaveValue('');
  });

  it('shows the server message when a match with entries cannot be deleted', async () => {
    const user = userEvent.setup();
    render(<MatchesPanel eventId="ev-1" rpc={rpcFor()} />);
    await user.click(await screen.findByRole('button', { name: /delete match 1/i }));
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/has 6 entries/);
  });

  // Task 1.21 addendum: setMatchTeams replaces the WHOLE slot set, so changing one
  // already-filled match must still send every other filled slot, not just the new one.
  it('sends the full slot set when a second station is filled', async () => {
    const filledMatches = [
      {
        id: 'm-1',
        event_id: 'ev-1',
        match_type: 'qualification',
        number: 1,
        slots: [{ alliance: 'red', station: 1, team_id: 't-1' }],
      },
    ];
    const twoTeamRoster = [
      { team_id: 't-1', number: 2096, name: 'ROBACTIVE' },
      { team_id: 't-2', number: 1577, name: 'Steampunk' },
    ];
    const rpc = {
      call: vi.fn(async (name: string) => {
        if (name === 'listMatches') return { items: filledMatches, next_cursor: null };
        if (name === 'listEventRoster') return { items: twoTeamRoster, next_cursor: null };
        return {};
      }),
    };
    const user = userEvent.setup();
    render(<MatchesPanel eventId="ev-1" rpc={rpc} />);
    await user.selectOptions(await screen.findByLabelText(/blue 2/i), 't-2');
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('setMatchTeams', {
        match_id: 'm-1',
        slots: [
          { alliance: 'red', station: 1, team_id: 't-1' },
          { alliance: 'blue', station: 2, team_id: 't-2' },
        ],
      }),
    );
  });

  // Task 1.21 addendum: a team removed from the roster keeps its match slots; the row must
  // still show and name that team (from the global registry), flagged as off-roster.
  it('shows a slot whose team has since left the roster, flagged', async () => {
    const offRosterMatches = [
      {
        id: 'm-1',
        event_id: 'ev-1',
        match_type: 'qualification',
        number: 1,
        slots: [{ alliance: 'red', station: 1, team_id: 't-9' }],
      },
    ];
    const rpc = {
      call: vi.fn(async (name: string) => {
        if (name === 'listMatches') return { items: offRosterMatches, next_cursor: null };
        if (name === 'listEventRoster') return { items: roster, next_cursor: null };
        if (name === 'listTeams')
          return {
            items: [{ id: 't-9', number: 42, name: 'Ghost', created_at: '', updated_at: '' }],
            next_cursor: null,
          };
        return {};
      }),
    };
    render(<MatchesPanel eventId="ev-1" rpc={rpc} />);
    expect(await screen.findByLabelText(/red 1/i)).toHaveValue('t-9');
    expect(await screen.findByText(/42 is not on this event's roster/i)).toBeInTheDocument();
  });
});
