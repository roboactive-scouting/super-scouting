import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_CALL_TIMEOUT_MS, rpc } from '@/data/rpc';
import { ManagePage } from './ManagePage';

vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

const UUID = '00000000-0000-4000-8000-000000000001';

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Manage page fix: with no `rpc` prop, the Manage page talks through the default transport —
 * and that passes the shared deadline, so a hung call lands in the unreachable state
 * instead of spinning forever.
 */
describe('the Manage page’s default rpc', () => {
  // The tabs take the page's `rpc` (RB.16/RB.17): only the page has a default to check.
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
    await screen.findByRole('tab', { name: 'Competitions' });
    await waitFor(() => expect(transport).toHaveBeenCalled());
    for (const [, , options] of transport.mock.calls) {
      expect(options).toEqual({ timeoutMs: ADMIN_CALL_TIMEOUT_MS });
    }
  });
});
