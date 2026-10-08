import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MatchRow, RosterRow } from '@frc/shared';
import { MatchesPanel } from './MatchesPanel';
import { useMatchSaves } from './useMatchSaves';
import {
  Q10_PARTIAL,
  Q8_WITH_7845,
  Q9_FULL,
  REGISTRY,
  ROSTER_22,
  T6230,
  tid,
} from './matchFixtures';

type Call = ReturnType<typeof vi.fn>;

/** The Matches tab as ManagePage holds it: the page owns the lists, the panel reports changes. */
function Harness({
  rpc,
  matches,
  roster,
}: {
  rpc: Call;
  matches: MatchRow[];
  roster: RosterRow[];
}) {
  const [m, setM] = useState(matches);
  const [r, setR] = useState(roster);
  const saves = useMatchSaves('ev-1', m);
  return (
    <MatchesPanel
      rpc={{ call: rpc }}
      eventId="ev-1"
      roster={r}
      matches={m}
      onMatchesChange={setM}
      onRosterChange={setR}
      saves={saves}
    />
  );
}

function renderGrid({
  rpc,
  matches,
  roster,
}: {
  rpc: Call;
  matches: MatchRow[];
  roster: RosterRow[];
}) {
  render(<Harness rpc={rpc} matches={matches} roster={roster} />);
}

