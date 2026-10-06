import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { EventRow, SeasonRow } from '@frc/shared';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/tabs';
import { StateMessage } from '@/components/StateMessage';
import { adminRpc, type Rpc } from '@/data/rpc';
import { useSignedInUser } from '@/features/shell/shellContext';
import { useOnline } from '@/lib/useOnline';
import { canManageEvents } from './AdminOnly';
import { panelErrorLine, unreachable } from './adminMessages';
import { EventsPanel } from './EventsPanel';
import { MatchesPanel } from './MatchesPanel';
import { SeasonsPanel } from './SeasonsPanel';
import { TeamsPanel } from './TeamsPanel';
import { PATHS } from '@/lib/paths';

/**
 * SPEC-FINAL 6.2–6.4 (tasks 1.20–1.21): season, event, team/roster and match management,
 * at `/admin/manage`. Desktop-only and `NO_HYDRATION` are the route's job (routes.tsx,
 * matching the Users routes) — this page only checks the role, exactly as `AdminOnly` does
 * for Users, but against `manage_events` rather than `manage_users`, so it does not reuse
 * that component.
 */
type TabKey = 'seasons' | 'events' | 'roster' | 'matches';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'seasons', label: 'Seasons' },
  { key: 'events', label: 'Events' },
  { key: 'roster', label: 'Teams & roster' },
  { key: 'matches', label: 'Matches' },
];

/** Why a list the page needs did not load: no connection, or a server refusal. */
type Failure = { unreachable: boolean; line: string };

const failureOf = (e: unknown): Failure => ({
  unreachable: unreachable(e),
  line: panelErrorLine(e),
});

