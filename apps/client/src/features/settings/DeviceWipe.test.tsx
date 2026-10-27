import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyChanged } from '@/data/changes';
import { db } from '@/data/db';
import { DeviceWipe, WIPE_PHRASE, WRONG_CODE_LINE } from './DeviceWipe';

vi.mock('@/config', () => ({
  clientConfig: () => ({
    apiBaseUrl: 'https://api.test',
    deviceWipeCode: 'WIPE2096',
    appVersion: '9b102cd',
    builtAt: '',
  }),
}));

const realMatchMedia = window.matchMedia;

async function queueEntries(n: number) {
  for (let seq = 1; seq <= n; seq++) {
    await db.outbox.put({
      op_id: `op-${seq}`,
      entity: 'scouting_entry',
      row_id: `r-${seq}`,
      action: 'create',
      base_version: null,
      payload: {},
      author_user_id: 'u-1',
      client_created_at: '2026-03-17T09:00:00.000Z',
      client_updated_at: '2026-03-17T09:00:00.000Z',
      seq,
    });
    await db.syncState.put({
      row_id: `r-${seq}`,
      sync_state: 'pending',
      acked_at: null,
      origin: 'local',
    });
  }
}

function renderWipe() {
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<DeviceWipe onClose={onClose} />} />
        <Route path="/sync/qr/send" element={<p>QR sender</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return onClose;
}

const wipeButton = () =>
  within(screen.getByRole('dialog', { name: 'Wipe this device?' })).getByRole('button', {
    name: 'Wipe this device',
  });

const queryWipeButton = () =>
  within(screen.getByRole('dialog', { name: 'Wipe this device?' })).queryByRole('button', {
    name: 'Wipe this device',
  });

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.put({ entity: 'events', id: 'ev-1', name: 'Israel District #1' });
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

