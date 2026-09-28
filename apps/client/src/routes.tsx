import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { ChangePasswordPage } from '@/auth/ChangePasswordPage';
import { LoginPage } from '@/auth/LoginPage';
import { SwitchScouter } from '@/auth/SwitchScouter';
import { DesktopOnly } from '@/components/DesktopOnly';
import { ManagePage } from '@/features/admin/ManagePage';
import { UserDetailPage } from '@/features/admin/UserDetailPage';
import { UsersPage } from '@/features/admin/UsersPage';
import { ContextPage } from '@/features/context/ContextPage';
import { OverrideGuard } from '@/features/context/OverrideGuard';
import { AppShell } from '@/features/shell/AppShell';
import { NO_HYDRATION, useActiveEventId, useSignedInUser } from '@/features/shell/shellContext';
import { EntriesPage } from '@/features/entries/EntriesPage';
import { SelectRobotPage } from '@/features/entry/SelectRobotPage';
import { EntryRoute } from '@/features/entry/EntryRoute';

/*
 * The author of every local operation and the scouter of every new entry is the
 * signed-in user (SPEC-FINAL 7.5), handed down by AppShell — never a constant. So is the
 * event: AppShell resolves it (cache first, then the server's active context) and hands it
 * down; it is never a route-tree argument (task 1.17b).
 */
/*
 * SPEC-FINAL 6.3: no new entry while a session override is in effect. Both routes that
 * create entries are guarded here, whatever the nav offers (task 1.22).
 */
function ScoutRoute() {
  const eventId = useActiveEventId();
  return (
    <OverrideGuard defaultEventId={eventId}>
      <SelectRobotPage eventId={eventId} author={useSignedInUser()} />
    </OverrideGuard>
  );
}

function SignedInEntryRoute() {
  const eventId = useActiveEventId();
  return (
    <OverrideGuard defaultEventId={eventId}>
      <EntryRoute eventId={eventId} author={useSignedInUser()} />
    </OverrideGuard>
  );
}

function EntriesRoute() {
  return <EntriesPage eventId={useActiveEventId()} />;
}

/**
 * The route tree, separate from the router so tests can mount it in memory.
 *
 * Every route under AppShell waits for the event to load unless it carries
 * `handle: NO_HYDRATION` — mark only a route that reads no event data (task 1.17b).
 */
export function routeTree(): RouteObject[] {
  return [
    // Outside AppShell: they must render with no session, and leaving them remounts the
    // shell, which is what restarts sync after a sign-in.
    { path: '/login', element: <LoginPage /> },
    { path: '/change-password', element: <ChangePasswordPage /> },
    {
      path: '/',
      element: <AppShell />,
      children: [
        { index: true, element: <ScoutRoute /> },
        { path: 'entry/:matchId/:teamId', element: <SignedInEntryRoute /> },
        { path: 'entries', element: <EntriesRoute /> },
        // Inside the shell: it needs a signed-in device, and never leaves the outbox. It
        // reads only the cached accounts, so it works before any event is loaded.
        { path: 'switch-scouter', element: <SwitchScouter />, handle: NO_HYDRATION },
        // Task 1.22, SPEC-FINAL 6.3: the context page, the one place the session-only
        // override is chosen. Every role, not desktop-only. It reads the cache and the
        // server itself (never useActiveEventId), so it renders with no event loaded.
        { path: 'context', element: <ContextPage />, handle: NO_HYDRATION },
        // SPEC-FINAL 17.2: user administration is computer work. The pages check the role
        // themselves (7.4: device gating is not a permission), and the server again. They
        // read no event data, so an admin reaches them on an install with no competition.
        {
          path: 'admin/users',
          handle: NO_HYDRATION,
          element: (
            <DesktopOnly what="the user administration page">
              <UsersPage />
            </DesktopOnly>
          ),
        },
        {
          path: 'admin/users/:id',
          handle: NO_HYDRATION,
          element: (
            <DesktopOnly what="the user administration page">
              <UserDetailPage />
            </DesktopOnly>
          ),
        },
        // Task 1.20: season and event management. Reads no event data either, so an
        // admin reaches it — and can set the very first competition up — with no
        // competition loaded (it is NoCompetition's "Set up a competition" link's target).
        {
          path: 'admin/manage',
          handle: NO_HYDRATION,
          element: (
            <DesktopOnly what="season, event, roster and match management">
              <ManagePage />
            </DesktopOnly>
          ),
        },
      ],
    },
  ];
}

export function buildRouter() {
  return createBrowserRouter(routeTree());
}
