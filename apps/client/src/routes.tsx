import { lazy, Suspense, type ReactNode } from 'react';
import {
  createBrowserRouter,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  type RouteObject,
} from 'react-router-dom';
import { DesktopOnly } from '@/components/DesktopOnly';
import { Skeleton } from '@/components/Skeleton';
import { OverrideGuard } from '@/features/context/OverrideGuard';
import { AppShell } from '@/features/shell/AppShell';
import {
  NO_HYDRATION,
  useActiveEventId,
  useShellContext,
  useSignedInUser,
} from '@/features/shell/shellContext';
import { HomePage } from '@/features/home/HomePage';
import { SelectRobotPage } from '@/features/entry/SelectRobotPage';
import { EntryRoute } from '@/features/entry/EntryRoute';
import type { PageHandle } from '@/lib/pageTitle';
import { PATHS } from '@/lib/paths';
import { useIsDesktop } from '@/lib/useMediaQuery';

/*
 * Sign-in and the admin pages load on first use (redesign P7); the PWA precaches their
 * chunks, so they still open offline. Home, Scout and Entry stay in the main bundle: the
 * competition path never waits on a chunk. Entries left it with task 1.52 (the entry search and
 * the preview: off the data-entry path, precached, so they open offline).
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
const FormsPage = lazy(() =>
  import('@/features/forms/FormsPage').then((m) => ({ default: m.FormsPage })),
);
// The builder's chunk carries @dnd-kit: it never reaches the initial bundle (task 1.29).
const BuilderPage = lazy(() =>
  import('@/features/builder/BuilderPage').then((m) => ({ default: m.BuilderPage })),
);
// Super scouting (task 1.36) is a lazy chunk the service worker precaches, so it opens offline;
// the match entry path stays in the main bundle.
const SuperEntryPage = lazy(() =>
  import('@/features/entry/SuperEntryPage').then((m) => ({ default: m.SuperEntryPage })),
);
// The way into practice mode (task 1.37): a small lazy chunk, precached like the others.
const PracticeStart = lazy(() =>
  import('@/features/entry/PracticeStart').then((m) => ({ default: m.PracticeStart })),
);
// This device's settings (task 1.38): a lazy chunk, precached. The saved theme and text size are
// applied by main.tsx before the first paint, without it.
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
// The Sync page (task 1.43): a lazy chunk, precached like the others, so it opens offline.
const SyncPage = lazy(() =>
  import('@/features/sync/SyncPage').then((m) => ({ default: m.SyncPage })),
);
// The conflict review worklist (task 1.44): a lazy chunk, precached, so it opens offline from the
// cache.
const ConflictsPage = lazy(() =>
  import('@/features/sync/ConflictsPage').then((m) => ({ default: m.ConflictsPage })),
);
// The discarded-records log (task 1.42): a lazy chunk, precached, reached from Sync only.
const DiscardedLogPage = lazy(() =>
  import('@/features/sync/DiscardedLogPage').then((m) => ({ default: m.DiscardedLogPage })),
);
// The QR sender (task 1.47): a lazy chunk, precached, so it opens offline — which is when it is
// needed. It alone carries `qrcode` and the codec (fflate): neither reaches the initial chunk.
const QrSendPage = lazy(() =>
  import('@/features/qr/QrSendPage').then((m) => ({ default: m.QrSendPage })),
);
// The QR receiver (task 1.48): a lazy chunk, precached, so it opens offline — which is when it is
// needed. It alone carries `@zxing/browser` and `@zxing/library`; neither reaches the initial chunk.
const QrReceivePage = lazy(() =>
  import('@/features/qr/QrReceivePage').then((m) => ({ default: m.QrReceivePage })),
);
// Season-wide team search (task 1.51): a lazy chunk, precached, so it opens offline — where it
// ranks the event's teams from the device's own rows.
const TeamSearchPage = lazy(() =>
  import('@/features/teams/TeamSearchPage').then((m) => ({ default: m.TeamSearchPage })),
);
// Entries — the entry search — and one entry's preview (task 1.52): lazy chunks, precached, so
// they open offline; the 5-minute mark lands on the preview offline.
const EntriesPage = lazy(() =>
  import('@/features/entries/EntriesPage').then((m) => ({ default: m.EntriesPage })),
);
const EntryPreviewPage = lazy(() =>
  import('@/features/entries/EntryPreviewPage').then((m) => ({ default: m.EntryPreviewPage })),
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
 * SPEC-FINAL 6.3: no new entry while a session override is in effect. Every route that
 * creates entries is guarded here, whatever the nav offers (task 1.22; /super, task 1.36).
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

function SignedInSuperRoute() {
  const eventId = useActiveEventId();
  return (
    <OverrideGuard defaultEventId={eventId}>
      <Loading>
        <SuperEntryPage eventId={eventId} author={useSignedInUser()} />
      </Loading>
    </OverrideGuard>
  );
}

/** SPEC-FINAL 8.5: practice opens a real entry screen, so it is guarded like one. */
function SignedInPracticeRoute() {
  const eventId = useActiveEventId();
  return (
    <OverrideGuard defaultEventId={eventId}>
      <Loading>
        <PracticeStart eventId={eventId} />
      </Loading>
    </OverrideGuard>
  );
}