describe('LineupGrid (typed cells)', () => {
  it('typing a number in a cell and pressing Tab saves the full slot set and moves on', async () => {
    const rpc = vi.fn().mockResolvedValue(undefined);
    renderGrid({ rpc, matches: [Q10_PARTIAL], roster: ROSTER_22 }); // Q10: red1 5951, red2 1937, rest empty
    const red3 = screen.getByRole('combobox', { name: 'Q10 Red 3' });
    await userEvent.type(red3, '6230');
    await userEvent.tab();
    expect(rpc).toHaveBeenCalledWith(
      'setMatchTeams',
      expect.objectContaining({
        match_id: Q10_PARTIAL.id,
        slots: expect.arrayContaining([
          expect.objectContaining({ alliance: 'red', station: 3, team_id: T6230 }),
        ]),
      }),
    );
    expect(screen.getByRole('combobox', { name: 'Q10 Blue 1' })).toHaveFocus();
  });

  it('sends every other filled station with the changed one (setMatchTeams replaces the set)', async () => {
    const rpc = vi.fn().mockResolvedValue(undefined);
    renderGrid({ rpc, matches: [Q10_PARTIAL], roster: ROSTER_22 });
    await userEvent.type(screen.getByRole('combobox', { name: 'Q10 Blue 2' }), '6230{Enter}');
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('setMatchTeams', {
        match_id: Q10_PARTIAL.id,
        slots: [
          { alliance: 'red', station: 1, team_id: tid(5951) },
          { alliance: 'red', station: 2, team_id: tid(1937) },
          { alliance: 'blue', station: 2, team_id: T6230 },
        ],
      }),
    );
    // Enter moved on to the next cell.
    expect(screen.getByRole('combobox', { name: 'Q10 Blue 3' })).toHaveFocus();
  });

  it('suggests roster teams while typing and picks one with the arrow keys and Enter', async () => {
    const rpc = vi.fn().mockResolvedValue(undefined);
    renderGrid({ rpc, matches: [Q10_PARTIAL], roster: ROSTER_22 });
    await userEvent.type(screen.getByRole('combobox', { name: 'Q10 Red 3' }), '62');
    expect(screen.getByRole('option', { name: /6230 Team Koi/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /6238 Iron Eagles/ })).toBeInTheDocument();
    expect(screen.getByText('2 matches')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        'setMatchTeams',
        expect.objectContaining({
          slots: expect.arrayContaining([expect.objectContaining({ team_id: tid(6238) })]),
        }),
      ),
    );
  });

  it('clearing a cell empties that station only', async () => {
    const rpc = vi.fn().mockResolvedValue(undefined);
    renderGrid({ rpc, matches: [Q10_PARTIAL], roster: ROSTER_22 });
    await userEvent.clear(screen.getByRole('combobox', { name: 'Q10 Red 2' }));
    await userEvent.tab();
    expect(rpc).toHaveBeenCalledWith('setMatchTeams', {
      match_id: Q10_PARTIAL.id,
      slots: [{ alliance: 'red', station: 1, team_id: tid(5951) }],
    });
  });

  it('leaving a cell with a partial number takes the highlighted suggestion (Tab)', async () => {
    const rpc = vi.fn().mockResolvedValue(undefined);
    renderGrid({ rpc, matches: [Q10_PARTIAL], roster: ROSTER_22 });
    await userEvent.type(screen.getByRole('combobox', { name: 'Q10 Red 3' }), '62'); // 6230, 6238
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await userEvent.tab();
    expect(rpc).toHaveBeenCalledWith('setMatchTeams', {
      match_id: Q10_PARTIAL.id,
      slots: [
        { alliance: 'red', station: 1, team_id: tid(5951) },
        { alliance: 'red', station: 2, team_id: tid(1937) },
        { alliance: 'red', station: 3, team_id: tid(6238) },
      ],
    });
  });

  it('tapping away from a partial number with one suggestion takes that team', async () => {
    const rpc = vi.fn().mockResolvedValue(undefined);
    renderGrid({ rpc, matches: [Q10_PARTIAL], roster: ROSTER_22 });
    const red3 = screen.getByRole('combobox', { name: 'Q10 Red 3' });
    await userEvent.type(red3, '673'); // only 6738
    await userEvent.click(screen.getByText('Q10'));
    expect(rpc).toHaveBeenCalledWith('setMatchTeams', {
      match_id: Q10_PARTIAL.id,
      slots: [
        { alliance: 'red', station: 1, team_id: tid(5951) },
        { alliance: 'red', station: 2, team_id: tid(1937) },
        { alliance: 'red', station: 3, team_id: tid(6738) },
      ],
    });
    expect(red3).toHaveValue('6738');
  });

  it('refuses a number that is not on the roster, sends nothing and keeps the cell', async () => {
    const rpc = vi.fn().mockResolvedValue(undefined);
    renderGrid({ rpc, matches: [Q10_PARTIAL], roster: ROSTER_22 });
    const red3 = screen.getByRole('combobox', { name: 'Q10 Red 3' });
    await userEvent.type(red3, '9999');
    await userEvent.tab();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "9999 is not on this event's roster",
    );
    expect(rpc).not.toHaveBeenCalledWith('setMatchTeams', expect.anything());
    expect(red3).toHaveValue('');
  });

  it('shows names, an off-roster team as "Not on roster", and the row number', async () => {
    const rpc = vi.fn(async (name: string) =>
      name === 'listTeams' ? { items: REGISTRY, next_cursor: null } : undefined,
    );
    renderGrid({ rpc, matches: [Q8_WITH_7845, Q9_FULL], roster: ROSTER_22 });
    expect(screen.getByRole('combobox', { name: 'Q9 Red 1' })).toHaveValue('5654');
    expect(screen.getAllByText('Phoenix').length).toBeGreaterThan(0);
    // The slot carries only the id: its number comes from the registry.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Q8 Red 2' })).toHaveValue('7845'),
    );
    expect(screen.getByText('Not on roster')).toBeInTheDocument();
  });

  it('a second change made while the first is still sending goes out after it, with both', async () => {
    let release!: () => void;
    const rpc = vi.fn(
      (name: string, _input?: unknown) =>
        new Promise((done) => {
          if (name === 'setMatchTeams' && !release) release = () => done(undefined);
          else done(undefined);
        }),
    );
    renderGrid({ rpc, matches: [Q10_PARTIAL], roster: ROSTER_22 });
    await userEvent.type(screen.getByRole('combobox', { name: 'Q10 Red 3' }), '6230');
    await userEvent.tab(); // now in Blue 1: not held, even though Q10 is still saving
    await userEvent.type(screen.getByRole('combobox', { name: 'Q10 Blue 1' }), '1574');
    await userEvent.tab();
    expect(rpc.mock.calls.filter((c) => c[0] === 'setMatchTeams')).toHaveLength(1);
    release();
    await waitFor(() =>
      expect(rpc.mock.calls.filter((c) => c[0] === 'setMatchTeams')).toHaveLength(2),
    );
    expect(rpc.mock.calls.at(-1)?.[1]).toEqual({
      match_id: Q10_PARTIAL.id,
      slots: [
        { alliance: 'red', station: 1, team_id: tid(5951) },
        { alliance: 'red', station: 2, team_id: tid(1937) },
        { alliance: 'red', station: 3, team_id: T6230 },
        { alliance: 'blue', station: 1, team_id: tid(1574) },
      ],
    });
  });
});
