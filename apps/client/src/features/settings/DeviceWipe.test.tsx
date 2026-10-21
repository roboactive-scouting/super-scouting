import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  render(<DeviceWipe onClose={onClose} />);
  return onClose;
}

const wipeButton = () =>
  within(screen.getByRole('dialog', { name: 'Wipe this device?' })).getByRole('button', {
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
  it('is held while entries wait to send: Keep this device first, the wipe off, no code asked', async () => {
    await queueEntries(3);
    const onClose = renderWipe();
    const dialog = screen.getByRole('dialog', { name: 'Wipe this device?' });
    const held = await within(dialog).findByRole('status');
    expect(held).toHaveTextContent(
      '3 entries are still waiting to send. Wipe is held until they are sent, so nothing is lost.',
    );
    expect(within(held).getByText('3 entries are still waiting to send.').tagName).toBe('B');
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Keep this device', 'Wipe this device']);
    expect(wipeButton()).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog).queryByLabelText('Lead’s code')).toBeNull();
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep this device' }));
    expect(onClose).toHaveBeenCalled();
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
    expect(wipeButton()).toHaveAttribute('aria-disabled', 'true');
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
