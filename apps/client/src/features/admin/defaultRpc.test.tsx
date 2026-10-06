import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_CALL_TIMEOUT_MS, rpc } from '@/data/rpc';
import { EventsPanel } from './EventsPanel';
import { ManagePage } from './ManagePage';
import { MatchesPanel } from './MatchesPanel';
import { SeasonsPanel } from './SeasonsPanel';
import { TeamsPanel } from './TeamsPanel';

vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

const UUID = '00000000-0000-4000-8000-000000000001';

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Manage page fix: with no `rpc` prop, every admin panel talks through the default
 * transport — and that passes the shared deadline, so a hung call lands in the panel's own
 * unreachable state instead of spinning forever.
 */
describe('the admin panels’ default rpc', () => {
  it.each([
    ['SeasonsPanel', <SeasonsPanel />],
    ['EventsPanel', <EventsPanel seasonId={UUID} />],
    ['TeamsPanel', <TeamsPanel eventId={UUID} />],
    ['MatchesPanel', <MatchesPanel eventId={UUID} />],
  ])('%s calls with the admin deadline', async (_name, panel) => {
    const transport = vi.spyOn(rpc, 'call').mockImplementation(() => new Promise(() => {}));
    render(panel);
    await waitFor(() => expect(transport).toHaveBeenCalled());
    for (const [, , options] of transport.mock.calls) {
      expect(options).toEqual({ timeoutMs: ADMIN_CALL_TIMEOUT_MS });
    }
  });

  it('ManagePage calls with the admin deadline', async () => {
    const transport = vi.spyOn(rpc, 'call').mockImplementation(() => new Promise(() => {}));
    const user = {
      id: UUID,
      username: 'seed_user',
      full_name: 'Seed User',
      role: 'admin',
      must_change_password: false,
    };
    const router = createMemoryRouter([
      {
        path: '/',
        element: <Outlet context={{ user, expired: false, eventId: null }} />,
        children: [{ index: true, element: <ManagePage /> }],
      },
    ]);
    render(<RouterProvider router={router} />);
    await screen.findByRole('tab', { name: 'Seasons' });
    await waitFor(() => expect(transport).toHaveBeenCalled());
    for (const [, , options] of transport.mock.calls) {
      expect(options).toEqual({ timeoutMs: ADMIN_CALL_TIMEOUT_MS });
    }
  });
});
