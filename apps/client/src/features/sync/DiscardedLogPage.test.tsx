import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatDayTime, type Operation } from '@frc/shared';
import { db } from '@/data/db';
import { listDiscarded, recordDiscarded } from '@/data/discarded';
import { PATHS } from '@/lib/paths';
import { DiscardedLogPage } from './DiscardedLogPage';
import { DiscardedNotice } from './DiscardedNotice';

const EVENT = 'ev-haifa';
const op = (id: string, over: Partial<Operation> & { payload?: Record<string, unknown> } = {}) =>
  ({
    op_id: id,
    entity: 'scouting_entry',
    row_id: `row-${id}`,
    action: 'create',
    base_version: null,
    author_user_id: 'u-noa',
    client_created_at: '2026-10-10T11:20:00.000Z',
    client_updated_at: '2026-10-10T11:20:00.000Z',
    seq: 1,
    ...over,
    payload: {
      event_id: EVENT,
      match_id: 'm-12',
      team_id: 't-3075',
      form_kind: 'match',
      alliance: 'red',
      scouter_id: 'u-noa',
      robot_status: 'played',
      data: { auto_notes: 'SECRET-VALUE-17' },
      ...over.payload,
    },
  }) as Operation;

const NEW = '2026-10-12T05:02:00.000Z';
const OLD = '2026-10-09T14:40:00.000Z';

async function seed() {
  await db.rows.bulkPut([
    { entity: 'events', id: EVENT, name: 'District #2 · Haifa' },
    { entity: 'events', id: 'ev-practice', name: 'Practice day' },
    { entity: 'teams', id: 't-3075', number: 3075, name: 'Ha-Dream Team' },
    { entity: 'teams', id: 't-4590', number: 4590, name: 'GreenBlitz' },
    { entity: 'matches', id: 'm-12', event_id: EVENT, match_type: 'qualification', number: 12 },
    {
      entity: 'match_teams',
      id: 's-1',
      match_id: 'm-12',
      team_id: 't-3075',
      alliance: 'red',
      station: 2,
    },
    { entity: 'users', id: 'u-noa', full_name: 'Noa Levi' },
    { entity: 'users', id: 'u-omer', full_name: 'Omer Katz' },
  ]);
  await recordDiscarded(op('a'), undefined, NEW);
  await recordDiscarded(
    op('s', {
      payload: {
        event_id: 'ev-practice',
        match_id: null,
        team_id: 't-4590',
        form_kind: 'super',
        scouter_id: 'u-omer',
        robot_status: null,
        alliance: null,
      },
    }),
    undefined,
    OLD,
  );
}

function renderAt(element: React.ReactNode, path = PATHS.syncDiscarded) {
  const router = createMemoryRouter(
    [
      { path: PATHS.syncDiscarded, element },
      { path: PATHS.sync, element: <h1>Sync page</h1> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('DiscardedLogPage (19-discarded final)', () => {
  it('groups the records by removal, newest first, each with its competition', async () => {
    await seed();
    renderAt(<DiscardedLogPage />);
    const rows = await screen.findAllByRole('row');
    const text = rows.map((r) => r.textContent);
    expect(text[0]).toBe('MatchTeamStatusScouterSaved');
    expect(text[1]).toBe(`Removed ${formatDayTime(NEW)}District #2 · Haifa`);
    expect(text[2]).toContain('Q12');
    expect(text[2]).toContain('Red 2');
    expect(text[2]).toContain('3075');
    expect(text[2]).toContain('Played');
    expect(text[2]).toContain('Noa Levi');
    expect(text[3]).toBe(`Removed ${formatDayTime(OLD)}Practice day`);
    expect(text[4]).toContain('SUPER');
    expect(text[4]).toContain('Omer Katz');
    expect(
      screen.getByText('An admin deleted the competition, season or form it belonged to.'),
    ).toBeVisible();
  });

  it('never renders an entered value', async () => {
    await seed();
    renderAt(<DiscardedLogPage />);
    await screen.findAllByRole('row');
    expect(document.body.textContent).not.toContain('SECRET-VALUE-17');
    expect(JSON.stringify(await listDiscarded())).not.toContain('SECRET-VALUE-17');
  });

  it('says so when nothing has been discarded, and leads back to Sync', async () => {
    renderAt(<DiscardedLogPage />);
    expect(
      await screen.findByRole('heading', { name: 'Nothing has been discarded' }),
    ).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'Back to Sync' }));
    expect(await screen.findByRole('heading', { name: 'Sync page' })).toBeVisible();
  });

  it('has the back link to Sync', async () => {
    renderAt(<DiscardedLogPage />);
    expect(await screen.findByRole('link', { name: 'Sync' })).toHaveAttribute('href', PATHS.sync);
  });
});

describe('DiscardedNotice (17-sync final, image 3)', () => {
  it('names what went, without entered values; Dismiss hides it, the log keeps it', async () => {
    await seed();
    renderAt(<DiscardedNotice deviceNoun="this phone" />);
    const notice = await screen.findByRole('region', { name: 'Discarded entries' });
    expect(notice).toHaveTextContent(
      '2 entries were removed from this phone. An admin deleted the event they belonged to, so they can’t be sent.',
    );
    const items = within(notice)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items[0]).toMatch(/^Q12 · 3075 Ha-Dream Team · Noa · \w{3} \d\d:\d\d$/);
    expect(items[1]).toMatch(/^Super · 4590 GreenBlitz · Omer · /);
    expect(notice.textContent).not.toContain('SECRET-VALUE-17');

    await userEvent.click(within(notice).getByRole('button', { name: 'Dismiss' }));
    await expect.poll(() => screen.queryByRole('region', { name: 'Discarded entries' })).toBeNull();
    expect(await listDiscarded()).toHaveLength(2);
  });

  it('speaks of one entry in the singular, and opens the log', async () => {
    await recordDiscarded(op('a'), undefined, NEW);
    renderAt(<DiscardedNotice deviceNoun="this device" />);
    const notice = await screen.findByRole('region', { name: 'Discarded entries' });
    expect(notice).toHaveTextContent(
      '1 entry was removed from this device. An admin deleted the event it belonged to, so it can’t be sent.',
    );
    expect(within(notice).getByRole('link', { name: 'See the log' })).toHaveAttribute(
      'href',
      PATHS.syncDiscarded,
    );
  });

  it('renders nothing when nothing waits to be dismissed', async () => {
    renderAt(<DiscardedNotice />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('region', { name: 'Discarded entries' })).toBeNull();
  });
});
