import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { cachedRows } from '@/data/cache';
import { buildRouter } from '@/routes';

/**
 * SEED.event from packages/db/src/seed/fixtures.ts — the phase-0 seed script's
 * deterministic event id, live in the dev Supabase project this whole phase runs
 * against. Used only until the first hydration writes a real `app_settings` row.
 */
const FALLBACK_EVENT_ID = '00000000-0000-4000-8000-000000000002';

export function App() {
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const rows = await cachedRows<{ active_event_id: string | null }>('app_settings');
      setEventId(rows[0]?.active_event_id ?? FALLBACK_EVENT_ID);
    })();
  }, []);

  if (eventId === null) return null;

  return <RouterProvider router={buildRouter(eventId)} />;
}
