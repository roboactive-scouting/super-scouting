import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ActiveContext, EventRow, SeasonRow } from '@frc/shared';
import { RpcError } from '@/data/rpc';
import { CompetitionsPanel } from './CompetitionsPanel';

const T0 = '2026-01-10T08:00:00.000Z';
const season = (id: string, year: number, game_name: string, path = 'seasons/2026/field.webp') =>
  ({ id, year, game_name, field_image_path: path, created_at: T0, updated_at: T0 }) as SeasonRow;
const SEASONS = [season('s-27', 2027, 'NEXT GAME'), season('s-26', 2026, 'REBUILT')];

const FIVE_EVENTS: EventRow[] = [
  'District #1 · Haifa',
  "District #2 · Be'er Sheva",
  'District #3 · Tel Aviv',
  'District #4 · Jerusalem',
  'Israel Championship',
].map((name, i) => ({
  id: `e-${i + 1}`,
  season_id: 's-26',
  name,
  code: null,
  sort_order: i + 1,
  created_at: T0,
  updated_at: T0,
}));

const ACTIVE: ActiveContext = { active_season_id: 's-26', active_event_id: 'e-3' };

type Call = Mock<(name: string, input?: unknown) => Promise<unknown>>;

/** The page's side of the contract: it owns the lists and applies every change in place. */
function renderCompetitions({
  rpc,
  events = FIVE_EVENTS,
  seasons = SEASONS,
  seasonId = 's-26',
}: {
  rpc: Call | Mock;
  events?: EventRow[];
  seasons?: SeasonRow[];
  seasonId?: string;
}) {
  function Harness() {
    const [rows, setRows] = useState(seasons);
    const [chosen, setChosen] = useState(seasonId);
    const [active, setActive] = useState(ACTIVE);
    const [list, setList] = useState(events);
    return (
      <CompetitionsPanel
        rpc={{ call: rpc as Call }}
        seasons={rows}
        active={active}
        seasonId={chosen}
        events={chosen === 's-26' ? list : []}
        eventsGate={null}
        onSelectSeason={setChosen}
        onSeasonSaved={(row) => {
          setRows((prev) =>
            [...prev.filter((s) => s.id !== row.id), row].sort((a, b) => b.year - a.year),
          );
          setChosen(row.id);
        }}
        onActiveChange={setActive}
        onEventsChange={(_season, update) =>
          setList((prev) => [...update(prev)].sort((a, b) => a.sort_order - b.sort_order))
        }
        onSeasonDeleted={(id) => setRows((prev) => prev.filter((s) => s.id !== id))}
        onEventDeleted={(_season, id) => setList((prev) => prev.filter((e) => e.id !== id))}
      />
    );
  }
  render(<Harness />);
}

/** Answers the way the server does; `fail` names a use case that refuses. */
function serverLike(fail?: { name: string; error: Error }): Call {
  return vi.fn(async (name: string, input?: unknown) => {
    if (fail && name === fail.name) throw fail.error;
    const body = (input ?? {}) as Record<string, unknown>;
    if (name === 'reorderEvents') {
      const ids = body.event_ids as string[];
      return {
        items: ids.map((id, i) => ({
          ...FIVE_EVENTS.find((e) => e.id === id)!,
          sort_order: i + 1,
        })),
      };
    }
    if (name === 'setActiveEvent') return { ...ACTIVE, active_event_id: body.event_id };
    if (name === 'setActiveSeason')
      return { active_season_id: body.season_id, active_event_id: null };
    if (name === 'createSeason') return { id: 's-28', created_at: T0, updated_at: T0, ...body };
    if (name === 'updateSeason') {
      const old = SEASONS.find((s) => s.id === body.season_id)!;
      return { ...old, ...body };
    }
    if (name === 'createEvent') {
      return { ...FIVE_EVENTS[0]!, id: 'e-6', name: body.name, sort_order: 6 };
    }
    if (name === 'deleteEvent' || name === 'deleteSeason') {
      return { deleted: !body.dry_run, events: 1, matches: 3, entries: 17, forms: 0 };
    }
    if (name === 'updateEvent') {
      return { ...FIVE_EVENTS.find((e) => e.id === body.event_id)!, name: body.name };
    }
    return undefined;
  });
}

