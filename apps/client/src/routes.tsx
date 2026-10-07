import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { DesktopOnly } from '@/components/DesktopOnly';
import { Skeleton } from '@/components/Skeleton';
import { OverrideGuard } from '@/features/context/OverrideGuard';
import { AppShell } from '@/features/shell/AppShell';
import { NO_HYDRATION, useActiveEventId, useSignedInUser } from '@/features/shell/shellContext';
import { EntriesPage } from '@/features/entries/EntriesPage';
import { HomePage } from '@/features/home/HomePage';
import { SelectRobotPage } from '@/features/entry/SelectRobotPage';
import { EntryRoute } from '@/features/entry/EntryRoute';
import type { PageHandle } from '@/lib/pageTitle';
import { PATHS } from '@/lib/paths';

/*
 * Sign-in and the admin pages load on first use (redesign P7); the PWA precaches their
 * chunks, so they still open offline. Home, Scout, Entry and Entries stay in the main
 * bundle: the competition path never waits on a chunk.
 */
const LoginPage = lazy(() => import('@/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const ChangePasswordPage = lazy(() =>
  import('@/auth/ChangePasswordPage').then((m) => ({ default: m.ChangePasswordPage })),
);
const SwitchScouter = lazy(() =>
  import('@/auth/SwitchScouter').then((m) => ({ default: m.SwitchScouter })),
);
const UsersPage = lazy(() =>
  import('@/features/admin/UsersPage').then((m) => ({ default: m.UsersPage })),
);
const UserDetailPage = lazy(() =>
  import('@/features/admin/UserDetailPage').then((m) => ({ default: m.UserDetailPage })),
);
const ManageRoute = lazy(() =>
  import('@/features/admin/ManageRoute').then((m) => ({ default: m.ManageRoute })),
);

/** What a lazy page shows while its chunk loads: the same skeleton everywhere. */
function Loading({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <Skeleton rows={4} label="Loading" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

/** A route's own name (lib/pageTitle), merged into its handle — never in place of NO_HYDRATION. */
const named = (handle: PageHandle, base: object = {}) => ({ ...base, ...handle });

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
    {
      path: '/login',
      element: (
        <Loading>
          <LoginPage />
        </Loading>
      ),
      handle: named({ title: 'Sign in' }),
    },
    {
      path: '/change-password',
      element: (
        <Loading>
          <ChangePasswordPage />
        </Loading>
      ),
      handle: named({ title: 'Change password' }),
    },
    {
      path: '/',
      element: <AppShell />,
      children: [
        // Home (redesign R.8): the summary, then the context page. It reads the cache and the
        // server itself (never useActiveEventId), so it renders with no event loaded.
        { index: true, element: <HomePage />, handle: named({ title: 'Home' }, NO_HYDRATION) },
        { path: 'scout', element: <ScoutRoute />, handle: named({ title: 'Scout' }) },
        // The entry page names itself ("Q38 · 5951") with usePageTitle.
        {
          path: 'entry/:matchId/:teamId',
          element: <SignedInEntryRoute />,
          handle: named({ title: 'Entry', crumb: ['Scout'] }),
        },
        { path: 'entries', element: <EntriesRoute />, handle: named({ title: 'Entries' }) },
        // Inside the shell: it needs a signed-in device, and never leaves the outbox. It
        // reads only the cached accounts, so it works before any event is loaded.
        {
          path: 'switch-scouter',
          element: (
            <Loading>
              <SwitchScouter />
            </Loading>
          ),
          handle: named({ title: 'Switch scouter' }, NO_HYDRATION),
        },
        // Task 1.22's path, kept so a bookmark or an old installed start page still lands.
        { path: 'context', element: <Navigate to={PATHS.home} replace />, handle: NO_HYDRATION },
        // SPEC-FINAL 17.2: user administration is computer work. The pages check the role
        // themselves (7.4: device gating is not a permission), and the server again. They
        // read no event data, so an admin reaches them on an install with no competition.
        {
          path: 'admin/users',
          handle: named({ title: 'Users', crumb: ['Admin'] }, NO_HYDRATION),
          element: (
            <DesktopOnly what="the user administration page">
              <Loading>
                <UsersPage />
              </Loading>
            </DesktopOnly>
          ),
        },
        {
          path: 'admin/users/:id',
          // The page names the user (usePageTitle): "Admin / Users / Yael Shapira".
          handle: named({ title: 'Users', crumb: ['Admin', 'Users'] }, NO_HYDRATION),
          element: (
            <DesktopOnly what="the user administration page">
              <Loading>
                <UserDetailPage />
              </Loading>
            </DesktopOnly>
          ),
        },
        // Task 1.20: season and event management. Reads no event data either, so an
        // admin reaches it — and can set the very first competition up — with no
        // competition loaded (it is NoCompetition's "Set up a competition" link's target).
        {
          path: 'admin/manage',
          // The phone does a different job here — the matches view — and says so.
          handle: named({ title: 'Manage', phoneTitle: 'Matches', crumb: ['Admin'] }, NO_HYDRATION),
          // Desktop: the whole page; a phone: the matches view (SPEC-FINAL 17.2 exception).
          element: (
            <Loading>
              <ManageRoute />
            </Loading>
          ),
        },
      ],
    },
  ];
}

export function buildRouter() {
  return createBrowserRouter(routeTree());
}
