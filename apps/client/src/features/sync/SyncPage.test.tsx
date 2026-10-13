import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Operation, Role } from '@frc/shared';
import { beginSync, endSync, setSyncProgress } from '@/data/connection';
import { db, setMeta, type PushRejection } from '@/data/db';
import { recordDiscarded } from '@/data/discarded';
import { ackResults, enqueue, unsyncedCount } from '@/data/outbox';
import { SyncPage } from './SyncPage';

const NOW = new Date().toISOString();

const op = (rowId: string, over: Partial<Operation> = {}): Operation => ({
  op_id: `o-${rowId}`,
  entity: 'scouting_entry',
  row_id: rowId,
  action: 'create',
  base_version: null,
  author_user_id: 'u-yael',
  client_created_at: NOW,
  client_updated_at: NOW,
  seq: 1,
  ...over,
  payload: {
    event_id: 'ev-1',
    form_kind: 'match',
    team_id: 't-1',
    match_id: 'm-1',
    alliance: 'red',
    robot_status: 'played',
    scouter_id: 'u-yael',
    ...over.payload,
  },
});

const reject = (rowId: string, code: PushRejection['code'], message: string) =>
  db.syncState.update(rowId, { rejection: { code, message, at: NOW } });

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    { entity: 'events', id: 'ev-1', name: 'District #3 · Tel Aviv' },
    { entity: 'events', id: 'ev-0', name: 'District #2 · Haifa' },
    { entity: 'teams', id: 't-1', number: 2096, name: 'ROBACTIVE' },
    { entity: 'teams', id: 't-2', number: 1690, name: 'Orbit' },
    { entity: 'teams', id: 't-3', number: 2231, name: 'OnyxTronix' },
    { entity: 'matches', id: 'm-1', event_id: 'ev-1', match_type: 'qualification', number: 12 },
    { entity: 'matches', id: 'm-71', event_id: 'ev-0', match_type: 'qualification', number: 71 },
    { entity: 'users', id: 'u-yael', full_name: 'Yael Shapira', role: 'scouter' },
    { entity: 'users', id: 'u-noa', full_name: 'Noa Levi', role: 'lead' },
  ]);
});

afterEach(() => {
  setSyncProgress(null);
});

const LEAD = { id: 'u-noa', role: 'lead' as Role };
const SCOUTER = { id: 'u-yael', role: 'scouter' as Role };

function renderPage(
  over: {
    eventId?: string | null;
    viewer?: { id: string; role: Role };
    syncNow?: () => Promise<unknown>;
  } = {},
) {
  return render(
    <MemoryRouter>
      <SyncPage
        eventId={over.eventId === undefined ? 'ev-1' : over.eventId}
        viewer={over.viewer ?? LEAD}
        syncNow={over.syncNow ?? vi.fn(async () => undefined)}
      />
    </MemoryRouter>,
  );
}

const records = () => document.querySelectorAll('[data-record]');
const record = (rowId: string) => document.querySelector<HTMLElement>(`[data-record="${rowId}"]`)!;
const tab = (name: RegExp) => screen.getByRole('tab', { name });

