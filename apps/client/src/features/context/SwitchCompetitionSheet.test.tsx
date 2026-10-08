import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { RpcError, type Rpc } from '@/data/rpc';
import { sessionOverride } from './sessionOverride';
import { SwitchCompetitionSheet } from './SwitchCompetitionSheet';

/** This server never answers: the sheet shows what the device holds (task-1.22 A.2). */
const unreachable = (): Rpc => ({
  call: vi.fn(async () => {
    throw new RpcError('offline', 'could not reach the server', 0);
  }),
});

function renderSheet(rpc: Rpc = unreachable(), open = true) {
  const onClose = vi.fn();
  const view = render(<SwitchCompetitionSheet open={open} onClose={onClose} rpc={rpc} />);
  return { onClose, ...view };
}

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

describe('SwitchCompetitionSheet (SPEC-FINAL 6.3, Home README "States")', () => {
  it('asks the server nothing while closed', async () => {
    const rpc = unreachable();
    renderSheet(rpc, false);
    await new Promise((r) => setTimeout(r, 20));
    expect(rpc.call).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('marks the admin default as "Current · default", from the cache', async () => {
    renderSheet();
    expect(await screen.findByRole('dialog', { name: 'Switch competition' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Week 1/ })).toHaveTextContent(
      'Current · default',
    );
    expect(screen.getByText(/Reopening the app returns to Week 1/)).toBeInTheDocument();
  });

  it('offers season chips and event cards, never a dropdown', async () => {
    renderSheet();
    expect(await screen.findAllByRole('button', { name: /week/i })).toHaveLength(2);
    expect(screen.getByRole('button', { name: /2026 CRESCENDO · default/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(document.querySelector('select')).toBeNull();
  });

  it('holds an override in memory only, and closes', async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet();
    await user.click(await screen.findByRole('button', { name: /week 3/i }));
    expect(sessionOverride.get()).toBe('e-2');
    expect(sessionOverride.name()).toBe('Week 3');
    expect(onClose).toHaveBeenCalled();
    expect(JSON.stringify(await db.meta.toArray())).not.toContain('e-2');
  });

  it('disables every other competition while offline, with today’s line', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderSheet();
    expect(await screen.findByRole('button', { name: /week 3/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /week 1/i })).toBeEnabled();
    expect(screen.getByText(/only the default competition is available offline/i)).toBeVisible();
  });

  it('clears the override when the default is chosen again — offline too', async () => {
    sessionOverride.set('e-2', 'Week 3');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const user = userEvent.setup();
    renderSheet();
    expect(await screen.findByRole('button', { name: /week 3/i })).toHaveTextContent(
      'Current, this session only',
    );
    await user.click(screen.getByRole('button', { name: /week 1/i }));
    expect(sessionOverride.get()).toBeNull();
  });

  it('says so when the server does not answer', async () => {
    renderSheet();
    expect(await screen.findByText(/server did not answer/i)).toBeInTheDocument();
  });

  it('on a phone, the sheet has its ✕ at the title, and it closes (UI fix notes, Home 2)', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    try {
      const { onClose } = renderSheet();
      const dialog = await screen.findByRole('dialog', { name: 'Switch competition' });
      expect(dialog).toHaveAttribute('data-surface', 'sheet');
      const [x] = screen.getAllByRole('button', { name: 'Close' });
      expect(x!.closest('[data-drag-handle]')).not.toBeNull();
      await userEvent.click(x!);
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('SwitchCompetitionSheet with a server (task-1.22 addendum A)', () => {
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

  it('lists seasons newest first and loads a season’s events when its chip is chosen', async () => {
    const rpc = serverRpc();
    const user = userEvent.setup();
    renderSheet(rpc);
    const seasons = await screen.findByRole('group', { name: 'Seasons' });
    await waitFor(() => expect(seasons.textContent).toMatch(/2026.*2025/));
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'Events' }).textContent).toMatch(/Week 1.*Week 3/),
    );

    await user.click(screen.getByRole('button', { name: /2025/ }));
    await user.click(await screen.findByRole('button', { name: /district champs/i }));
    expect(sessionOverride.get()).toBe('e-9');
    expect(rpc.call).toHaveBeenCalledWith('listEvents', expect.objectContaining({ season_id: S2 }));
  });

  it('clears "the server did not answer" once a season’s events do answer', async () => {
    const answering = serverRpc();
    const call = vi.fn(async (name: string, input?: unknown) => {
      if (name === 'listEvents' && (input as { season_id: string }).season_id === 's-1') {
        // After listSeasons has answered, so only this failure sets the line.
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new RpcError('offline', 'could not reach the server', 0);
      }
      return answering.call(name, input);
    });
    const user = userEvent.setup();
    renderSheet({ call } as unknown as Rpc);
    expect(await screen.findByText(/server did not answer/i)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /2025/ }));
    expect(await screen.findByRole('button', { name: /district champs/i })).toBeInTheDocument();
    expect(screen.queryByText(/server did not answer/i)).toBeNull();
  });

  it('reads the default again when an event is chosen (branch review, finding 4)', async () => {
    const user = userEvent.setup();
    renderSheet();
    await screen.findByRole('button', { name: /week 3/i });
    await db.rows.put({
      entity: 'app_settings',
      id: 'true',
      active_season_id: 's-1',
      active_event_id: 'e-2',
    });
    await user.click(screen.getByRole('button', { name: /week 3/i }));
    expect(sessionOverride.get()).toBeNull();
    await user.click(screen.getByRole('button', { name: /week 1/i }));
    expect(sessionOverride.get()).toBe('e-1');
  });
});
