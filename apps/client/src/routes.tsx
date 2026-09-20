import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/features/shell/AppShell';
import { EntriesPage } from '@/features/entries/EntriesPage';
import { SelectRobotPage } from '@/features/entry/SelectRobotPage';
import { EntryRoute } from '@/features/entry/EntryRoute';

/**
 * SEED.scouter from packages/db/src/seed/fixtures.ts. Phase 1A has no login yet — the
 * bearer-token auth that would replace this lands in phase 1B (see docs/plans/
 * DEVIATIONS.md, task 1.4's `callerFor` note) — so every locally authored operation
 * and entry in the walking skeleton is attributed to this seeded scouter.
 */
const AUTHOR_USER_ID = '00000000-0000-4000-8000-000000000006';

export function buildRouter(eventId: string) {
  return createBrowserRouter([
    {
      path: '/',
      element: <AppShell eventId={eventId} />,
      children: [
        {
          index: true,
          element: <SelectRobotPage eventId={eventId} authorUserId={AUTHOR_USER_ID} />,
        },
        {
          path: 'entry/:matchId/:teamId',
          element: <EntryRoute eventId={eventId} authorUserId={AUTHOR_USER_ID} />,
        },
        { path: 'entries', element: <EntriesPage eventId={eventId} /> },
      ],
    },
  ]);
}