describe('SyncPage (SPEC-FINAL 9.10, 17-sync final)', () => {
  it('shows the waiting count and names each record by match and team', async () => {
    await enqueue(op('e-1'));
    renderPage();
    await waitFor(() => expect(records()).toHaveLength(1));
    expect(tab(/^Waiting\s*1$/)).toHaveAttribute('aria-selected', 'true');
    const row = record('e-1');
    expect(row).toHaveTextContent('Q12');
    expect(row).toHaveTextContent('2096');
    expect(row).toHaveTextContent('ROBACTIVE');
    expect(row).toHaveTextContent('Played');
    expect(row).toHaveTextContent('This device');
  });

  it('shows when the last successful sync was, in DD/MM/YYYY and 24-hour time', async () => {
    await setMeta('sync.last_success_at', '2026-11-14T09:31:02.000Z');
    renderPage();
    expect(await screen.findByText(/last sync 14\/11\/2026 \d\d:31/)).toBeInTheDocument();
  });

  it('says plainly that nothing is lost when there is nothing to sync', async () => {
    renderPage();
    expect(
      await screen.findByText(/everything on this device has reached the cloud/i),
    ).toBeInTheDocument();
  });

  it('runs a manual sync when asked, and says Sending… until it finishes', async () => {
    let finish!: () => void;
    const syncNow = vi.fn(() => new Promise<void>((done) => (finish = done)));
    const user = userEvent.setup();
    renderPage({ syncNow });
    await user.click(await screen.findByRole('button', { name: /sync now/i }));
    expect(syncNow).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    await act(async () => finish());
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeEnabled();
  });

  it('lists a refused record with the server’s words and its reason, and only Open entry', async () => {
    await enqueue(op('e-2'));
    await reject('e-2', 'edit-window-expired', 'this entry is locked — ask a lead');
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(records()).toHaveLength(1));
    // In Waiting, counted, with its reason line.
    expect(record('e-2').nextElementSibling).toHaveTextContent(
      'Not sent: This entry is locked — ask a lead. It was changed after its 5 minutes were up.',
    );
    await user.click(tab(/Problems/));
    expect(tab(/^Problems\s*1/)).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel', { name: 'Problems' });
    expect(within(panel).getByText(/This entry is locked — ask a lead\./)).toBeInTheDocument();
    const open = within(panel).getByRole('link', { name: 'Open entry' });
    expect(open).toHaveAttribute('href', '/entry/m-1/t-1?alliance=red');
    // No discard, no retry: one action only (SPEC-FINAL 9.10, 17-sync README).
    expect(within(panel).queryAllByRole('button')).toHaveLength(0);
    expect(within(panel).getAllByRole('link')).toHaveLength(1);
  });

  it('opens a refused super entry on its own route', async () => {
    await enqueue(
      op('s-1', {
        payload: {
          form_kind: 'super',
          match_id: null,
          alliance: null,
          robot_status: null,
          team_id: 't-2',
        },
      }),
    );
    await reject('s-1', 'invalid', 'form_version_id is required');
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('tab', { name: /Problems/ }));
    expect(screen.getByRole('link', { name: 'Open entry' })).toHaveAttribute('href', '/super/t-2');
    expect(record('s-1')).toHaveTextContent('SUPER');
  });

  it('lists a PARKED parent-deleted record under Problems like any refused one', async () => {
    await enqueue(op('e-pd'));
    await reject('e-pd', 'parent-deleted', 'the match no longer exists');
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('tab', { name: /Problems/ }));
    const panel = screen.getByRole('tabpanel', { name: 'Problems' });
    expect(within(panel).getByText(/The match no longer exists\./)).toBeInTheDocument();
    expect(within(panel).getByText(/Something it belongs to was deleted\./)).toBeInTheDocument();
  });

  it('puts the discarded notice under Problems, with the dot on its tab', async () => {
    await recordDiscarded(op('gone'), undefined, NOW);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(tab(/Problems/)).toHaveAccessibleName(/needs a look/));
    await user.click(tab(/Problems/));
    expect(await screen.findByRole('region', { name: 'Discarded entries' })).toHaveTextContent(
      '1 entry was removed from this device.',
    );
  });

  it('links to the conflict worklist with its open count, for a lead', async () => {
    await db.rows.bulkPut([
      { entity: 'sync_conflicts', id: 'c-1', event_id: 'ev-1', resolved_at: null },
      { entity: 'sync_conflicts', id: 'c-2', event_id: 'ev-1', resolved_at: NOW },
      { entity: 'sync_conflicts', id: 'c-3', event_id: 'ev-0', resolved_at: null },
    ]);
    renderPage();
    const link = await screen.findByRole('link', { name: /1 conflict to review/i });
    expect(link).toHaveAttribute('href', '/conflicts');
    expect(link).toHaveTextContent('Two copies of the same entry. A lead picks.');
  });

  it('hides the conflicts link from a scouter, and when none are open', async () => {
    await db.rows.put({ entity: 'sync_conflicts', id: 'c-1', event_id: 'ev-1', resolved_at: null });
    const { unmount } = renderPage({ viewer: SCOUTER });
    await screen.findByText(/reached the cloud/);
    expect(screen.queryByRole('link', { name: /conflict/i })).toBeNull();
    unmount();

    await db.rows.put({ entity: 'sync_conflicts', id: 'c-1', event_id: 'ev-1', resolved_at: NOW });
    renderPage();
    await screen.findByText(/reached the cloud/);
    expect(screen.queryByRole('link', { name: /conflict/i })).toBeNull();
  });

  it('lists exactly unsyncedCount() records across a mix, grouped this event first, no bare-match line', async () => {
    // A bare match created on this device, and the entry it carries.
    await enqueue({
      ...op('m-new'),
      entity: 'match',
      payload: { event_id: 'ev-1', match_type: 'qualification', number: 40 },
    });
    await db.rows.put({
      entity: 'matches',
      id: 'm-new',
      event_id: 'ev-1',
      match_type: 'qualification',
      number: 40,
    });
    await enqueue(op('e-new', { seq: 2, payload: { match_id: 'm-new' } }));
    // A refused record.
    await enqueue(op('e-ref', { seq: 3, payload: { team_id: 't-2' } }));
    await reject('e-ref', 'forbidden', 'the author is disabled');
    // A copy received by QR (SPEC-FINAL 9.8).
    await enqueue(op('e-qr', { seq: 4, payload: { team_id: 't-3' } }), 'qr');
    // An entry of an earlier event, left after a default move (spec 7.5 item 4).
    await enqueue(
      op('e-old', {
        seq: 5,
        client_updated_at: '2026-10-03T12:02:00.000Z',
        payload: { event_id: 'ev-0', match_id: 'm-71', team_id: 't-3' },
      }),
    );

    renderPage();
    await waitFor(() => expect(records()).toHaveLength(4));
    expect(records()).toHaveLength(await unsyncedCount());
    expect(tab(/^Waiting\s*4$/)).toBeInTheDocument();
    expect(document.querySelector('[data-record="m-new"]')).toBeNull();
    expect(record('e-new')).toHaveTextContent('New match — sends with this entry');
    expect(record('e-qr')).toHaveTextContent('QR · from Yael');

    const headings = screen
      .getAllByRole('row')
      .filter((r) => /event · \d/.test(r.textContent ?? ''));
    expect(headings.map((r) => r.textContent)).toEqual([
      'District #3 · Tel Avivthis event · 3',
      'District #2 · Haifaearlier event · 1',
    ]);
    // The earlier event's record sits under its own heading.
    const rows = screen.getAllByRole('row');
    expect(rows.indexOf(record('e-old') as HTMLTableRowElement)).toBeGreaterThan(
      rows.indexOf(headings[1] as HTMLTableRowElement),
    );
  });

  it('a refused record stays until a lead re-saves it; the count drops only on the ack', async () => {
    await enqueue(op('e-1'));
    await reject('e-1', 'forbidden', 'the author is disabled');
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(records()).toHaveLength(1));
    expect(tab(/^Problems\s*1/)).toBeInTheDocument();

    // The lead's re-save (EntryPage → submitEntry → enqueue).
    await act(async () => {
      await enqueue(
        op('e-1', { op_id: 'o-lead', action: 'update', base_version: 1, author_user_id: 'u-noa' }),
      );
    });
    await waitFor(() => expect(tab(/^Problems\s*0/)).toBeInTheDocument());
    expect(tab(/^Waiting\s*1$/)).toBeInTheDocument();

    await act(async () => {
      await ackResults([{ op_id: 'o-lead', status: 'applied', row_id: 'e-1', new_version: 1 }]);
    });
    await waitFor(() => expect(tab(/^Waiting\s*0$/)).toBeInTheDocument());
    // The cached row is what Sent shows.
    await db.rows.put({
      entity: 'scouting_entries',
      id: 'e-1',
      event_id: 'ev-1',
      match_id: 'm-1',
      team_id: 't-1',
      form_kind: 'match',
      alliance: 'red',
      robot_status: 'played',
      scouter_id: 'u-yael',
      client_updated_at: NOW,
      deleted_at: null,
    });
    await act(async () => {
      await ackResults([]);
    });
    await user.click(tab(/^Sent/));
    expect(await screen.findByText(/✓ sent/)).toBeInTheDocument();
  });

  it('shows the push progress while a sync runs, ticking off what it acked', async () => {
    await enqueue(op('e-a'));
    await enqueue(op('e-b', { seq: 2, payload: { team_id: 't-2' } }));
    await db.rows.put({
      entity: 'scouting_entries',
      id: 'e-a',
      event_id: 'ev-1',
      match_id: 'm-1',
      team_id: 't-1',
      form_kind: 'match',
      alliance: 'red',
      robot_status: 'played',
      client_updated_at: NOW,
      deleted_at: null,
    });
    renderPage();
    await waitFor(() => expect(records()).toHaveLength(2));

    await act(async () => {
      beginSync();
      setSyncProgress({ sent: 0, total: 2, acked: [] });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Sending…');
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(screen.getByText('0 of 2')).toBeInTheDocument();

    await act(async () => {
      await ackResults([{ op_id: 'o-e-a', status: 'applied', row_id: 'e-a', new_version: 1 }]);
      setSyncProgress({ sent: 1, total: 2, acked: ['e-a'] });
    });
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    await waitFor(() => expect(record('e-a')).toHaveTextContent(/✓ \d\d:\d\d/));
    expect(tab(/^Waiting\s*1$/)).toBeInTheDocument();

    await act(async () => endSync());
    await waitFor(() => expect(records()).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled();
  });

  it('More holds only the discarded log', async () => {
    await recordDiscarded(op('gone-1'), undefined, NOW);
    await recordDiscarded(op('gone-2', { op_id: 'o-gone-2' }), undefined, NOW);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'More' }));
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(1);
    await waitFor(() =>
      expect(items[0]).toHaveTextContent(
        'Discarded records2 removed because their event was deleted.',
      ),
    );
    expect(screen.queryByText(/QR/)).toBeNull();
    expect(screen.queryByText(/wipe/i)).toBeNull();
  });

  it('opens with no competition loaded and still lists what waits', async () => {
    await enqueue(op('e-1'));
    renderPage({ eventId: null });
    await waitFor(() => expect(records()).toHaveLength(1));
    expect(screen.getByRole('row', { name: /earlier event · 1/ })).toBeInTheDocument();
  });
});
