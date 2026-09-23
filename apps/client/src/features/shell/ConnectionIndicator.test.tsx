import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { enqueue } from '@/data/outbox';
import { ConnectionIndicator } from './ConnectionIndicator';

const op = (rowId: string) => ({
  op_id: `op-${rowId}`,
  entity: 'scouting_entry' as const,
  row_id: rowId,
  action: 'create' as const,
  base_version: null,
  payload: {},
  author_user_id: 'u-1',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: 1,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('ConnectionIndicator (SPEC-FINAL 9.10)', () => {
  it('names the state in words, not just a colour', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<ConnectionIndicator />);
    expect(await screen.findByText(/online/i)).toBeInTheDocument();
  });

  it('shows the unsynced count next to the state when offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await enqueue(op('r-1'));
    await enqueue(op('r-2'));
    render(<ConnectionIndicator />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('offline · 2 unsynced'),
    );
  });

  it('counts an entry for a brand-new match once, not once for the match and once for the entry', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await enqueue({ ...op('m-new'), op_id: 'op-m-new', entity: 'match' });
    await enqueue(op('e-1'));
    render(<ConnectionIndicator />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('offline · 1 unsynced'),
    );
  });

  it('never counts a bare match on its own', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await enqueue({ ...op('m-new'), op_id: 'op-m-new', entity: 'match' });
    render(<ConnectionIndicator />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^offline$/));
  });

  it('says nothing about a count when there is nothing unsynced', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<ConnectionIndicator />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^online$/i));
  });
});