/**
 * SPEC-FINAL 9.10: Sync names the shell's event as "this event" when there is one, and lists
 * every unsynced record whatever its event, so it opens with none loaded (NO_HYDRATION).
 */
function SyncRoute() {
  const { eventId, user, requestSync } = useShellContext();
  return (
    <Loading>
      <SyncPage eventId={eventId} viewer={user} syncNow={requestSync} />
    </Loading>
  );
}

/**
 * SPEC-FINAL 9.8 (task 1.47): the QR sender. On a computer a dialog over Sync, so Sync renders
 * beneath it; on a phone a full-screen page, alone. Done goes back to Sync: back through history
 * when Sync opened it (so Back does not return to the code), else to Sync in its place.
 */
function QrSendRoute() {
  const desktop = useIsDesktop();
  const navigate = useNavigate();
  const fromSync = (useLocation().state as { fromSync?: boolean } | null)?.fromSync === true;
  const back = () => {
    if (fromSync) void navigate(-1);
    else void navigate(PATHS.sync, { replace: true });
  };
  return (
    <>
      {desktop && <SyncRoute />}
      <Loading>
        <QrSendPage onDone={back} />
      </Loading>
    </>
  );
}

/**
 * SPEC-FINAL 9.8 (task 1.48): the QR receiver, a full-screen page at every width (on a computer
 * the camera at the left and the status at the right), so nothing renders beneath it. Done goes
 * back to Sync the way the sender's does.
 */
function QrReceiveRoute() {
  const navigate = useNavigate();
  const fromSync = (useLocation().state as { fromSync?: boolean } | null)?.fromSync === true;
  const back = () => {
    if (fromSync) void navigate(-1);
    else void navigate(PATHS.sync, { replace: true });
  };
  return (
    <Loading>
      <QrReceivePage onDone={back} />
    </Loading>
  );
}

/**
 * SPEC-FINAL 9.5: the current event's conflicts. Every role may open it (a scouter reads, every
 * action off); the page checks the role itself, and the server again. It reads the event's data,
 * so it waits for the event like Scout.
 */
function ConflictsRoute() {
  const eventId = useActiveEventId();
  const { user, requestSync } = useShellContext();
  return (
    <Loading>
      <ConflictsPage
        eventId={eventId}
        role={user.role}
        viewerName={user.full_name}
        syncNow={requestSync}
      />
    </Loading>
  );
}

/**
 * SPEC-FINAL 13.2 (task 1.51): every team in the season, ranked at the event. It reads the event's
 * roster and entries, so it waits for the event like Entries.
 */
function TeamsRoute() {
  const eventId = useActiveEventId();
  return (
    <Loading>
      <TeamSearchPage eventId={eventId} />
    </Loading>
  );
}

function EntriesRoute() {
  return (
    <Loading>
      <EntriesPage eventId={useActiveEventId()} />
    </Loading>
  );
}

/**
 * SPEC-FINAL 13.4 (task 1.52): one entry, read only, a full page under Entries. It reads the
 * event's data, so it waits for the event like Entries; keyed by the id, so moving from one entry
 * to another starts afresh.
 */
