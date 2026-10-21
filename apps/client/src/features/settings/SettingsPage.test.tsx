import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { clearDevicePrefs, keepScreenOn, vibrateOnTap } from '@/lib/devicePrefs';
import { SettingsPage } from './SettingsPage';
import { textScale, theme } from './theme';

vi.mock('@/config', () => ({
  clientConfig: () => ({
    apiBaseUrl: 'https://api.test',
    deviceWipeCode: 'w',
    appVersion: '9b102cd',
  }),
}));

const realMatchMedia = window.matchMedia;
const nav = navigator as { vibrate?: unknown };

function setWidth(px: number) {
  window.matchMedia = ((query: string) => ({
    matches: px >= 1024,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function setVibrate(can: boolean) {
  if (can) {
    Object.defineProperty(navigator, 'vibrate', {
      value: () => true,
      configurable: true,
      writable: true,
    });
  } else {
    delete nav.vibrate;
  }
}

const USER = {
  id: 'u-1',
  username: 'noa',
  full_name: 'Noa Levi',
  role: 'lead' as const,
  must_change_password: false,
};
const EVENT = '00000000-0000-4000-8000-0000000000e1';

function renderSettings(eventId: string | null = EVENT) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Outlet context={{ user: USER, expired: false, eventId, gate: 'fresh' }} />,
      children: [{ index: true, element: <SettingsPage /> }],
    },
  ]);
  render(<RouterProvider router={router} />);
}

async function queueEntries(n: number) {
  for (let seq = 1; seq <= n; seq++) {
    await db.outbox.put({
      op_id: `op-${seq}`,
      entity: 'scouting_entry',
      row_id: `r-${seq}`,
      action: 'create',
      base_version: null,
      payload: {},
      author_user_id: USER.id,
      client_created_at: '2026-03-17T09:00:00.000Z',
      client_updated_at: '2026-03-17T09:00:00.000Z',
      seq,
    } as never);
    await db.syncState.put({
      row_id: `r-${seq}`,
      sync_state: 'pending',
      acked_at: null,
      origin: 'local',
    });
  }
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  clearDevicePrefs();
  document.documentElement.dataset.theme = 'light';
  document.documentElement.style.removeProperty('--text-scale');
  await db.rows.put({ entity: 'events', id: EVENT, name: 'Israel District #1' } as never);
  setVibrate(true);
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  delete nav.vibrate;
});

