import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { RpcError, type Rpc } from '@/data/rpc';
import { ContextPage } from './ContextPage';
import { sessionOverride } from './sessionOverride';

vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

/**
 * The plan's cases seed only the cache: this server never answers, so the page shows
 * what the device holds and no real fetch runs (task-1.22 addendum A.2).
 */
const unreachableRpc: Rpc = {
  call: vi.fn(async () => {
    throw new RpcError('offline', 'could not reach the server', 0);
  }),
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  sessionOverride.clear();
  await db.rows.bulkPut([
    { entity: 'app_settings', id: 'true', active_season_id: 's-1', active_event_id: 'e-1' },
    { entity: 'seasons', id: 's-1', year: 2026, game_name: 'CRESCENDO' },
    { entity: 'events', id: 'e-1', season_id: 's-1', name: 'Week 1', sort_order: 1 },
    { entity: 'events', id: 'e-2', season_id: 's-1', name: 'Week 3', sort_order: 2 },
  ]);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

describe('ContextPage (SPEC-FINAL 6.3)', () => {
  it('shows the admin default as the current context', async () => {
    render(<ContextPage rpc={unreachableRpc} />);
    expect(await screen.findByText(/Week 1/)).toBeInTheDocument();
    expect(screen.getByText(/current/i)).toBeInTheDocument();
  });

  it('offers seasons and events as a card grid, not a dropdown', async () => {
    render(<ContextPage rpc={unreachableRpc} />);
    expect(await screen.findAllByRole('button', { name: /week/i })).toHaveLength(2);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('holds an override in memory only and never writes it anywhere', async () => {
    const user = userEvent.setup();
    render(<ContextPage rpc={unreachableRpc} />);
    await user.click(await screen.findByRole('button', { name: /week 3/i }));
    expect(sessionOverride.get()).toBe('e-2');
    const dump = JSON.stringify(await db.meta.toArray());
    expect(dump).not.toContain('e-2');
  });

  it('warns that an override is session-only and blocks new entries', async () => {
    const user = userEvent.setup();
    render(<ContextPage rpc={unreachableRpc} />);
    await user.click(await screen.findByRole('button', { name: /week 3/i }));
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(/only for this session/i);
    expect(notice).toHaveTextContent(/cannot create new entries/i);
  });

  it('disables every switch while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<ContextPage rpc={unreachableRpc} />);
    expect(await screen.findByRole('button', { name: /week 3/i })).toBeDisabled();
    expect(
      screen.getByText(/only the default competition is available offline/i),
    ).toBeInTheDocument();
  });

  it('shows the app version quietly in the footer', async () => {
    render(<ContextPage rpc={unreachableRpc} />);
    expect(await screen.findByText(/^version /i)).toBeInTheDocument();
  });
});

describe('ContextPage beyond the plan (task-1.22 addendum A)', () => {
  const S2 = '00000000-0000-4000-8000-0000000000a2';
  const stamp = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
  const season = (id: string, year: number, game_name: string) => ({
    id,
    year,
    game_name,
    field_image_path: 'seasons/2026/field.webp',
    ...stamp,
  });
  const event = (id: string, season_id: string, name: string, sort_order: number) => ({
    id,
    season_id,
    name,
    code: null,
    sort_order,
    ...stamp,
  });

  /** A server that knows an older season the device has never cached. */
  function serverRpc() {
    const call = vi.fn(async (name: string, input?: unknown) => {
      if (name === 'listSeasons') {
        return {
          items: [season(S2, 2025, 'REEFSCAPE'), season('s-1', 2026, 'CRESCENDO')],
          next_cursor: null,
        };
      }
      if (name === 'listEvents') {
        const seasonId = (input as { season_id: string }).season_id;
        if (seasonId === S2) {
          return { items: [event('e-9', S2, 'District Champs', 1)], next_cursor: null };
        }
        return {
          items: [event('e-2', 's-1', 'Week 3', 2), event('e-1', 's-1', 'Week 1', 1)],
          next_cursor: null,
        };
      }
      throw new Error(`unexpected ${name}`);
    });
    return { call };
  }

  it('lists seasons from the server, most recent first, and loads a season’s events when chosen', async () => {
    const rpc = serverRpc();
    const user = userEvent.setup();
    render(<ContextPage rpc={rpc} />);
    const seasons = await screen.findByRole('list', { name: 'Seasons' });
    await waitFor(() => expect(seasons.textContent).toMatch(/2026.*2025/));
    // Events arrive in sort_order, whatever order the wire used.
    const events = screen.getByRole('list', { name: /events/i });
    expect(events.textContent).toMatch(/Week 1.*Week 3/);

    await user.click(screen.getByRole('button', { name: /2025/ }));
    await user.click(await screen.findByRole('button', { name: /district champs/i }));
    expect(sessionOverride.get()).toBe('e-9');
    expect(rpc.call).toHaveBeenCalledWith('listEvents', expect.objectContaining({ season_id: S2 }));
  });

  it('clears the override when the admin default is chosen again — offline too', async () => {
    const user = userEvent.setup();
    render(<ContextPage rpc={unreachableRpc} />);
    await user.click(await screen.findByRole('button', { name: /week 3/i }));
    expect(sessionOverride.get()).toBe('e-2');

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    const back = await screen.findByRole('button', { name: /back to week 1/i });
    expect(back).toBeEnabled();
    await user.click(back);
    expect(sessionOverride.get()).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('never renders a select anywhere on the page', async () => {
    render(<ContextPage rpc={serverRpc()} />);
    await screen.findByRole('list', { name: 'Seasons' });
    expect(document.querySelector('select')).toBeNull();
  });
});

describe('ContextPage when the default moves while it is open (branch review, finding 4)', () => {
  it('reads the default again when an event is chosen', async () => {
    const user = userEvent.setup();
    render(<ContextPage rpc={unreachableRpc} />);
    await screen.findByRole('button', { name: /week 3/i });

    // The admin moves the default to Week 3; the shell's pull caches it.
    await db.rows.put({
      entity: 'app_settings',
      id: 'true',
      active_season_id: 's-1',
      active_event_id: 'e-2',
    });

    // Choosing the real default is no override at all.
    await user.click(screen.getByRole('button', { name: /week 3/i }));
    expect(sessionOverride.get()).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /week 3/i })).toHaveTextContent(/current/i),
    );

    // The old default is now the other competition.
    await user.click(screen.getByRole('button', { name: /week 1/i }));
    expect(sessionOverride.get()).toBe('e-1');
  });
});