const cards = () => screen.getAllByRole('article').map((a) => a.querySelector('h3')!.textContent);
const card = (name: string) =>
  screen.getAllByRole('article').find((a) => a.querySelector('h3')!.textContent === name)!;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CompetitionsPanel — events', () => {
  it('moves an event up in place and reverts if the server refuses', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'reorderEvents') throw new Error('refused');
    });
    renderCompetitions({ rpc, events: FIVE_EVENTS });
    let reject!: (e: Error) => void;
    rpc.mockImplementation(async (name: string) => {
      if (name === 'reorderEvents') return new Promise((_, r) => (reject = r));
    });
    await userEvent.click(
      screen.getByRole('button', { name: "Move District #2 · Be'er Sheva up" }),
    );
    expect(cards()[0]).toBe("District #2 · Be'er Sheva"); // moved in place at once
    await act(async () => reject(new Error('refused')));
    await waitFor(() => expect(cards()[0]).toBe('District #1 · Haifa')); // reverted
    expect(screen.getByRole('alert')).toHaveTextContent('refused');
  });

  it('lists events in display order with their position, and the order note', () => {
    renderCompetitions({ rpc: serverLike() });
    expect(cards()).toEqual(FIVE_EVENTS.map((e) => e.name));
    expect(within(card('Israel Championship')).getByText('#5')).toBeInTheDocument();
    expect(
      screen.getByText('Order is display order only — every event counts equally.'),
    ).toBeInTheDocument();
  });

  it('disables up on the first card and down on the last', () => {
    renderCompetitions({ rpc: serverLike() });
    expect(screen.getByRole('button', { name: 'Move District #1 · Haifa up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move District #1 · Haifa down' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move Israel Championship up' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move Israel Championship down' })).toBeDisabled();
  });

  it('sends the whole new order once, and keeps the answer', async () => {
    const rpc = serverLike();
    renderCompetitions({ rpc });
    await userEvent.click(screen.getByRole('button', { name: 'Move District #1 · Haifa down' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('reorderEvents', {
        season_id: 's-26',
        event_ids: ['e-2', 'e-1', 'e-3', 'e-4', 'e-5'],
      }),
    );
    expect(cards().slice(0, 2)).toEqual(["District #2 · Be'er Sheva", 'District #1 · Haifa']);
    expect(rpc.mock.calls.filter(([n]) => n === 'reorderEvents')).toHaveLength(1);
    expect(rpc.mock.calls.filter(([n]) => n === 'listEvents')).toHaveLength(0);
  });

  it('marks the default event and makes another the default in place', async () => {
    const rpc = serverLike();
    renderCompetitions({ rpc });
    expect(within(card('District #3 · Tel Aviv')).getByText('Default event')).toBeInTheDocument();
    await userEvent.click(
      within(card('District #4 · Jerusalem')).getByRole('button', { name: 'Make default' }),
    );
    expect(within(card('District #4 · Jerusalem')).getByText('Default event')).toBeInTheDocument();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('setActiveEvent', { event_id: 'e-4' }));
    expect(
      within(card('District #3 · Tel Aviv')).getByRole('button', { name: 'Make default' }),
    ).toBeInTheDocument();
  });

  it('puts the old default back when the server refuses', async () => {
    renderCompetitions({
      rpc: serverLike({ name: 'setActiveEvent', error: new Error('not now') }),
    });
    await userEvent.click(
      within(card('District #4 · Jerusalem')).getByRole('button', { name: 'Make default' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('not now');
    expect(within(card('District #3 · Tel Aviv')).getByText('Default event')).toBeInTheDocument();
  });

  it('creates an event with a name only, last in the list', async () => {
    const rpc = serverLike();
    renderCompetitions({ rpc });
    await userEvent.click(screen.getByRole('button', { name: '+ New event' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Week 5');
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('createEvent', { season_id: 's-26', name: 'Week 5' }),
    );
    expect(cards().at(-1)).toBe('Week 5');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renames an event', async () => {
    const rpc = serverLike();
    renderCompetitions({ rpc });
    await userEvent.click(screen.getByRole('button', { name: 'Rename District #1 · Haifa' }));
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Haifa (renamed)');
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('updateEvent', { event_id: 'e-1', name: 'Haifa (renamed)' }),
    );
    expect(cards()[0]).toBe('Haifa (renamed)');
  });

  it('deletes an event from its ✎ dialog once the damage is named and the name typed', async () => {
    const rpc = serverLike();
    renderCompetitions({ rpc });
    await userEvent.click(screen.getByRole('button', { name: 'Rename District #1 · Haifa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete District #1 · Haifa' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete this event?' });
    expect(confirm).toHaveTextContent('This deletes 3 matches and 17 entries for good.');
    await userEvent.type(within(confirm).getByLabelText(/Type District #1/), 'District #1 · Haifa');
    await userEvent.click(
      within(confirm).getByRole('button', { name: 'Delete District #1 · Haifa for good' }),
    );
    expect(rpc).toHaveBeenCalledWith('deleteEvent', {
      event_id: 'e-1',
      confirm_name: 'District #1 · Haifa',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(cards()).not.toContain('District #1 · Haifa');
  });

  it('offers Delete for the default event and the active season only as off, with why', async () => {
    renderCompetitions({ rpc: serverLike() });
    await userEvent.click(screen.getByRole('button', { name: 'Rename District #3 · Tel Aviv' }));
    expect(screen.getByRole('button', { name: 'Delete District #3 · Tel Aviv' })).toBeDisabled();
    expect(screen.getByText('Switch the default event first.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit season' }));
    expect(screen.getByRole('button', { name: 'Delete 2026' })).toBeDisabled();
    expect(screen.getByText('Switch the active season first.')).toBeInTheDocument();
  });

  it('disables "Make default" and "Make … active" offline, and says why', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderCompetitions({ rpc: serverLike(), seasonId: 's-27' });
    expect(screen.getByRole('button', { name: 'Make 2027 active' })).toBeDisabled();
    expect(
      screen.getByText('Changing the active season or event needs a connection.'),
    ).toBeInTheDocument();
  });

  it('says Manage needs a connection when a save cannot reach the server', async () => {
    renderCompetitions({
      rpc: serverLike({
        name: 'reorderEvents',
        error: new RpcError('offline', 'could not reach the server', 0),
      }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Move District #1 · Haifa down' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Managing seasons, events, rosters and matches needs a connection — try again when this device is online.',
    );
  });
});

describe('CompetitionsPanel — seasons', () => {
  it('shows season chips newest first, the active one labelled', () => {
    renderCompetitions({ rpc: serverLike() });
    const chips = within(screen.getByRole('group', { name: 'Seasons' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual([
      '2027 NEXT GAME',
      '2026 REBUILT · Active',
      'New season',
    ]);
    expect(chips[1]).toHaveAttribute('aria-pressed', 'true');
  });

  it("shows the chosen season's card", () => {
    renderCompetitions({ rpc: serverLike() });
    const seasonCard = screen.getByRole('region', { name: '2026 season' });
    expect(within(seasonCard).getByRole('heading', { name: '2026 — REBUILT' })).toBeInTheDocument();
    expect(within(seasonCard).getByText('seasons/2026/field.webp')).toBeInTheDocument();
    expect(within(seasonCard).getByText('Active season')).toBeInTheDocument();
  });

  it('makes another season active in place', async () => {
    const rpc = serverLike();
    renderCompetitions({ rpc });
    await userEvent.click(screen.getByRole('button', { name: /^2027/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Make 2027 active' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('setActiveSeason', { season_id: 's-27' }));
    expect(screen.getByText('Active season')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^2027/ })).toHaveTextContent('· Active');
  });

  it('creates a season from year, game name and image path, and shows it', async () => {
    const rpc = serverLike();
    renderCompetitions({ rpc });
    await userEvent.click(screen.getByRole('button', { name: 'New season' }));
    const dialog = screen.getByRole('dialog', { name: 'New season' });
    await userEvent.type(within(dialog).getByLabelText('Year'), '2028');
    await userEvent.type(within(dialog).getByLabelText('Game name'), 'NEW');
    await userEvent.type(
      within(dialog).getByLabelText('Game image path'),
      'seasons/2026/field.webp',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create season' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('createSeason', {
        year: 2028,
        game_name: 'NEW',
        field_image_path: 'seasons/2026/field.webp',
      }),
    );
    expect(screen.getByRole('button', { name: /^2028/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: '2028 — NEW' })).toBeInTheDocument();
  });

  it("shows the server's sentence for an image that does not resolve, without a code", async () => {
    renderCompetitions({
      rpc: serverLike({
        name: 'createSeason',
        error: Object.assign(new Error('commit apps/client/public/seasons/2028/field.webp first'), {
          code: 'invalid',
        }),
      }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'New season' }));
    await userEvent.type(screen.getByLabelText('Year'), '2028');
    await userEvent.type(screen.getByLabelText('Game name'), 'NEW');
    await userEvent.type(screen.getByLabelText('Game image path'), 'seasons/2028/field.webp');
    await userEvent.click(screen.getByRole('button', { name: 'Create season' }));
    // The preview of the unknown path is its own alert; find the server's.
    const alert = await waitFor(() => {
      const found = screen
        .getAllByRole('alert')
        .find((el) => el.textContent?.includes('commit apps/client/public'));
      if (!found) throw new Error('not yet');
      return found;
    });
    expect(alert).not.toHaveTextContent('invalid');
  });

  it('edits a season in a dialog, sending only the changed field', async () => {
    const rpc = serverLike();
    renderCompetitions({ rpc });
    await userEvent.click(screen.getByRole('button', { name: 'Edit season' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit 2026' });
    const gameName = within(dialog).getByLabelText('Game name');
    await userEvent.clear(gameName);
    await userEvent.type(gameName, 'REBUILT REMIX');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('updateSeason', {
        season_id: 's-26',
        game_name: 'REBUILT REMIX',
      }),
    );
    expect(screen.getByRole('heading', { name: '2026 — REBUILT REMIX' })).toBeInTheDocument();
  });

  it('keeps the edit open with the conflict line when the image cannot change', async () => {
    renderCompetitions({
      rpc: serverLike({
        name: 'updateSeason',
        error: new Error('this season already has entries; the image cannot change'),
      }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Edit season' }));
    const path = screen.getByLabelText('Game image path');
    await userEvent.clear(path);
    await userEvent.type(path, 'seasons/2027/field-v2.webp');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(
        screen.getAllByRole('alert').some((a) => a.textContent?.includes('cannot change')),
      ).toBe(true),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fails loudly for a season whose image is not in this build, and not for one that is', async () => {
    renderCompetitions({
      rpc: serverLike(),
      seasons: [...SEASONS, season('s-99', 1999, 'MISSING', 'seasons/1999/field.webp')],
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^1999/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('seasons/1999/field.webp');
  });
});
