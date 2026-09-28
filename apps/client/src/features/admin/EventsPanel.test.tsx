import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventsPanel } from './EventsPanel';

const events = [
  { id: 'e-1', season_id: 's-1', name: 'Week 1', sort_order: 1 },
  { id: 'e-2', season_id: 's-1', name: 'Week 3', sort_order: 2 },
];

const rpcFor = () => ({
  call: vi.fn(async (name: string) => {
    if (name === 'listEvents') return { items: events, next_cursor: null };
    if (name === 'getActiveContext') return { active_season_id: 's-1', active_event_id: 'e-1' };
    return {};
  }),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EventsPanel', () => {
  it('lists events in sort_order', async () => {
    render(<EventsPanel seasonId="s-1" rpc={rpcFor()} />);
    const rows = await screen.findAllByRole('row');
    expect(rows[1]).toHaveTextContent('Week 1');
    expect(rows[2]).toHaveTextContent('Week 3');
  });

  it('moves an event down and sends the whole new order', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<EventsPanel seasonId="s-1" rpc={rpc} />);
    await user.click(await screen.findByRole('button', { name: /move week 1 down/i }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('reorderEvents', {
        season_id: 's-1',
        event_ids: ['e-2', 'e-1'],
      }),
    );
  });

  it('says plainly that reordering changes display order only', async () => {
    render(<EventsPanel seasonId="s-1" rpc={rpcFor()} />);
    expect(await screen.findByText(/display order only/i)).toBeInTheDocument();
    expect(screen.getByText(/never re-weights/i)).toBeInTheDocument();
  });

  it('sets the active event', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<EventsPanel seasonId="s-1" rpc={rpc} />);
    await user.click(await screen.findByRole('button', { name: /make week 3 the default/i }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('setActiveEvent', { event_id: 'e-2' }),
    );
  });

  // ---------------------------------------------------------------------------------
  // Beyond the plan (orchestrator addendum items 6 and 7).

  it('disables up on the first row and down on the last row', async () => {
    render(<EventsPanel seasonId="s-1" rpc={rpcFor()} />);
    expect(await screen.findByRole('button', { name: /move week 1 up/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /move week 1 down/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /move week 3 up/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /move week 3 down/i })).toBeDisabled();
  });

  it('creates an event with a name only', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<EventsPanel seasonId="s-1" rpc={rpc} />);
    await user.click(await screen.findByRole('button', { name: /new event/i }));
    await user.type(screen.getByLabelText(/name/i), 'Week 5');
    await user.click(screen.getByRole('button', { name: /create event/i }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('createEvent', { season_id: 's-1', name: 'Week 5' }),
    );
  });

  it('renames an event', async () => {
    const rpc = rpcFor();
    const user = userEvent.setup();
    render(<EventsPanel seasonId="s-1" rpc={rpc} />);
    await user.click((await screen.findAllByRole('button', { name: /rename/i }))[0]!);
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Week 1 (renamed)');
    await user.click(screen.getByRole('button', { name: /save name/i }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('updateEvent', {
        event_id: 'e-1',
        name: 'Week 1 (renamed)',
      }),
    );
  });

  it('marks Week 1 as the default event from getActiveContext', async () => {
    render(<EventsPanel seasonId="s-1" rpc={rpcFor()} />);
    const rows = await screen.findAllByRole('row');
    expect(rows[1]).toHaveTextContent('Default');
    expect(
      screen.queryByRole('button', { name: /make week 1 the default/i }),
    ).not.toBeInTheDocument();
  });

  it('disables "make the default" while offline, and says why', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<EventsPanel seasonId="s-1" rpc={rpcFor()} />);
    const button = await screen.findByRole('button', { name: /make week 3 the default/i });
    expect(button).toBeDisabled();
    expect(
      screen.getByText(/changing the active season or event needs a connection/i),
    ).toBeInTheDocument();
  });
});
