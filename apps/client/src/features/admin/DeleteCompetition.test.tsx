import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RpcError } from '@/data/rpc';
import { MANAGE_UNREACHABLE } from './adminMessages';
import {
  DeleteCompetition,
  SWITCH_EVENT_FIRST,
  SWITCH_SEASON_FIRST,
  damageLine,
  type DeleteTarget,
} from './DeleteCompetition';

const EVENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SEASON = '11111111-1111-4111-8111-111111111111';

type Call = (name: string, input: { dry_run?: boolean }) => Promise<unknown>;

function renderDelete({
  rpc,
  event,
  season,
  active = false,
  onKeyDown,
}: {
  rpc: Call;
  event?: { id: string; name: string };
  season?: { id: string; year: number; game_name: string };
  active?: boolean;
  onKeyDown?: () => void;
}) {
  const onDeleted = vi.fn();
  const target: DeleteTarget = season
    ? {
        kind: 'season',
        id: season.id,
        name: String(season.year),
        label: `${season.year} — ${season.game_name}`,
        active,
      }
    : { kind: 'event', id: event!.id, name: event!.name, label: event!.name, active };
  render(
    // Stands in for the Edit dialog the action lives in.
    <div onKeyDown={onKeyDown}>
      <DeleteCompetition
        target={target}
        rpc={{ call: rpc as (name: string, input?: unknown) => Promise<unknown> }}
        onDeleted={onDeleted}
      />
    </div>,
  );
  return { onDeleted };
}

const impact = (deleted: boolean) => ({ deleted, events: 1, matches: 3, entries: 17, forms: 0 });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeleteCompetition (SPEC-FINAL 3.9, 17.8)', () => {
  it('names the damage and needs the exact name', async () => {
    const rpc = vi.fn(async (_n: string, input: { dry_run?: boolean }) => impact(!input.dry_run));
    const { onDeleted } = renderDelete({ rpc, event: { id: EVENT, name: 'District #2' } });
    await userEvent.click(screen.getByRole('button', { name: 'Delete District #2' }));
    expect(rpc).toHaveBeenCalledWith('deleteEvent', { event_id: EVENT, dry_run: true });
    expect(await screen.findByText(/3 matches and 17 entries/)).toBeInTheDocument();
    expect(screen.getByText(/supabase db dump/)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Delete District #2 for good' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(screen.getByLabelText(/Type District #2/), 'district #2');
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await userEvent.clear(screen.getByLabelText(/Type District #2/));
    await userEvent.type(screen.getByLabelText(/Type District #2/), 'District #2');
    expect(confirm).not.toHaveAttribute('aria-disabled');
    await userEvent.click(confirm);
    expect(rpc).toHaveBeenLastCalledWith('deleteEvent', {
      event_id: EVENT,
      confirm_name: 'District #2',
    });
    expect(onDeleted).toHaveBeenCalledWith(EVENT);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a season names its events and is confirmed by its year', async () => {
    const rpc = vi.fn(async () => ({
      deleted: false,
      events: 2,
      matches: 40,
      entries: 1,
      forms: 0,
    }));
    renderDelete({ rpc, season: { id: SEASON, year: 2025, game_name: 'CRESCENDO' } });
    await userEvent.click(screen.getByRole('button', { name: 'Delete 2025' }));
    expect(rpc).toHaveBeenCalledWith('deleteSeason', { season_id: SEASON, dry_run: true });
    const dialog = await screen.findByRole('dialog', { name: 'Delete this season?' });
    expect(dialog).toHaveTextContent('2025 — CRESCENDO');
    expect(dialog).toHaveTextContent('This deletes 2 events, 40 matches and 1 entry for good.');
    expect(screen.getByLabelText(/Type 2025 to confirm/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete 2025 for good' })).toBeInTheDocument();
  });

  it('the active season and the default event show the action off with the refusal', () => {
    const rpc = vi.fn();
    renderDelete({ rpc, season: { id: SEASON, year: 2026, game_name: 'R' }, active: true });
    expect(screen.getByRole('button', { name: 'Delete 2026' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete 2026' })).toHaveAccessibleDescription(
      SWITCH_SEASON_FIRST,
    );
    renderDelete({ rpc, event: { id: EVENT, name: 'Week 1' }, active: true });
    expect(screen.getByRole('button', { name: 'Delete Week 1' })).toBeDisabled();
    expect(screen.getByText(SWITCH_EVENT_FIRST)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('is off while offline, like every Manage server action', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderDelete({ rpc: vi.fn(), event: { id: EVENT, name: 'Week 1' } });
    expect(screen.getByRole('button', { name: 'Delete Week 1' })).toBeDisabled();
    expect(screen.getByText(MANAGE_UNREACHABLE)).toBeInTheDocument();
  });

  it("shows the server's refusal of the count, and opens nothing", async () => {
    const rpc = vi.fn(async () => {
      throw new RpcError('conflict', SWITCH_EVENT_FIRST, 409, true);
    });
    renderDelete({ rpc, event: { id: EVENT, name: 'Week 1' } });
    await userEvent.click(screen.getByRole('button', { name: 'Delete Week 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(SWITCH_EVENT_FIRST);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the confirmation open with the reason when the delete fails', async () => {
    const rpc = vi.fn(async (_n: string, input: { dry_run?: boolean }) => {
      if (input.dry_run) return impact(false);
      throw new RpcError('network', 'offline', 0, false);
    });
    const { onDeleted } = renderDelete({ rpc, event: { id: EVENT, name: 'Week 1' } });
    await userEvent.click(screen.getByRole('button', { name: 'Delete Week 1' }));
    await userEvent.type(await screen.findByLabelText(/Type Week 1/), 'Week 1');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Week 1 for good' }));
    expect(await screen.findByText(MANAGE_UNREACHABLE)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('Escape closes the confirmation without reaching the dialog it opened from', async () => {
    const onKeyDown = vi.fn();
    renderDelete({
      rpc: vi.fn(async () => impact(false)),
      event: { id: EVENT, name: 'Week 1' },
      onKeyDown,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Delete Week 1' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});

describe('damageLine', () => {
  const of = (events: number, matches: number, entries: number, forms = 0) => ({
    deleted: false,
    events,
    matches,
    entries,
    forms,
  });

  it('an event names its matches and entries', () => {
    expect(damageLine('event', of(1, 3, 17))).toBe(
      'This deletes 3 matches and 17 entries for good.',
    );
    expect(damageLine('event', of(1, 1, 0))).toBe('This deletes 1 match and 0 entries for good.');
  });

  it('a season names its events too, and its forms when it has any', () => {
    expect(damageLine('season', of(5, 120, 860))).toBe(
      'This deletes 5 events, 120 matches and 860 entries for good.',
    );
    expect(damageLine('season', of(1, 0, 0, 2))).toBe(
      'This deletes 1 event, 0 matches, 0 entries and 2 forms for good.',
    );
  });
});