describe('DeviceWipe (SPEC-FINAL 9.9, 17.8)', () => {
  it('is held while entries wait to send: no wipe button, Keep this device the footer alone, no code asked', async () => {
    await queueEntries(3);
    const onClose = renderWipe();
    const dialog = screen.getByRole('dialog', { name: 'Wipe this device?' });
    const held = await within(dialog).findByRole('status');
    expect(held).toHaveTextContent(
      '3 entries are still waiting to send. Wipe is held until they are sent, so nothing is lost.',
    );
    expect(within(held).getByText('3 entries are still waiting to send.').tagName).toBe('B');
    // Under the held line, the two ways out (v1.39); the footer is Keep this device alone: the
    // greyed Wipe this device beside a live Wipe anyway… read as two wipes (Phase 1 I side task 3).
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Wipe anyway…', 'Keep this device']);
    expect(within(dialog).getByRole('link', { name: 'Send by QR first' })).toHaveAttribute(
      'href',
      '/sync/qr/send',
    );
    expect(queryWipeButton()).toBeNull();
    expect(within(dialog).queryByLabelText('Lead’s code')).toBeNull();
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep this device' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('held: every action is one size and both rows are the shared full-width row (side task 3)', async () => {
    await queueEntries(3);
    renderWipe();
    const dialog = screen.getByRole('dialog', { name: 'Wipe this device?' });
    await within(dialog).findByRole('status');
    // Two rows, the held line's ways out and the footer, each the shared action row: full width
    // below 1024 px (so on a phone they share both edges), right-aligned at 1024 px and up.
    const rows = [...dialog.querySelectorAll<HTMLElement>('[data-surface-actions]')];
    expect(rows.map((r) => r.textContent)).toEqual([
      'Send by QR firstWipe anyway…',
      'Keep this device',
    ]);
    // The same row, spacing above it aside (the footer sits `mt-2` under the content).
    const layout = (r: HTMLElement) => r.className.replace(/\s*\bmt-\S+/g, '');
    for (const row of rows) expect(layout(row)).toBe(layout(rows[0]!));
    // Every action, the link drawn as a button too, carries the same size classes.
    const actions = rows.flatMap((r) => [...r.children]);
    expect(actions).toHaveLength(3);
    const size = (el: Element) =>
      el.className
        .split(/\s+/)
        .filter((c) => /(^|:)(min-h|flex-1|px|text-(base|\[)|w-full)/.test(c))
        .sort()
        .join(' ');
    for (const a of actions) expect(size(a)).toBe(size(actions[0]!));
    expect(size(actions[0]!)).toContain('max-lg:min-h-[52px]');
  });

  it('not held: Keep this device and the wipe, one row', async () => {
    renderWipe();
    await screen.findByLabelText('Lead’s code');
    const dialog = screen.getByRole('dialog', { name: 'Wipe this device?' });
    const rows = dialog.querySelectorAll('[data-surface-actions]');
    expect(rows).toHaveLength(1);
    expect(
      within(rows[0] as HTMLElement)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Keep this device', 'Wipe this device']);
  });

  it('enables the wipe only once the lead’s code and the typed phrase are both in', async () => {
    renderWipe();
    const code = await screen.findByLabelText('Lead’s code');
    const phrase = screen.getByRole('textbox', { name: `Type ${WIPE_PHRASE} to confirm` });
    expect(wipeButton()).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(phrase, WIPE_PHRASE);
    expect(wipeButton()).toHaveAttribute('aria-disabled', 'true');
    await userEvent.clear(phrase);
    await userEvent.type(code, 'WIPE2096');
    expect(wipeButton()).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(phrase, WIPE_PHRASE);
    expect(wipeButton()).not.toHaveAttribute('aria-disabled');
  });

  it('says so under the code when it is wrong, and wipes nothing', async () => {
    renderWipe();
    const code = await screen.findByLabelText('Lead’s code');
    await userEvent.type(code, 'WIPE2095');
    await userEvent.type(
      screen.getByRole('textbox', { name: `Type ${WIPE_PHRASE} to confirm` }),
      WIPE_PHRASE,
    );
    await userEvent.click(wipeButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(WRONG_CODE_LINE);
    expect(code).toHaveAttribute('aria-invalid', 'true');
    expect(await db.rows.count()).toBe(1);
    // Typing again clears the error.
    await userEvent.type(code, '6');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('turns held the moment something is queued while it is open (the count is live)', async () => {
    renderWipe();
    await screen.findByLabelText('Lead’s code');
    await queueEntries(1);
    notifyChanged('outbox');
    expect(await screen.findByRole('status')).toHaveTextContent(
      '1 entry is still waiting to send. Wipe is held until it is sent, so nothing is lost.',
    );
    expect(queryWipeButton()).toBeNull();
    expect(screen.queryByLabelText('Lead’s code')).toBeNull();
  });

  it('wipes the device with the right code', async () => {
    renderWipe();
    await userEvent.type(await screen.findByLabelText('Lead’s code'), 'WIPE2096');
    await userEvent.type(
      screen.getByRole('textbox', { name: `Type ${WIPE_PHRASE} to confirm` }),
      WIPE_PHRASE,
    );
    await userEvent.click(wipeButton());
    await waitFor(async () => expect(await db.rows.count()).toBe(0));
  });
});

describe('Wipe anyway (SPEC-FINAL 9.9 v1.39; Phase 1 H side task 2)', () => {
  const anywayDialog = () => screen.getByRole('dialog', { name: 'Wipe anyway?' });
  const anywayButton = () => within(anywayDialog()).getByRole('button', { name: 'Wipe anyway' });

  async function openAnyway() {
    await userEvent.click(await screen.findByRole('button', { name: 'Wipe anyway…' }));
    return anywayDialog();
  }

  it('the normal wipe is not drawn while held, so Wipe anyway is the only wipe on offer', async () => {
    await queueEntries(3);
    renderWipe();
    await screen.findByRole('button', { name: 'Wipe anyway…' });
    expect(queryWipeButton()).toBeNull();
    expect(await db.outbox.count()).toBe(3);
  });

  it('Send by QR first opens the sender', async () => {
    await queueEntries(2);
    renderWipe();
    await userEvent.click(await screen.findByRole('link', { name: 'Send by QR first' }));
    expect(await screen.findByText('QR sender')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks for the loss, the code and the typed count; Keep this device first', async () => {
    await queueEntries(3);
    const onClose = renderWipe();
    const dialog = await openAnyway();
    expect(dialog).toHaveTextContent(
      '3 records have not reached the cloud. Wiping now deletes them for good.',
    );
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Keep this device', 'Wipe anyway']);
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Keep this device' }),
    );
    const code = within(dialog).getByLabelText('Lead’s code');
    const count = within(dialog).getByRole('textbox', { name: 'Type 3 to confirm' });
    expect(anywayButton()).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(count, '3');
    expect(anywayButton()).toHaveAttribute('aria-disabled', 'true');
    await userEvent.clear(count);
    await userEvent.type(code, 'WIPE2096');
    expect(anywayButton()).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(count, '2');
    expect(anywayButton()).toHaveAttribute('aria-disabled', 'true');
    await userEvent.clear(count);
    await userEvent.type(count, '3');
    expect(anywayButton()).not.toHaveAttribute('aria-disabled');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep this device' }));
    expect(onClose).toHaveBeenCalled();
    expect(await db.outbox.count()).toBe(3);
  });

  it('says 1 record in the singular', async () => {
    await queueEntries(1);
    renderWipe();
    expect(await openAnyway()).toHaveTextContent(
      '1 record has not reached the cloud. Wiping now deletes it for good.',
    );
  });

  it('a wrong code wipes nothing and says so', async () => {
    await queueEntries(3);
    renderWipe();
    const dialog = await openAnyway();
    await userEvent.type(within(dialog).getByLabelText('Lead’s code'), 'WIPE2095');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Type 3 to confirm' }), '3');
    await userEvent.click(anywayButton());
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(WRONG_CODE_LINE);
    expect(await db.outbox.count()).toBe(3);
    expect(await db.discarded.count()).toBe(0);
  });

  it('a record saved after the count was typed turns the confirm off again', async () => {
    await queueEntries(3);
    renderWipe();
    const dialog = await openAnyway();
    await userEvent.type(within(dialog).getByLabelText('Lead’s code'), 'WIPE2096');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Type 3 to confirm' }), '3');
    expect(anywayButton()).not.toHaveAttribute('aria-disabled');
    await queueEntries(4);
    notifyChanged('outbox');
    expect(
      await within(dialog).findByText(
        '4 records have not reached the cloud. Wiping now deletes them for good.',
      ),
    ).toBeInTheDocument();
    expect(anywayButton()).toHaveAttribute('aria-disabled', 'true');
    expect(await db.discarded.count()).toBe(0);
  });

  it('with the right code and count: one log row per lost record, then the device is empty', async () => {
    await queueEntries(3);
    renderWipe();
    const dialog = await openAnyway();
    await userEvent.type(within(dialog).getByLabelText('Lead’s code'), 'WIPE2096');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Type 3 to confirm' }), '3');
    await userEvent.click(anywayButton());
    await waitFor(async () => expect(await db.outbox.count()).toBe(0));
    expect(await db.rows.count()).toBe(0);
    expect(await db.syncState.count()).toBe(0);
    const log = await db.discarded.toArray();
    expect(log.map((r) => r.row_id).sort()).toEqual(['r-1', 'r-2', 'r-3']);
    expect(log.every((r) => r.reason === 'Wiped before it reached the cloud.')).toBe(true);
  });
});
