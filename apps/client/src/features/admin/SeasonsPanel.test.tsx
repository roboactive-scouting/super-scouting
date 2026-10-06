import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeasonsPanel } from './SeasonsPanel';

const seasons = [
  { id: 's-1', year: 2026, game_name: 'CRESCENDO', field_image_path: 'seasons/2026/field.webp' },
  { id: 's-2', year: 2027, game_name: 'NEXT GAME', field_image_path: 'seasons/2027/field.webp' },
];

function harness(overrides: Partial<Record<string, unknown>> = {}) {
  const call = vi.fn(async (name: string) => {
    if (name === 'listSeasons') return { items: seasons, next_cursor: null };
    if (name === 'getActiveContext') return { active_season_id: 's-1', active_event_id: null };
    return { id: 's-3', year: 2028, game_name: 'NEW', field_image_path: 'seasons/2028/field.webp' };
  });
  return { call, ...overrides };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SeasonsPanel', () => {
  it('lists seasons newest first and marks the active one', async () => {
    render(<SeasonsPanel rpc={harness()} />);
    const rows = await screen.findAllByRole('row');
    expect(rows[1]).toHaveTextContent('2027');
    expect(rows[2]).toHaveTextContent('2026');
    expect(rows[2]).toHaveTextContent(/active/i);
  });

  it('creates a season from year, game name and image path', async () => {
    const rpc = harness();
    const user = userEvent.setup();
    render(<SeasonsPanel rpc={rpc} />);
    await user.click(await screen.findByRole('button', { name: /new season/i }));
    await user.type(screen.getByLabelText(/year/i), '2028');
    await user.type(screen.getByLabelText(/game name/i), 'NEW');
    await user.type(screen.getByLabelText(/game image path/i), 'seasons/2028/field.webp');
    await user.click(screen.getByRole('button', { name: /create season/i }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('createSeason', {
        year: 2028,
        game_name: 'NEW',
        field_image_path: 'seasons/2028/field.webp',
      }),
    );
  });

  it('shows the server error when the image path does not resolve, without a raw code', async () => {
    const rpc = harness({
      call: vi.fn(async (name: string) => {
        if (name === 'listSeasons') return { items: seasons, next_cursor: null };
        if (name === 'getActiveContext') return { active_season_id: 's-1', active_event_id: null };
        throw Object.assign(new Error('commit apps/client/public/seasons/2028/field.webp first'), {
          code: 'invalid',
        });
      }),
    });
    const user = userEvent.setup();
    render(<SeasonsPanel rpc={rpc} />);
    await user.click(await screen.findByRole('button', { name: /new season/i }));
    await user.type(screen.getByLabelText(/year/i), '2028');
    await user.type(screen.getByLabelText(/game name/i), 'NEW');
    await user.type(screen.getByLabelText(/game image path/i), 'seasons/2028/field.webp');
    await user.click(screen.getByRole('button', { name: /create season/i }));
    // Task 1.23 added a FieldImage preview to this same form, which is its own alert for an
    // uncommitted path (seasons/2028/field.webp isn't in SEASON_IMAGE_MANIFEST either) —
    // find the server-error alert specifically rather than assuming there is only one.
    const alert = await waitFor(() => {
      const found = screen
        .getAllByRole('alert')
        .find((el) =>
          el.textContent?.includes('commit apps/client/public/seasons/2028/field.webp'),
        );
      if (!found) throw new Error('server error alert not found yet');
      return found;
    });
    expect(alert).toHaveTextContent(/commit apps\/client\/public\/seasons\/2028\/field\.webp/);
    expect(alert).not.toHaveTextContent('invalid');
  });

  it('sets the active season', async () => {
    const rpc = harness();
    const user = userEvent.setup();
    render(<SeasonsPanel rpc={rpc} />);
    await user.click(await screen.findByRole('button', { name: /make 2027 active/i }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('setActiveSeason', { season_id: 's-2' }),
    );
  });

  // ---------------------------------------------------------------------------------
  // Beyond the plan (orchestrator addendum items 5 and 7).

  it('edits a season, sending only the changed field', async () => {
    const rpc = harness();
    const user = userEvent.setup();
    render(<SeasonsPanel rpc={rpc} />);
    const rows = await screen.findAllByRole('row');
    expect(rows[2]).toHaveTextContent('2026');
    await user.click(screen.getAllByRole('button', { name: /edit/i })[1]!); // the 2026 row
    const gameName = screen.getByLabelText(/game name/i);
    await user.clear(gameName);
    await user.type(gameName, 'CRESCENDO REMIX');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() =>
      expect(rpc.call).toHaveBeenCalledWith('updateSeason', {
        season_id: 's-1',
        game_name: 'CRESCENDO REMIX',
      }),
    );
  });

  it('shows the update error for a conflict, and lets the admin cancel out', async () => {
    const rpc = harness({
      call: vi.fn(async (name: string) => {
        if (name === 'listSeasons') return { items: seasons, next_cursor: null };
        if (name === 'getActiveContext') return { active_season_id: 's-1', active_event_id: null };
        throw Object.assign(new Error('this season already has entries; the image cannot change'), {
          code: 'conflict',
        });
      }),
    });
    const user = userEvent.setup();
    render(<SeasonsPanel rpc={rpc} />);
    await screen.findAllByRole('row');
    await user.click(screen.getAllByRole('button', { name: /edit/i })[0]!);
    const imagePath = screen.getByLabelText(/game image path/i);
    await user.clear(imagePath);
    await user.type(imagePath, 'seasons/2027/field-v2.webp');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    // Same reason as above: the typed path (seasons/2027/field-v2.webp) is itself unknown,
    // so the FieldImage preview renders its own alert alongside the server-error one.
    const alert = await waitFor(() => {
      const found = screen
        .getAllByRole('alert')
        .find((el) => el.textContent?.includes('the image cannot change'));
      if (!found) throw new Error('conflict error alert not found yet');
      return found;
    });
    expect(alert).toHaveTextContent(/the image cannot change/);
    expect(alert).not.toHaveTextContent('conflict');
  });

  it('shows the fail-loud alert for a season whose image is not committed, and none for one that is', async () => {
    const rpc = harness({
      call: vi.fn(async (name: string) => {
        if (name === 'listSeasons') {
          return {
            items: [
              {
                id: 's-1',
                year: 2026,
                game_name: 'CRESCENDO',
                field_image_path: 'seasons/2026/field.webp',
              },
              {
                id: 's-4',
                year: 1999,
                game_name: 'MISSING GAME',
                field_image_path: 'seasons/1999/field.webp',
              },
            ],
            next_cursor: null,
          };
        }
        if (name === 'getActiveContext') {
          return { active_season_id: 's-1', active_event_id: null };
        }
        throw new Error('not used');
      }),
    });
    render(<SeasonsPanel rpc={rpc} />);
    const rows = await screen.findAllByRole('row');
    const missingRow = rows.find((row) => row.textContent?.includes('1999'));
    const knownRow = rows.find((row) => row.textContent?.includes('2026'));
    expect(within(missingRow!).getByRole('alert')).toHaveTextContent('seasons/1999/field.webp');
    expect(within(knownRow!).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables "make active" while offline, and says why', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<SeasonsPanel rpc={harness()} />);
    const button = await screen.findByRole('button', { name: /make 2027 active/i });
    expect(button).toBeDisabled();
    expect(
      screen.getByText(/changing the active season or event needs a connection/i),
    ).toBeInTheDocument();
  });
});
