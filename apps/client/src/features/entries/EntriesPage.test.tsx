import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { EntriesPage } from './EntriesPage';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    { entity: 'teams', id: 't-1', number: 2096, name: 'ROBACTIVE' },
    { entity: 'matches', id: 'm-1', event_id: 'ev-1', match_type: 'qualification', number: 12 },
    { entity: 'users', id: 'u-1', full_name: 'Seed Scouter', username: 'seed_scouter' },
    {
      entity: 'scouting_entries',
      id: 'e-1',
      event_id: 'ev-1',
      match_id: 'm-1',
      team_id: 't-1',
      scouter_id: 'u-1',
      robot_status: 'played',
      data: { auto_notes: 3 },
      deleted_at: null,
      client_updated_at: '2026-11-14T09:00:00.000Z',
    },
    {
      entity: 'scouting_entries',
      id: 'e-2',
      event_id: 'ev-1',
      match_id: 'm-1',
      team_id: 't-1',
      scouter_id: 'u-1',
      robot_status: 'no_show',
      data: {},
      deleted_at: '2026-11-14T09:30:00.000Z',
      client_updated_at: '2026-11-14T09:20:00.000Z',
    },
  ]);
});

describe('EntriesPage — the laptop view of the walking skeleton', () => {
  it('lists a live entry with its match, team, status and scouter', async () => {
    render(<EntriesPage eventId="ev-1" />);
    const row = await screen.findByRole('row', { name: /2096/ });
    expect(row).toHaveTextContent('12');
    expect(row).toHaveTextContent('ROBACTIVE');
    expect(row).toHaveTextContent('played');
    expect(row).toHaveTextContent('Seed Scouter');
  });

  it('never lists a soft-deleted entry', async () => {
    render(<EntriesPage eventId="ev-1" />);
    expect(await screen.findAllByRole('row')).toHaveLength(2); // header + one live row
  });

  it('shows the empty state when the event has no entries', async () => {
    await db.rows.where('entity').equals('scouting_entries').delete();
    render(<EntriesPage eventId="ev-1" />);
    expect(await screen.findByText(/no entries yet/i)).toBeInTheDocument();
  });

  it.each([
    [
      'edit-window-expired',
      'this entry is locked — ask a lead',
      'This entry is locked — ask a lead',
    ],
    [
      'forbidden',
      'a scouter may edit only their own entry',
      'Not allowed for this account — ask a lead',
    ],
    ['invalid', 'stale base version 3', 'stale base version 3'],
  ] as const)(
    'shows one line for a %s rejection, never the raw code',
    async (code, message, line) => {
      await db.syncState.put({
        row_id: 'e-1',
        sync_state: 'pending',
        acked_at: null,
        origin: 'local',
        rejection: { code, message, at: '2026-11-14T09:05:00.000Z' },
      });
      render(<EntriesPage eventId="ev-1" />);
      const notice = await screen.findByText(line, { exact: false });
      expect(notice).toHaveTextContent(`Not synced: ${line}`);
      expect(screen.getAllByText(/not synced/i)).toHaveLength(1);
      if (code !== 'invalid') expect(document.body).not.toHaveTextContent(code);
    },
  );

  it('shows no rejection line for an entry that synced', async () => {
    await db.syncState.put({ row_id: 'e-1', sync_state: 'acked', acked_at: 'x', origin: 'local' });
    render(<EntriesPage eventId="ev-1" />);
    await screen.findByRole('row', { name: /2096/ });
    expect(screen.queryByText(/not synced/i)).not.toBeInTheDocument();
  });
});