function EntryPreviewRoute() {
  const id = useParams<{ id: string }>().id ?? '';
  return (
    <Loading>
      <EntryPreviewPage
        key={id}
        entryId={id}
        eventId={useActiveEventId()}
        viewer={useSignedInUser()}
      />
    </Loading>
  );
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
        // Super scouting (SPEC-FINAL 8.1): linked from Scout's card, not a nav row. The form for
        // one team names itself ("Super · 1690") with usePageTitle.
        {
          path: 'super',
          element: <SignedInSuperRoute />,
          handle: named({ title: 'Super scouting', crumb: ['Scout'] }),
        },
        {
          path: 'super/:teamId',
          element: <SignedInSuperRoute />,
          handle: named({ title: 'Super scouting', crumb: ['Scout'] }),
        },
        // Practice a match (SPEC-FINAL 8.5, task 1.37): from Scout's card and Practice another
        // match. It reads the event's schedule, so it waits for the event like Scout.
        {
          path: 'practice',
          element: <SignedInPracticeRoute />,
          handle: named({ title: 'Practice', crumb: ['Scout'] }),
        },
        // SPEC-FINAL 13.2 (task 1.51): team search, the bottom bar's Search. Its rows open
        // /teams/:teamId, which is task 1.53's route.
        { path: 'teams', element: <TeamsRoute />, handle: named({ title: 'Search' }) },
        { path: 'entries', element: <EntriesRoute />, handle: named({ title: 'Entries' }) },
        // SPEC-FINAL 13.4 (task 1.52): the entry preview names itself ("Q37 · 1690"; the desktop
        // crumb "Entries / Q37 · 1690 Orbit"); the sidebar marks Entries (no `end`).
        {
          path: 'entries/:id',
          element: <EntryPreviewRoute />,
          handle: named({ title: 'Entry', crumb: ['Entries'] }),
        },
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
        // SPEC-FINAL 8.6 (task 1.38): this device's settings. Every role; it reads no event data
        // (the competition's name only if one is loaded), so it opens with none.
        {
          path: 'settings',
          element: (
            <Loading>
              <SettingsPage />
            </Loading>
          ),
          handle: named({ title: 'Settings', crumb: ['This device'] }, NO_HYDRATION),
        },
        // SPEC-FINAL 9.10 (task 1.43): what this device has sent and what still waits, opened from
        // the sync indicator on every screen and the "This device" nav group. It lists every
        // unsynced record on the device whatever its event, so it opens with no event loaded.
        {
          path: 'sync',
          element: <SyncRoute />,
          handle: named({ title: 'Sync', crumb: ['This device'] }, NO_HYDRATION),
        },
        // SPEC-FINAL 9.7 (task 1.42): the discarded-records log, opened from Sync, not a nav row.
        // It reads only this device's log, never event data, so it opens with no competition.
        {
          path: 'sync/discarded',
          element: (
            <Loading>
              <DiscardedLogPage />
            </Loading>
          ),
          handle: named(
            { title: 'Discarded records', phoneTitle: 'Discarded', crumb: ['This device', 'Sync'] },
            NO_HYDRATION,
          ),
        },
        // SPEC-FINAL 9.8 (task 1.47): the QR sender, opened from Sync's More, not a nav row. It
        // reads only this device's outbox, never event data, so it opens with no competition.
        {
          path: 'sync/qr/send',
          element: <QrSendRoute />,
          // The dialog sits over Sync on a computer, so the crumb stays Sync's (20-qr-send final).
          handle: named({ title: 'Sync', crumb: ['This device'] }, NO_HYDRATION),
        },
        // SPEC-FINAL 9.8 (task 1.48): the QR receiver, opened from Sync's More, not a nav row. It
        // writes only to this device's dataset and outbox, so it opens with no competition.
        {
          path: 'sync/qr/receive',
          element: <QrReceiveRoute />,
          handle: named({ title: 'Receive by QR', crumb: ['This device', 'Sync'] }, NO_HYDRATION),
        },
        // SPEC-FINAL 9.5, 17.9 (task 1.44): the conflict review worklist, at any width — it cannot
        // wait for a laptop (17.2). Opened from Sync's conflicts link and the "This device" group.
        {
          path: 'conflicts',
          element: <ConflictsRoute />,
          handle: named({ title: 'Conflicts', crumb: ['This device'] }),
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
        // Task 1.29: the forms list and the form builder (SPEC-FINAL 5.9). Computer work for
        // admins (17.2); they read no event data, so an install with no competition reaches them.
        {
          path: 'admin/forms',
          handle: named({ title: 'Forms', crumb: ['Admin'] }, NO_HYDRATION),
          element: (
            <DesktopOnly what="the forms page">
              <Loading>
                <FormsPage />
              </Loading>
            </DesktopOnly>
          ),
        },
        {
          path: 'admin/forms/:formId',
          // The page names the form (usePageCrumb): "Admin / Forms / Match form 2026".
          handle: named(
            { title: 'Form builder', phoneTitle: 'Forms', crumb: ['Admin', 'Forms'] },
            NO_HYDRATION,
          ),
          element: (
            <DesktopOnly what="the form builder">
              <Loading>
                <BuilderPage />
              </Loading>
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
