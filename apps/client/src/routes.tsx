import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { ChangePasswordPage } from '@/auth/ChangePasswordPage';
import { LoginPage } from '@/auth/LoginPage';
import { SwitchScouter } from '@/auth/SwitchScouter';
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
      ],
    },
  ];
}

export function buildRouter(eventId: string) {
  return createBrowserRouter(routeTree(eventId));
}
