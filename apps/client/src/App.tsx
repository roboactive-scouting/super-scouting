import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { buildRouter } from '@/routes';

/**
 * The router is built once, with no event id: AppShell resolves the event itself — from
 * the cached `app_settings`, or from the server's `getActiveContext` on a device that
 * holds none — and names "no competition is set up" when there is none (task 1.17b).
 */
export function App() {
  const [router] = useState(buildRouter);
  return <RouterProvider router={router} />;
}