describe('Settings (SPEC-FINAL 8.6, 17.9)', () => {
  it('lists the rows with their values, and who, where and which version', async () => {
    setWidth(375);
    await textScale.set(1.15);
    renderSettings();
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    expect(
      screen.getByText('For this device only. Nothing here changes other phones.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Theme\s*Light/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Text size\s*115%/ })).toBeInTheDocument();
    expect(screen.getByText('Noa Levi · Scout lead')).toBeInTheDocument();
    expect(await screen.findByText(/Israel District #1/)).toBeInTheDocument();
    expect(screen.getByText('9b102cd')).toBeInTheDocument();
  });

  it('offers every theme, and picking one switches the whole app at once', async () => {
    setWidth(375);
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: /Theme/ }));
    const sheet = screen.getByRole('dialog', { name: 'Theme' });
    const tiles = within(sheet).getByRole('radiogroup', { name: 'Theme' });
    const options = within(tiles).getAllByRole('radio');
    expect(options.map((o) => (o as HTMLInputElement).value)).toEqual([...theme.options]);
    expect(within(sheet).getByText('Black on white, stronger colours, for sunlight')).toBeVisible();
    // The live example: the entry's own counter and option buttons.
    expect(
      within(sheet).getByRole('button', { name: 'Pieces scored high plus one' }),
    ).toBeVisible();
    expect(within(sheet).getByRole('group', { name: 'Climb level' })).toBeVisible();
    await userEvent.click(within(tiles).getByRole('radio', { name: /Outdoor/ }));
    expect(document.documentElement.dataset.theme).toBe('outdoor');
    expect(theme.get()).toBe('outdoor');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /Theme\s*Outdoor/ })).toBeInTheDocument();
  });

  it('offers the four text steps, on top of the phone’s own size', async () => {
    setWidth(375);
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: /Text size/ }));
    const sheet = screen.getByRole('dialog', { name: 'Text size' });
    expect(within(sheet).getByText('On top of your phone’s own text size.')).toBeVisible();
    const steps = within(sheet).getByRole('radiogroup', { name: 'Text size' });
    expect(
      within(steps)
        .getAllByRole('radio')
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual(['100%', '115%', '130%', '150%']);
    expect(within(steps).getByRole('radio', { name: '100%' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(within(steps).getByRole('radio', { name: '150%' }));
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.5');
    expect(within(steps).getByRole('radio', { name: '150%' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('saves a switch the moment it is switched, with no Save button', async () => {
    setWidth(375);
    renderSettings();
    const screenOn = screen.getByRole('switch', { name: /Keep the screen on/ });
    expect(screenOn).toBeChecked();
    await userEvent.click(screenOn);
    expect(keepScreenOn.get()).toBe(false);
    expect(screenOn).not.toBeChecked();
    const vibrate = screen.getByRole('switch', { name: /Vibrate on taps/ });
    expect(vibrate).toBeChecked();
    await userEvent.click(vibrate);
    expect(vibrateOnTap.get()).toBe(false);
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();
  });

  it('disables Vibrate on taps where the phone cannot vibrate, and says so', () => {
    setWidth(375);
    setVibrate(false);
    renderSettings();
    const vibrate = screen.getByRole('switch', { name: /Vibrate on taps/ });
    expect(vibrate).toBeDisabled();
    expect(vibrate).not.toBeChecked();
    expect(screen.getByText('this phone can’t vibrate')).toBeInTheDocument();
  });

  it('holds Wipe this device while entries wait to send', async () => {
    setWidth(375);
    await queueEntries(3);
    renderSettings();
    const row = await screen.findByRole('button', {
      name: /Wipe this device\s*held: 3 entries waiting to send/,
    });
    await userEvent.click(row);
    // The confirmation is its own chunk (task 1.49), loaded as it opens.
    const confirm = await screen.findByRole('dialog', { name: 'Wipe this device?' });
    const buttons = within(confirm).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Keep this device', 'Wipe this device']);
    expect(await within(confirm).findByRole('status')).toHaveTextContent(
      '3 entries are still waiting to send. Wipe is held until they are sent, so nothing is lost.',
    );
    expect(within(confirm).getByRole('button', { name: 'Wipe this device' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.click(within(confirm).getByRole('button', { name: 'Keep this device' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('holds the wipe for an unfinished entry too, but never for a practice draft', async () => {
    setWidth(375);
    await db.practiceDrafts.put({ key: 'p', row_id: '', payload: {}, updated_at: 'x' });
    renderSettings();
    expect(
      await screen.findByRole('button', {
        name: /Wipe this device\s*removes everything this app keeps here/,
      }),
    ).toBeInTheDocument();
    await db.drafts.put({ key: 'v:m:t', row_id: '', payload: {}, updated_at: 'x' });
    // A queued entry re-reads the hold (drafts are read with it).
    await queueEntries(1);
    const { notifyChanged } = await import('@/data/changes');
    notifyChanged('outbox');
    expect(
      await screen.findByRole('button', {
        name: /held: 1 entry waiting to send, 1 unfinished entry/,
      }),
    ).toBeInTheDocument();
  });

  it('asks for the lead’s code and the typed phrase with nothing waiting (task 1.49)', async () => {
    setWidth(375);
    renderSettings();
    await userEvent.click(
      await screen.findByRole('button', {
        name: /Wipe this device\s*removes everything this app keeps here/,
      }),
    );
    const confirm = await screen.findByRole('dialog', { name: 'Wipe this device?' });
    expect(await within(confirm).findByLabelText('Lead’s code')).toBeInTheDocument();
    expect(
      within(confirm).getByRole('textbox', { name: 'Type wipe this device to confirm' }),
    ).toBeInTheDocument();
    expect(within(confirm).getByRole('button', { name: 'Wipe this device' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it.each([375, 768, 1024, 1440])('works at %i px wide', async (px) => {
    setWidth(px);
    renderSettings(px === 768 ? null : EVENT);
    for (const name of [/Theme/, /Text size/, /Wipe this device/]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: /Text size/ }));
    const choice = screen.getByRole('dialog', { name: 'Text size' });
    // A dialog on a computer, a bottom sheet on a phone (ResponsiveDialog).
    await waitFor(() =>
      expect(choice.closest('[data-surface="dialog"]') !== null).toBe(px >= 1024),
    );
    expect(
      within(choice).getByText(
        px >= 1024
          ? 'On top of your system’s own text size.'
          : 'On top of your phone’s own text size.',
      ),
    ).toBeInTheDocument();
  });
});
