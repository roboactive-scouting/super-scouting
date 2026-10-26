import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Operation, Role } from '@frc/shared';
import { beginSync, endSync, setSyncProgress } from '@/data/connection';
import { db, setMeta, type PushRejection } from '@/data/db';
import { recordDiscarded } from '@/data/discarded';
import { ackResults, enqueue, unsyncedCount } from '@/data/outbox';
import { receiveOperations } from '@/data/qrReceive';
import { SyncPage } from './SyncPage';
import type * as QrReceiveModule from '@/data/qrReceive';

/** When set, Discard received QR data fails (review m8): its transaction removed nothing. */
const discardFails = vi.hoisted(() => ({ on: false }));
vi.mock('@/data/qrReceive', async (original) => {
  const real = await original<typeof QrReceiveModule>();
  return {
    ...real,
    discardReceivedQrData: () =>
      discardFails.on ? Promise.reject(new Error('quota')) : real.discardReceivedQrData(),
  };
});

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
  discardFails.on = false;
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

  const EDIT_WINDOW_LINE =
    'Not sent: Changed after the 5-minute edit window. A lead can save it for you.';

  it('lists a refused record in one line that says what happened, and only Open entry', async () => {
    await enqueue(op('e-2'));
    await reject(
      'e-2',
      'edit-window-expired',
      'changed after the 5-minute edit window. A lead can save it for you.',
    );
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(records()).toHaveLength(1));
    // In Waiting, counted, with its one line: no second "why" sentence (SPEC-FINAL 7.6, v1.44).
    expect(record('e-2').nextElementSibling!.querySelector('p')!.textContent).toBe(
      EDIT_WINDOW_LINE,
    );
    await user.click(tab(/Problems/));
    expect(tab(/^Problems\s*1/)).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel', { name: 'Problems' });
    expect(
      within(panel).getByText(
        (_, el) => el?.tagName === 'P' && el.textContent === EDIT_WINDOW_LINE,
      ),
    ).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(/locked|5 minutes were up/);
    const open = within(panel).getByRole('link', { name: 'Open entry' });
    expect(open).toHaveAttribute('href', '/entry/m-1/t-1?alliance=red');
    // No discard, no retry: one action only (SPEC-FINAL 9.10, 17-sync README).
    expect(within(panel).queryAllByRole('button')).toHaveLength(0);
    expect(within(panel).getAllByRole('link')).toHaveLength(1);
  });

  it('reads the new line for a record the server refused in its old words', async () => {
    await enqueue(op('e-2'));
    await reject('e-2', 'edit-window-expired', 'this entry is locked — ask a lead');
    renderPage();
    await waitFor(() => expect(records()).toHaveLength(1));
    expect(record('e-2').nextElementSibling!.querySelector('p')!.textContent).toBe(
      EDIT_WINDOW_LINE,
    );
  });

  it('keeps the server’s words and the why for any other refusal', async () => {
    await enqueue(op('e-2'));
    await reject('e-2', 'forbidden', 'a scouter may edit only their own entry');
    renderPage();
    await waitFor(() => expect(records()).toHaveLength(1));
    expect(record('e-2').nextElementSibling!.querySelector('p')!.textContent).toBe(
      'Not sent: A scouter may edit only their own entry. The account that saved it isn’t allowed to make this change.',
    );
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

  it('More holds Send by QR, Receive by QR, the discarded log and Discard received QR data', async () => {
    await recordDiscarded(op('gone-1'), undefined, NOW);
    await recordDiscarded(op('gone-2', { op_id: 'o-gone-2' }), undefined, NOW);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'More' }));
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Send by QRTo the collector tablet. No internet needed.');
    expect(items[1]).toHaveTextContent('Receive by QROn the collector tablet: scan another phone.');
    await waitFor(() =>
      expect(items[2]).toHaveTextContent(
        'Discarded records2 removed because their event was deleted.',
      ),
    );
    // Nothing received: the escape hatch is there, held, and says why.
    expect(items[3]).toHaveTextContent('Discard received QR dataNothing received by QR is on');
    expect(items[3]).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText(/wipe/i)).toBeNull();
  });

  it('says "shown by QR hh:mm" on a waiting record the QR sender showed, which still waits', async () => {
    await enqueue(op('e-1'));
    await enqueue(op('e-2', { op_id: 'o-e-2', seq: 2, payload: { team_id: 't-2' } }));
    await db.syncState.update('e-1', { qr_shown_at: NOW });
    renderPage();
    await waitFor(() => expect(records()).toHaveLength(2));
    expect(record('e-1')).toHaveTextContent(/shown by QR \d\d:\d\d/);
    expect(record('e-2')).not.toHaveTextContent(/shown by QR/);
    expect(tab(/^Waiting\s*2$/)).toBeInTheDocument();
  });

  it('opens with no competition loaded and still lists what waits', async () => {
    await enqueue(op('e-1'));
    renderPage({ eventId: null });
    await waitFor(() => expect(records()).toHaveLength(1));
    expect(screen.getByRole('row', { name: /earlier event · 1/ })).toBeInTheDocument();
  });
});

/** A copy another phone sent by QR (SPEC-FINAL 9.8), authored by `author`. */
const copy = (rowId: string, author: string, over: Partial<Operation> = {}) =>
  op(rowId, { author_user_id: author, payload: { scouter_id: author, team_id: 't-2' }, ...over });

