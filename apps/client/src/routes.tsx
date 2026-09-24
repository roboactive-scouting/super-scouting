import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { ChangePasswordPage } from '@/auth/ChangePasswordPage';
import { LoginPage } from '@/auth/LoginPage';
import { SwitchScouter } from '@/auth/SwitchScouter';
import { DesktopOnly } from '@/components/DesktopOnly';
import { UserDetailPage } from '@/features/admin/UserDetailPage';
import { UsersPage } from '@/features/admin/UsersPage';
import { AppShell } from '@/features/shell/AppShell';
import { useSignedInUser } from '@/features/shell/shellContext';
import { EntriesPage } from '@/features/entries/EntriesPage';
import { SelectRobotPage } from '@/features/entry/SelectRobotPage';
import { EntryRoute } from '@/features/entry/EntryRoute';

/*
 * The author of every local operation and the scouter of every new entry is the
 * signed-in user (SPEC-FINAL 7.5), handed down by AppShell — never a constant.
 */
function ScoutRoute({ eventId }: { eventId: string }) {
  return <SelectRobotPage eventId={eventId} author={useSignedInUser()} />;
}

function SignedInEntryRoute({ eventId }: { eventId: string }) {
  return <EntryRoute eventId={eventId} author={useSignedInUser()} />;
}

/** The route tree, separate from the router so tests can mount it in memory. */
export function routeTree(eventId: string): RouteObject[] {
  return [
    // Outside AppShell: they must render with no session, and leaving them remounts the
    // shell, which is what restarts sync after a sign-in.
    { path: '/login', element: <LoginPage /> },
    { path: '/change-password', element: <ChangePasswordPage /> },
    {
      path: '/',
      element: <AppShell eventId={eventId} />,
      children: [
        { index: true, element: <ScoutRoute eventId={eventId} /> },
        { path: 'entry/:matchId/:teamId', element: <SignedInEntryRoute eventId={eventId} /> },
        { path: 'entries', element: <EntriesPage eventId={eventId} /> },
        // Inside the shell: it needs a signed-in device, and never leaves the outbox.
        { path: 'switch-scouter', element: <SwitchScouter /> },
        // SPEC-FINAL 17.2: user administration is computer work. The pages check the role
        // themselves (7.4: device gating is not a permission), and the server again.
        {
          path: 'admin/users',
          element: (
            <DesktopOnly what="the user administration page">
              <UsersPage />
            </DesktopOnly>
          ),
        },
        {
          path: 'admin/users/:id',
          element: (
            <DesktopOnly what="the user administration page">
              <UserDetailPage />
            </DesktopOnly>
          ),
        },
      ],
    },
  ];
}

export function buildRouter(eventId: string) {
  return createBrowserRouter(routeTree(eventId));
}