export function ManagePage({ rpc = adminRpc }: { rpc?: Rpc }) {
  const user = useSignedInUser();
  const allowed = canManageEvents(user);
  const online = useOnline();
  const [tab, setTab] = useState<TabKey>('seasons');
  // `null` until the first listing answers. A listing that failed leaves it `null` and sets
  // `seasonsFailure` - never an empty list, which would read as "no seasons yet".
  const [seasons, setSeasons] = useState<SeasonRow[] | null>(null);
  const [seasonsFailure, setSeasonsFailure] = useState<Failure | null>(null);
  // True while the page is mounted (follow-up fix): `refreshSeasons`'s own `onChanged` call
  // is not inside the mount effect that would otherwise catch this for it. Set in the
  // effect's own setup, not only the `useRef(true)` initialiser — StrictMode's dev-mode
  // setup → cleanup → setup would otherwise leave this false forever after the first
  // render, since a ref's initial value is not re-applied on a second setup.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  /**
   * The generation of the latest `refreshSeasons` call (follow-up fix, same idea as
   * `managedSeasonRef` below): a stale response — one from a call that is no longer the
   * most recent — is dropped, exactly as a stale Events-tab refresh already is.
   */
  const seasonsRefreshRef = useRef(0);
  // The season the Events/Roster/Matches tabs manage: the active season if one is set,
  // else the newest, else none. Chosen once seasons are known, then left to the admin's
  // own selection (task 1.20).
  const [managedSeasonId, setManagedSeasonId] = useState<string | null>(null);
  /**
   * The managed season as of the latest render (branch review, finding 6): an Events-tab
   * refresh started for season X must not land once the admin has picked season Y, or
   * the Roster and Matches tabs would edit an event of the other season.
   */
  const managedSeasonRef = useRef<string | null>(managedSeasonId);
  managedSeasonRef.current = managedSeasonId;
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [eventsFailure, setEventsFailure] = useState<Failure | null>(null);
  // The event the Roster/Matches tabs manage (task 1.21 addendum): the active event if it
  // belongs to the managed season, else that season's first event by sort_order, else none.
  const [managedEventId, setManagedEventId] = useState<string | null>(null);

  // Re-run after a create, edit or "make active" on the Seasons tab, and once on mount
  // (task 1.20 review): otherwise an admin who creates a season on an empty install and
  // switches to Events still sees "Create a season first" until a reload.
  const refreshSeasons = useCallback(
    (live: () => boolean) => {
      const generation = ++seasonsRefreshRef.current;
      const stillLatest = () => seasonsRefreshRef.current === generation;
      Promise.all([rpc.call('listSeasons', {}), rpc.call('getActiveContext', {})]).then(
        ([seasonsOut, contextOut]) => {
          if (!live() || !stillLatest()) return;
          const items = (seasonsOut as { items: SeasonRow[] }).items;
          const sorted = [...items].sort((a, b) => b.year - a.year);
          const activeSeasonId = (contextOut as { active_season_id: string | null })
            .active_season_id;
          setSeasonsFailure(null);
          setSeasons(sorted);
          setManagedSeasonId((prev) => prev ?? activeSeasonId ?? sorted[0]?.id ?? null);
        },
        (e: unknown) => {
          // Seasons already on screen stay; the failure only shows when there are none.
          if (live() && stillLatest()) setSeasonsFailure(failureOf(e));
        },
      );
    },
    // rpc is an injected dependency held stable by the caller.
    [],
  );

  // Task 1.21: the counterpart of `refreshSeasons` for the managed season's events. Re-run
  // whenever the managed season changes, and when the Events tab reports a change (the same
  // `onChanged` pattern), so the Roster/Matches tabs' event picker follows along live.
  const refreshEvents = useCallback((seasonId: string, live: () => boolean) => {
    Promise.all([
      rpc.call('listEvents', { season_id: seasonId }),
      rpc.call('getActiveContext', {}),
    ]).then(
      ([eventsOut, contextOut]) => {
        if (!live()) return;
        const items = (eventsOut as { items: EventRow[] }).items;
        const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
        const activeEventId = (contextOut as { active_event_id: string | null }).active_event_id;
        const activeBelongsHere = sorted.some((e) => e.id === activeEventId);
        setEventsFailure(null);
        setEvents(sorted);
        setManagedEventId((prev) => {
          if (prev && sorted.some((e) => e.id === prev)) return prev;
          return activeBelongsHere ? activeEventId : (sorted[0]?.id ?? null);
        });
      },
      (e: unknown) => {
        if (live()) setEventsFailure(failureOf(e));
      },
    );
  }, []);

  useEffect(() => {
    // A non-admin makes no request at all (common.md), and neither does an offline page:
    // before the first load it says so, and loads by itself when `online` flips back.
    if (!allowed || !online) return;
    let live = true;
    refreshSeasons(() => live);
    return () => {
      live = false;
    };
  }, [allowed, online, refreshSeasons]);

  // A different season (or none) starts its events from scratch. Kept apart from the fetch
  // below so a blink of the connection never blanks events that are already on screen.
  useEffect(() => {
    setEvents(null);
    setEventsFailure(null);
    setManagedEventId(null);
  }, [allowed, managedSeasonId]);

  useEffect(() => {
    if (!allowed || !online || !managedSeasonId) return;
    let live = true;
    refreshEvents(managedSeasonId, () => live);
    return () => {
      live = false;
    };
  }, [allowed, online, managedSeasonId, refreshEvents]);

  const retrySeasons = () => {
    setSeasonsFailure(null);
    refreshSeasons(() => mountedRef.current);
  };
  const retryEvents = () => {
    if (!managedSeasonId) return;
    const seasonId = managedSeasonId;
    setEventsFailure(null);
    refreshEvents(seasonId, () => managedSeasonRef.current === seasonId);
  };
  // What the Events, Roster and Matches tabs show until the seasons are known: a failure
  // is said as one, never as "Create a season first".
  const seasonsGate: ReactNode =
    seasons !== null ? null : seasonsFailure ? (
      <LoadFailure what="Seasons" failure={seasonsFailure} onRetry={retrySeasons} />
    ) : (
      <p className="text-text-muted">Loading the seasons…</p>
    );

  if (!allowed) {
    return (
      <StateMessage
        variant="not-permitted"
        headingLevel={1}
        title="Only an admin can manage seasons and events"
        detail="Seasons, events, rosters and matches are managed by an admin. Ask one if something needs to change."
        action={{ label: 'Back to scouting', to: PATHS.scout }}
      />
    );
  }

  // Offline before anything has loaded: nothing to show, so say so. Once the page has
  // loaded, going offline keeps it - and every open form with what was typed in it.
  if (!online && seasons === null) {
    return (
      <StateMessage
        variant="offline-needs-server"
        headingLevel={1}
        detail="Managing seasons, events, rosters and matches needs a connection. This page loads by itself when the connection returns."
        action={{ label: 'Back to scouting', to: PATHS.scout }}
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
      {!online && (
        <p role="status" className="mb-4 text-sm text-text-muted">
          No connection — changes cannot be saved until it returns.
        </p>
      )}
      <PageHeader
        title="Season and event management"
        description="Seasons, events, rosters and matches. The default event is the one every device works on."
      />
      <div className="mt-6">
        <Tabs label="Manage" tabs={TABS} value={tab} onChange={setTab} />
      </div>
      <div className="mt-6">
        {tab === 'seasons' && (
          <SeasonsPanel rpc={rpc} onChanged={() => refreshSeasons(() => mountedRef.current)} />
        )}
        {tab === 'events' &&
          (managedSeasonId ? (
            <>
              {seasons && seasons.length > 1 && (
                <SeasonSelect
                  seasons={seasons}
                  value={managedSeasonId}
                  onChange={setManagedSeasonId}
                />
              )}
              <EventsPanel
                seasonId={managedSeasonId}
                rpc={rpc}
                onChanged={() => {
                  const seasonId = managedSeasonId;
                  refreshEvents(seasonId, () => managedSeasonRef.current === seasonId);
                }}
              />
            </>
          ) : (
            (seasonsGate ?? <NoSeasonYet onGoToSeasons={() => setTab('seasons')} />)
          ))}
        {tab === 'roster' && (
          <ManagedEventGate
            managedSeasonId={managedSeasonId}
            seasonsGate={seasonsGate}
            events={events}
            eventsFailure={eventsFailure}
            onRetryEvents={retryEvents}
            managedEventId={managedEventId}
            onEventChange={setManagedEventId}
            onGoToSeasons={() => setTab('seasons')}
            onGoToEvents={() => setTab('events')}
          >
            {(eventId) => <TeamsPanel eventId={eventId} rpc={rpc} />}
          </ManagedEventGate>
        )}
        {tab === 'matches' && (
          <ManagedEventGate
            managedSeasonId={managedSeasonId}
            seasonsGate={seasonsGate}
            events={events}
            eventsFailure={eventsFailure}
            onRetryEvents={retryEvents}
            managedEventId={managedEventId}
            onEventChange={setManagedEventId}
            onGoToSeasons={() => setTab('seasons')}
            onGoToEvents={() => setTab('events')}
          >
            {(eventId) => <MatchesPanel eventId={eventId} rpc={rpc} />}
          </ManagedEventGate>
        )}
      </div>
    </main>
  );
}

/** A list the page needs and could not get: the connection state, or the server's own line. */
function LoadFailure({
  what,
  failure,
  onRetry,
}: {
  what: 'Seasons' | 'Events';
  failure: Failure;
  onRetry: () => void;
}) {
  return failure.unreachable ? (
    <StateMessage
      variant="offline-needs-server"
      headingLevel={2}
      detail={`${what} live on the server, and this device cannot reach it right now.`}
      action={{ label: 'Try again', onClick: onRetry }}
    />
  ) : (
    <StateMessage
      variant="failed"
      headingLevel={2}
      title={`${what} did not load`}
      detail={failure.line}
      action={{ label: 'Try again', onClick: onRetry }}
    />
  );
}

function NoSeasonYet({ onGoToSeasons }: { onGoToSeasons: () => void }) {
  return (
    <StateMessage
      variant="no-data"
      title="Create a season first"
      detail="Events belong to a season. Add one on the Seasons tab, then come back here."
      action={{ label: 'Seasons', onClick: onGoToSeasons }}
    />
  );
}

/**
 * The gate the Roster and Matches tabs share (task 1.21 addendum item 2): "create a season
 * first", then "create an event first", then the one plain `<select>` labelled "Event" that
 * both tabs manage through — a management selector only, never the context switcher
 * (SPEC-FINAL 6.3's no-dropdown rule is for the context page).
 */
function ManagedEventGate({
  managedSeasonId,
  seasonsGate,
  events,
  eventsFailure,
  onRetryEvents,
  managedEventId,
  onEventChange,
  onGoToSeasons,
  onGoToEvents,
  children,
}: {
  managedSeasonId: string | null;
  /** Set while the seasons are loading or failed to; the gate shows it before anything else. */
  seasonsGate: ReactNode;
  events: EventRow[] | null;
  eventsFailure: Failure | null;
  onRetryEvents: () => void;
  managedEventId: string | null;
  onEventChange: (eventId: string) => void;
  onGoToSeasons: () => void;
  onGoToEvents: () => void;
  children: (eventId: string) => ReactNode;
}) {
  if (!managedSeasonId) {
    return seasonsGate ?? <NoSeasonYet onGoToSeasons={onGoToSeasons} />;
  }
  if (events === null) {
    return eventsFailure ? (
      <LoadFailure what="Events" failure={eventsFailure} onRetry={onRetryEvents} />
    ) : (
      <p className="text-text-muted">Loading the events…</p>
    );
  }
  if (!managedEventId) {
    return (
      <StateMessage
        variant="no-data"
        title="Create an event first"
        detail="Teams, rosters and matches belong to an event. Add one on the Events tab, then come back here."
        action={{ label: 'Events', onClick: onGoToEvents }}
      />
    );
  }
  return (
    <>
      {events && events.length > 1 && (
        <EventSelect events={events} value={managedEventId} onChange={onEventChange} />
      )}
      {children(managedEventId)}
    </>
  );
}

/**
 * Which season's events this screen manages — a plain management selector, not the
 * context switcher (SPEC-FINAL 6.3's no-dropdown rule is for the context page). Choosing
 * a season here changes nothing on the server.
 */
function SeasonSelect({
  seasons,
  value,
  onChange,
}: {
  seasons: SeasonRow[];
  value: string;
  onChange: (seasonId: string) => void;
}) {
  const id = useId();
  return (
    <div className="mb-4 max-w-xs">
      <Label htmlFor={id}>Season</Label>
      <NativeSelect
        id={id}
        value={value}
        wrapperClassName="mt-1.5"
        onChange={(e) => onChange(e.target.value)}
      >
        {seasons.map((season) => (
          <option key={season.id} value={season.id} dir="auto">
            {season.year} — {season.game_name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/** The Roster/Matches tabs' shared event picker (task 1.21). Same non-context idiom. */
function EventSelect({
  events,
  value,
  onChange,
}: {
  events: EventRow[];
  value: string;
  onChange: (eventId: string) => void;
}) {
  const id = useId();
  return (
    <div className="mb-4 max-w-xs">
      <Label htmlFor={id}>Event</Label>
      <NativeSelect
        id={id}
        value={value}
        wrapperClassName="mt-1.5"
        onChange={(e) => onChange(e.target.value)}
      >
        {events.map((event) => (
          <option key={event.id} value={event.id} dir="auto">
            {event.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
