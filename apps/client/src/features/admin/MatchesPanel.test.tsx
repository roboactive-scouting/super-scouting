import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatchRow, RosterRow } from '@frc/shared';
import { RpcError } from '@/data/rpc';
import { MANAGE_UNREACHABLE } from './adminMessages';
import { MatchesPanel } from './MatchesPanel';
import { useMatchSaves } from './useMatchSaves';
import {
  Q10_PARTIAL,
  Q7_ONE_EMPTY,
  Q8_WITH_7845,
  qual,
  REGISTRY,
  ROSTER_22,
  T6230,
  T7845,
  tid,
} from './matchFixtures';

type Call = (name: string, input?: unknown) => Promise<unknown>;

/** What the page holds after each report, so a test can read it back. */
const seen: { matches: MatchRow[]; roster: RosterRow[] } = { matches: [], roster: [] };

function Harness({
  call,
  matches,
  roster,
}: {
  call: Call;
  matches: MatchRow[];
  roster: RosterRow[];
}) {
  const [m, setM] = useState(matches);
  const [r, setR] = useState(roster);
  const saves = useMatchSaves('ev-1', m);
  seen.matches = m;
  seen.roster = r;
  return (
    <MatchesPanel
      rpc={{ call }}
      eventId="ev-1"
      roster={r}
      matches={m}
      onMatchesChange={setM}
      onRosterChange={setR}
      saves={saves}
    />
  );
}

function renderPanel(call: Call, matches: MatchRow[] = [Q7_ONE_EMPTY], roster = ROSTER_22) {
  const spy = vi.fn(call);
  render(<Harness call={spy} matches={matches} roster={roster} />);
  return spy;
}

const unreachableError = () => new RpcError('unreachable', 'offline', 0, false);