describe('SyncPage: received QR copies (SPEC-FINAL 9.8, 9.10; task 1.48)', () => {
  beforeEach(async () => {
    await db.rows.bulkPut([
      { entity: 'users', id: 'u-omer', full_name: 'Omer Katz', role: 'scouter' },
    ]);
  });

  it('opens Waiting with a Received by QR block: the count by author, each with the last scan', async () => {
    await receiveOperations(
      [copy('q-1', 'u-yael'), copy('q-2', 'u-yael', { seq: 2 }), copy('q-3', 'u-omer', { seq: 3 })],
      new Date(Date.now() - 60_000).toISOString(),
    );
    await receiveOperations(
      [copy('q-4', 'u-unknown', { seq: 4 })],
      new Date(Date.now() - 600_000).toISOString(),
    );
    await enqueue(op('mine', { seq: 9 }));
    renderPage();
    const block = await screen.findByRole('region', { name: 'Received by QR' });
    expect(block).toHaveTextContent('4 from 3 scouters');
    const rows = within(block).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/^YSYael Shapiralast scan \S+2$/);
    expect(rows[1]).toHaveTextContent(/^OKOmer Katzlast scan \S+1$/);
    // An author this device does not hold.
    expect(rows[2]).toHaveTextContent(/a scouterlast scan \S+1$/);
    // The waiting list still counts every record, the copies among them.
    await waitFor(() => expect(tab(/^Waiting\s*5$/)).toBeInTheDocument());
  });

  it('drops an acked copy from the block, says so in a success notice, and keeps it under Sent', async () => {
    await receiveOperations([copy('q-1', 'u-yael'), copy('q-2', 'u-omer', { seq: 2 })]);
    await ackResults([{ op_id: 'o-q-1', status: 'applied', row_id: 'q-1', new_version: 1 }]);
    const user = userEvent.setup();
    renderPage();
    const block = await screen.findByRole('region', { name: 'Received by QR' });
    await waitFor(() => expect(block).toHaveTextContent('1 from 1 scouter'));
    expect(screen.getByText('1 received copy reached the cloud.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByText(/reached the cloud\./)).toBeNull());
    await user.click(tab(/^Sent/));
    expect(record('q-1')).toHaveTextContent('QR · from Yael');
  });

  it('holds Discard received QR data while a received copy has no ack, and removes nothing', async () => {
    await receiveOperations([copy('q-1', 'u-yael')]);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'More' }));
    const discard = screen.getAllByRole('menuitem')[3]!;
    await waitFor(() =>
      expect(discard).toHaveTextContent(
        'Discard received QR dataHeld: 1 received copy hasn’t reached the cloud.',
      ),
    );
    expect(discard).toHaveAttribute('aria-disabled', 'true');
    await user.click(discard);
    expect(screen.queryByRole('dialog', { name: 'Discard received QR data?' })).toBeNull();
    expect(await db.rows.get(['scouting_entries', 'q-1'])).toBeDefined();
  });

  it('discards acked copies after the destructive confirmation, and says how many', async () => {
    await enqueue(op('mine'));
    await ackResults([{ op_id: 'o-mine', status: 'applied', row_id: 'mine', new_version: 1 }]);
    await db.rows.put({ entity: 'scouting_entries', id: 'mine', event_id: 'ev-1', team_id: 't-1' });
    await receiveOperations([copy('q-1', 'u-yael'), copy('q-2', 'u-omer', { seq: 2 })]);
    await ackResults([
      { op_id: 'o-q-1', status: 'applied', row_id: 'q-1', new_version: 1 },
      { op_id: 'o-q-2', status: 'applied', row_id: 'q-2', new_version: 1 },
    ]);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'More' }));
    const discard = screen.getAllByRole('menuitem')[3]!;
    await waitFor(() => expect(discard).not.toHaveAttribute('aria-disabled'));
    expect(discard).toHaveTextContent('Removes 2 received copies already in the cloud.');
    await user.click(discard);
    const dialog = await screen.findByRole('dialog', { name: 'Discard received QR data?' });
    await user.click(within(dialog).getByRole('button', { name: 'Discard 2 received copies' }));
    expect(
      await screen.findByText('Removed 2 received copies from this device.'),
    ).toBeInTheDocument();
    expect(await db.rows.get(['scouting_entries', 'q-1'])).toBeUndefined();
    expect(await db.rows.get(['scouting_entries', 'mine'])).toBeDefined();
  });

  it('says so when Discard fails, rather than closing in silence', async () => {
    await receiveOperations([copy('q-1', 'u-yael')]);
    await ackResults([{ op_id: 'o-q-1', status: 'applied', row_id: 'q-1', new_version: 1 }]);
    discardFails.on = true;
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'More' }));
    const discard = screen.getAllByRole('menuitem')[3]!;
    await waitFor(() => expect(discard).not.toHaveAttribute('aria-disabled'));
    await user.click(discard);
    const dialog = await screen.findByRole('dialog', { name: 'Discard received QR data?' });
    await user.click(within(dialog).getByRole('button', { name: 'Discard 1 received copy' }));
    expect(
      await screen.findByText('Discard did not finish. Nothing was removed.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Discard received QR data?' })).toBeNull();
    expect(await db.rows.get(['scouting_entries', 'q-1'])).toBeDefined();
  });
});
