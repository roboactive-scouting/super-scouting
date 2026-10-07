import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@frc/shared';
import { RpcError } from '@/data/rpc';
import { ManageRoute } from './ManageRoute';
import {
  Q10_PARTIAL,
  Q7_ONE_EMPTY,
  Q8_WITH_7845,
  REGISTRY,
  ROSTER_22,
  T6230,
  tid,
} from './matchFixtures';

const realMatchMedia = window.matchMedia;

/** The phone view is a lazy chunk: its first load (cold transform) can pass a second. */
const LAZY = { timeout: 5000 };

function setWidth(px: number) {
  window.matchMedia = ((query: string) => ({
    matches: px >= 1024,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

const PRACTICE = { ...Q7_ONE_EMPTY, id: 'm-p1', match_type: 'practice' as const, number: 1 };

/** The default event's practice match, Q7, Q8 and Q10; every change goes through. */
async function answer(name: string, input?: unknown): Promise<unknown> {
  if (name === 'getActiveContext') return { active_season_id: 's-1', active_event_id: 'ev-1' };
  if (name === 'listEvents')
    return { items: [{ id: 'ev-1', name: 'District #3 · Tel Aviv' }], next_cursor: null };
  if (name === 'listEventRoster') return { items: ROSTER_22 };
  if (name === 'listMatches')
    return { items: [PRACTICE, Q7_ONE_EMPTY, Q8_WITH_7845, Q10_PARTIAL], next_cursor: null };
  if (name === 'listTeams') return { items: REGISTRY, next_cursor: null };
  if (name === 'createMatch') return { created: 3, items: [] };
  if (name === 'setMatchTeams') return undefined;
  if (name === 'updateMatch') return { ...Q10_PARTIAL, ...(input as object) };
  return undefined;
}

function renderManageRoute({ role, call }: { role: Role; call?: ReturnType<typeof vi.fn> }) {
  const rpc = call ?? vi.fn(answer);
  const user = {
    id: 'u-1',
    username: 'tamar.m',
    full_name: 'Tamar M',
    role,
    must_change_password: false,
  };
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Outlet context={{ user, expired: false, eventId: null }} />,
      children: [{ index: true, element: <ManageRoute rpc={{ call: rpc }} /> }],
    },
  ]);
  render(<RouterProvider router={router} />);
  return rpc;
}

describe('ManageRoute', () => {
  it('a phone admin gets the matches view, not "This needs a computer"', async () => {
    setWidth(375);
    renderManageRoute({ role: 'admin' });
    expect(await screen.findByRole('heading', { name: 'Matches' }, LAZY)).toBeInTheDocument();
    expect(screen.queryByText('This needs a computer')).toBeNull();
    expect(screen.getByText('Seasons, events and the roster need a computer.')).toBeInTheDocument();
    expect(await screen.findByText('District #3 · Tel Aviv')).toBeInTheDocument();
  });

  it('lists the chosen type with "N empty" and "off roster" under the match number', async () => {
    setWidth(375);
    renderManageRoute({ role: 'admin' });
    const q10 = await screen.findByRole('button', { name: /^Q10/ }, LAZY);
    expect(q10).toHaveTextContent('4 empty');
    expect(screen.getByRole('button', { name: /^Q8/ })).toHaveTextContent('off roster');
    expect(screen.queryByRole('button', { name: /^P1/ })).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Practice' }));
    expect(screen.getByRole('button', { name: /^P1/ })).toBeInTheDocument();
  });

  it('edits a match in the sheet: typed stations and the number go on Save changes', async () => {
    setWidth(375);
    const call = renderManageRoute({ role: 'admin' });
    await userEvent.click(await screen.findByRole('button', { name: /^Q10/ }, LAZY));
    const sheet = screen.getByRole('dialog', { name: 'Edit Q10' });
    await userEvent.type(within(sheet).getByRole('combobox', { name: 'Red 3' }), '62');
    expect(within(sheet).getByText('2 on the roster')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('option', { name: /6230 Team Koi/ }));
    expect(call).not.toHaveBeenCalledWith('setMatchTeams', expect.anything());
    await userEvent.clear(within(sheet).getByLabelText('Match number'));
    await userEvent.type(within(sheet).getByLabelText('Match number'), '11');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    expect(call).toHaveBeenCalledWith('updateMatch', { match_id: Q10_PARTIAL.id, number: 11 });
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('setMatchTeams', {
        match_id: Q10_PARTIAL.id,
        slots: [
          { alliance: 'red', station: 1, team_id: tid(5951) },
          { alliance: 'red', station: 2, team_id: tid(1937) },
          { alliance: 'red', station: 3, team_id: T6230 },
        ],
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Save changes stops while a station holds a number not on the roster', async () => {
    setWidth(375);
    const call = renderManageRoute({ role: 'admin' });
    await userEvent.click(await screen.findByRole('button', { name: /^Q10/ }, LAZY));
    const sheet = screen.getByRole('dialog', { name: 'Edit Q10' });
    const red3 = within(sheet).getByRole('combobox', { name: 'Red 3' });
    await userEvent.type(red3, '99');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent("99 is not on this event's roster");
    expect(red3).toHaveValue('99');
    expect(screen.getByRole('dialog', { name: 'Edit Q10' })).toBeInTheDocument();
    expect(call).not.toHaveBeenCalledWith('setMatchTeams', expect.anything());
    expect(call).not.toHaveBeenCalledWith('updateMatch', expect.anything());
  });

  it('a partial number with one suggestion is taken when Save changes is tapped', async () => {
    setWidth(375);
    const call = renderManageRoute({ role: 'admin' });
    await userEvent.click(await screen.findByRole('button', { name: /^Q10/ }, LAZY));
    const sheet = screen.getByRole('dialog', { name: 'Edit Q10' });
    await userEvent.type(within(sheet).getByRole('combobox', { name: 'Red 3' }), '673');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('setMatchTeams', {
        match_id: Q10_PARTIAL.id,
        slots: [
          { alliance: 'red', station: 1, team_id: tid(5951) },
          { alliance: 'red', station: 2, team_id: tid(1937) },
          { alliance: 'red', station: 3, team_id: tid(6738) },
        ],
      }),
    );
  });

  it("Delete match in the sheet opens today's confirmation", async () => {
    setWidth(375);
    renderManageRoute({ role: 'admin' });
    await userEvent.click(await screen.findByRole('button', { name: /^Q10/ }, LAZY));
    await userEvent.click(screen.getByRole('button', { name: 'Delete match' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete this match?' });
    expect(confirm).toHaveTextContent('Q10');
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(confirm).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('adds matches from the sheet: how many, then Create N matches', async () => {
    setWidth(375);
    const call = renderManageRoute({ role: 'admin' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add matches' }, LAZY));
    const sheet = screen.getByRole('dialog', { name: 'Add matches' });
    await userEvent.type(within(sheet).getByLabelText('How many qualification matches?'), '3');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Create 3 matches' }));
    expect(call).toHaveBeenCalledWith('createMatch', {
      event_id: 'ev-1',
      match_type: 'qualification',
      count: 3,
    });
  });

  it('a "Not saved" match stays on the list, marked, under another match type', async () => {
    setWidth(375);
    renderManageRoute({
      role: 'admin',
      call: vi.fn(async (name: string, input?: unknown) => {
        if (name === 'setMatchTeams') throw new RpcError('unreachable', 'offline', 0, false);
        return answer(name, input);
      }),
    });
    await userEvent.click(await screen.findByRole('button', { name: /^Q10/ }, LAZY));
    const sheet = screen.getByRole('dialog', { name: 'Edit Q10' });
    await userEvent.type(within(sheet).getByRole('combobox', { name: 'Red 3' }), '6230');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Q10/ })).toHaveTextContent('Not saved'),
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Practice' }));
    expect(screen.getByRole('button', { name: /^P1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Q10/ })).toHaveTextContent('Not saved');
    expect(screen.queryByRole('button', { name: /^Q7/ })).toBeNull();
  });

  it('a reload asks while a phone save is on its way, and while it is "Not saved"', async () => {
    setWidth(375);
    const fails: Array<(e: unknown) => void> = [];
    renderManageRoute({
      role: 'admin',
      call: vi.fn(async (name: string, input?: unknown) => {
        if (name === 'setMatchTeams') return new Promise((_, fail) => fails.push(fail));
        return answer(name, input);
      }),
    });
    const reloadPrevented = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    await userEvent.click(await screen.findByRole('button', { name: /^Q10/ }, LAZY));
    expect(reloadPrevented()).toBe(false);
    const sheet = screen.getByRole('dialog', { name: 'Edit Q10' });
    await userEvent.type(within(sheet).getByRole('combobox', { name: 'Red 3' }), '6230');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fails).toHaveLength(1));
    expect(reloadPrevented()).toBe(true);

    fails[0]!(new RpcError('unreachable', 'offline', 0, false));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Q10/ })).toHaveTextContent('Not saved'),
    );
    expect(reloadPrevented()).toBe(true);
  });

  it('the add sheet offers the next free number, and an empty field creates it', async () => {
    setWidth(375);
    const call = renderManageRoute({ role: 'admin' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add matches' }, LAZY));
    const sheet = screen.getByRole('dialog', { name: 'Add matches' });
    expect(within(sheet).getByLabelText('Match number')).toHaveAttribute('placeholder', '11');
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Practice' }));
    expect(within(sheet).getByLabelText('Match number')).toHaveAttribute('placeholder', '2');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Create match' }));
    expect(call).toHaveBeenCalledWith('createMatch', {
      event_id: 'ev-1',
      match_type: 'practice',
      number: 2,
    });
  });

  it('Save changes takes the station being typed in, even when no blur came first', async () => {
    setWidth(375);
    const call = renderManageRoute({ role: 'admin' });
    await userEvent.click(await screen.findByRole('button', { name: /^Q10/ }, LAZY));
    const sheet = screen.getByRole('dialog', { name: 'Edit Q10' });
    const red3 = within(sheet).getByRole('combobox', { name: 'Red 3' });
    await userEvent.type(red3, '6230');
    expect(red3).toHaveFocus();
    // A bare click event: no focus move, so no blur (as iOS Safari may order them).
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('setMatchTeams', {
        match_id: Q10_PARTIAL.id,
        slots: [
          { alliance: 'red', station: 1, team_id: tid(5951) },
          { alliance: 'red', station: 2, team_id: tid(1937) },
          { alliance: 'red', station: 3, team_id: T6230 },
        ],
      }),
    );
  });

  it.each(['scouter', 'lead'] as const)(
    'a phone %s gets the not-permitted state, and no request',
    async (role) => {
      setWidth(375);
      const call = vi.fn();
      renderManageRoute({ role, call });
      expect(
        await screen.findByText(/only an admin can manage seasons and events/i, {}, LAZY),
      ).toBeInTheDocument();
      expect(call).not.toHaveBeenCalled();
    },
  );
});