describe('MatchesPanel', () => {
  it('creates qualification matches in bulk from a count and adds them to the list', async () => {
    const call = renderPanel(async (name) =>
      name === 'createMatch' ? { created: 2, items: [qual(1, []), qual(2, [])] } : undefined,
    );
    await userEvent.type(screen.getByLabelText('How many qualification matches?'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Create matches' }));
    expect(call).toHaveBeenCalledWith('createMatch', {
      event_id: 'ev-1',
      match_type: 'qualification',
      count: 2,
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Created 2 qualification matches.');
    expect(seen.matches.map((m) => m.number)).toEqual([1, 2, 7]);
  });

  it('the type select drives the single create, and the number field suggests the next one', async () => {
    const call = renderPanel(async () => ({ created: 1, items: [] }));
    expect(screen.getByLabelText('Match number')).toHaveAttribute('placeholder', '8');
    await userEvent.selectOptions(screen.getByLabelText('Match type'), 'playoff');
    expect(screen.getByLabelText('Match number')).toHaveAttribute('placeholder', '1');
    await userEvent.type(screen.getByLabelText('Match number'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Create match' }));
    expect(call).toHaveBeenCalledWith('createMatch', {
      event_id: 'ev-1',
      match_type: 'playoff',
      number: 3,
    });
  });

  it("filters the grid by match type with the phone's control; the toolbar's type follows", async () => {
    const practice = { ...Q7_ONE_EMPTY, id: 'm-p1', match_type: 'practice' as const, number: 1 };
    const call = renderPanel(async () => undefined, [practice, Q7_ONE_EMPTY, Q10_PARTIAL]);
    const filter = screen.getByRole('radiogroup', { name: 'Show matches' });
    expect(within(filter).getByRole('radio', { name: 'Qualification' })).toBeChecked();
    expect(screen.getByRole('group', { name: 'Q7' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'P1' })).toBeNull();

    await userEvent.click(within(filter).getByRole('radio', { name: 'Practice' }));
    expect(screen.getByRole('group', { name: 'P1' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Q7' })).toBeNull();
    expect(screen.getByLabelText('Match type')).toHaveValue('practice');

    // The toolbar's select moves the filter too, so what it creates is in sight.
    await userEvent.selectOptions(screen.getByLabelText('Match type'), 'playoff');
    expect(within(filter).getByRole('radio', { name: 'Playoff' })).toBeChecked();
    expect(screen.getByText('No matches yet.')).toBeInTheDocument();

    // Typing into a filtered grid still saves that match's line-up.
    await userEvent.click(within(filter).getByRole('radio', { name: 'Qualification' }));
    await userEvent.type(screen.getByRole('combobox', { name: 'Q10 Red 3' }), '6230');
    await userEvent.tab();
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        'setMatchTeams',
        expect.objectContaining({ match_id: Q10_PARTIAL.id }),
      ),
    );
    expect(seen.matches).toHaveLength(3);
  });

  it('adds an off-roster team to the roster from the problem summary', async () => {
    const call = renderPanel(
      async (name) => {
        if (name === 'listTeams') return { items: REGISTRY, next_cursor: null };
        if (name === 'setEventRoster')
          return {
            items: [...ROSTER_22, { team_id: T7845, number: 7845, name: 'Rogue Robotics' }],
          };
        return undefined;
      },
      [Q8_WITH_7845],
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Add 7845 to the roster' }));
    expect(call).toHaveBeenCalledWith('setEventRoster', {
      event_id: 'ev-1',
      team_ids: [...ROSTER_22.map((r) => r.team_id), T7845],
    });
    await waitFor(() => expect(screen.queryByText('Not on roster')).toBeNull());
    expect(seen.roster).toHaveLength(23);
  });

  it('edits a match type and number from ✎', async () => {
    const call = renderPanel(async (name, input) =>
      name === 'updateMatch' ? { ...Q7_ONE_EMPTY, ...(input as object), number: 17 } : undefined,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit match 7 (qualification)' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Q7' });
    await userEvent.clear(within(dialog).getByLabelText('Match number'));
    await userEvent.type(within(dialog).getByLabelText('Match number'), '17');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(call).toHaveBeenCalledWith('updateMatch', { match_id: Q7_ONE_EMPTY.id, number: 17 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('group', { name: 'Q17' })).toBeInTheDocument();
  });

  it('shows the server message when a match with entries cannot be deleted', async () => {
    renderPanel(async (name) => {
      if (name === 'deleteMatch')
        throw new Error(
          'this match has 6 entries — correct the number or delete the entries first',
        );
      return undefined;
    });
    await userEvent.click(screen.getByRole('button', { name: 'Delete match 7 (qualification)' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this match?' });
    expect(dialog).toHaveTextContent('Q7');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/has 6 entries/);
  });

  it('deletes a match and drops it from the list', async () => {
    renderPanel(async () => ({ id: Q7_ONE_EMPTY.id, deleted: true }), [Q7_ONE_EMPTY, Q10_PARTIAL]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete match 7 (qualification)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(seen.matches.map((m) => m.number)).toEqual([10]));
  });

  it('a refused line-up save says why and re-reads that match from the server', async () => {
    renderPanel(
      async (name) => {
        if (name === 'setMatchTeams') throw new Error('a team can fill only one slot in a match');
        if (name === 'listMatches') return { items: [Q10_PARTIAL], next_cursor: null };
        return undefined;
      },
      [Q10_PARTIAL],
    );
    await userEvent.type(screen.getByRole('combobox', { name: 'Q10 Red 3' }), '6230');
    await userEvent.tab();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'a team can fill only one slot in a match',
    );
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Q10 Red 3' })).toHaveValue(''),
    );
  });

  it('an empty match number creates the next free one, as its placeholder says', async () => {
    const call = renderPanel(async () => ({ created: 1, items: [qual(8, [])] }));
    await userEvent.click(screen.getByRole('button', { name: 'Create match' }));
    expect(call).toHaveBeenCalledWith('createMatch', {
      event_id: 'ev-1',
      match_type: 'qualification',
      number: 8,
    });
  });

  it('retries a failed registry read on the next successful save, then offers the add link', async () => {
    let registryUp = false;
    const call = renderPanel(
      async (name) => {
        if (name === 'listTeams') {
          if (!registryUp) throw unreachableError();
          return { items: REGISTRY, next_cursor: null };
        }
        return undefined;
      },
      [Q8_WITH_7845, Q10_PARTIAL],
    );
    expect(
      await screen.findByText("A team in Q8 is not on this event's roster"),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /to the roster/ })).toBeNull();
    registryUp = true;
    await userEvent.type(screen.getByRole('combobox', { name: 'Q10 Red 3' }), '6230');
    await userEvent.tab();
    expect(
      await screen.findByRole('button', { name: 'Add 7845 to the roster' }),
    ).toBeInTheDocument();
    expect(call.mock.calls.filter((c) => c[0] === 'listTeams')).toHaveLength(2);
  });

  describe('a save the server cannot be reached for', () => {
    const Q10_RED3 = { name: 'Q10 Red 3' };
    let reachable = false;
    afterEach(() => {
      reachable = false;
    });

    /** Q7 and Q10; Q10's line-up saves fail while unreachable, Q7's always go through. */
    async function renderUnsavedQ10() {
      const call = renderPanel(
        async (name, input) => {
          const id = (input as { match_id?: string } | undefined)?.match_id;
          if (name === 'setMatchTeams' && id === Q10_PARTIAL.id && !reachable)
            throw unreachableError();
          return undefined;
        },
        [Q7_ONE_EMPTY, Q10_PARTIAL],
      );
      await userEvent.type(screen.getByRole('combobox', Q10_RED3), '6230');
      await userEvent.tab();
      const q10 = screen.getByRole('group', { name: 'Q10' });
      await waitFor(() => expect(q10).toHaveAttribute('aria-invalid', 'true'));
      return { call, q10 };
    }
    const sends = (call: ReturnType<typeof renderPanel>) =>
      call.mock.calls.filter((c) => c[0] === 'setMatchTeams');

    it('keeps what was typed, marks the match "Not saved", and the line stays after another match saves', async () => {
      const { call, q10 } = await renderUnsavedQ10();
      expect(within(q10).getByText('Not saved')).toBeInTheDocument();
      expect(screen.getByRole('combobox', Q10_RED3)).toHaveValue('6230');
      expect(screen.getByRole('alert')).toHaveTextContent(MANAGE_UNREACHABLE);

      await userEvent.type(screen.getByRole('combobox', { name: 'Q7 Blue 3' }), '1574');
      await userEvent.tab();
      await waitFor(() => expect(sends(call)).toHaveLength(2));
      await waitFor(() =>
        expect(screen.getByRole('group', { name: 'Q7' })).not.toHaveAttribute('aria-busy'),
      );
      expect(screen.getByRole('alert')).toHaveTextContent(MANAGE_UNREACHABLE);
      expect(q10).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('group', { name: 'Q7' })).not.toHaveAttribute('aria-invalid');
    });

    it("Try again re-sends the match's current line-up and clears the mark", async () => {
      const { call, q10 } = await renderUnsavedQ10();
      reachable = true;
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(q10).not.toHaveAttribute('aria-invalid'));
      expect(sends(call)).toHaveLength(2);
      expect(sends(call).at(-1)?.[1]).toEqual({
        match_id: Q10_PARTIAL.id,
        slots: [
          { alliance: 'red', station: 1, team_id: tid(5951) },
          { alliance: 'red', station: 2, team_id: tid(1937) },
          { alliance: 'red', station: 3, team_id: T6230 },
        ],
      });
      expect(within(q10).queryByText('Not saved')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('deleting a "Not saved" match drops its mark, the line and Try again', async () => {
      await renderUnsavedQ10();
      await userEvent.click(
        screen.getByRole('button', { name: 'Delete match 10 (qualification)' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(seen.matches.map((m) => m.number)).toEqual([7]));
      expect(screen.queryByText(MANAGE_UNREACHABLE)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    it('sends nothing by itself when the browser says the connection is back', async () => {
      const { call, q10 } = await renderUnsavedQ10();
      reachable = true;
      const before = call.mock.calls.length;
      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });
      expect(call.mock.calls).toHaveLength(before);
      expect(q10).toHaveAttribute('aria-invalid', 'true');
    });
  });
});
