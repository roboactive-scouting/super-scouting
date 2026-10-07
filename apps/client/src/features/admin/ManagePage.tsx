import { useState, type ReactNode } from 'react';
import { StateMessage } from '@/components/StateMessage';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { adminRpc, type Rpc } from '@/data/rpc';
import { useSignedInUser } from '@/features/shell/shellContext';
import { PATHS } from '@/lib/paths';
import { useOnline } from '@/lib/useOnline';
import { canManageEvents } from './AdminOnly';
import { CompetitionsPanel } from './CompetitionsPanel';
import { LeaveGuard } from './LeaveGuard';
import { LoadFailure } from './LoadFailure';
import { MatchesPanel } from './MatchesPanel';
import { RosterPanel } from './RosterPanel';
import { UnsavedConfirm } from './UnsavedConfirm';
import { useManageLists } from './useManageLists';

/**
 * SPEC-FINAL 6.2–6.4 at `/admin/manage` (07-manage final): "Season and event management",
 * the event being worked on with a picker, and three tabs — Competitions (seasons and
 * events), Teams & roster, Matches — with counts. The page loads every list once and owns
 * it; the tabs change it in place. The role gate is `manage_events`, as before.
 */
type TabKey = 'competitions' | 'roster' | 'matches';

const DESCRIPTION =
  'Seasons, events, rosters and matches. The default event is the one every device works on.';

export function ManagePage({ rpc = adminRpc }: { rpc?: Rpc }) {
  const allowed = canManageEvents(useSignedInUser());
  const online = useOnline();
  const [tab, setTab] = useState<TabKey>('competitions');
  const lists = useManageLists(rpc, allowed && online);
  const { seasons, events, eventId, roster, setRoster, matches, setMatches, saves } = lists;
  /** A change of event or season waiting on "Leave without saving?" (RB.17 fix 2). */
  const [pendingSwitch, setPendingSwitch] = useState<(() => void) | null>(null);
  // Asks while a line-up is "Not saved" or still being sent (fix 3); the switch drops both.
  const switchCompetition = (go: () => void) =>
    saves.held.size > 0 ? setPendingSwitch(() => go) : go();

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

  // Offline before anything has loaded: nothing to show, so say so. Once loaded, going
  // offline keeps the page — and every open form with what was typed in it.
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

  const season = seasons?.find((s) => s.id === lists.seasonId) ?? null;
  const event = events?.find((e) => e.id === eventId) ?? null;
  const working = tab !== 'competitions' && season && event;

  const seasonsGate: ReactNode = lists.seasonsFailure ? (
    <LoadFailure what="Seasons" failure={lists.seasonsFailure} onRetry={lists.retrySeasons} />
  ) : (
    <p className="text-muted">Loading the seasons…</p>
  );
  const eventsGate: ReactNode = lists.eventsFailure ? (
    <LoadFailure what="Events" failure={lists.eventsFailure} onRetry={lists.retryEvents} />
  ) : (
    <p className="text-muted">Loading the events…</p>
  );

  /** What the Roster and Matches tabs show until their event's lists are in. */
  function eventGate(what: 'Teams' | 'Matches'): ReactNode {
    if (seasons === null) return seasonsGate;
    if (!lists.seasonId) {
      return (
        <StateMessage
          variant="no-data"
          title="Create a season first"
          detail="Events belong to a season. Add one on the Competitions tab, then come back here."
          action={{ label: 'Competitions', onClick: () => setTab('competitions') }}
        />
      );
    }
    if (events === null) return eventsGate;
    if (!eventId) {
      return (
        <StateMessage
          variant="no-data"
          title="Create an event first"
          detail="Teams, rosters and matches belong to an event. Add one on the Competitions tab, then come back here."
          action={{ label: 'Competitions', onClick: () => setTab('competitions') }}
        />
      );
    }
    if (lists.eventFailure) {
      return <LoadFailure what={what} failure={lists.eventFailure} onRetry={lists.retryEvent} />;
    }
    if (!lists.eventReady) return <p className="text-muted">Loading the {what.toLowerCase()}…</p>;
    return null;
  }

  const counted = lists.eventReady;
  return (
    <main className="mx-auto w-full px-4 pb-8 pt-5 lg:px-8 lg:pt-6">
      {!online && (
        <p role="status" className="mb-4 text-sm text-muted">
          No connection — changes cannot be saved until it returns.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.625rem] font-[750] tracking-[-0.02em]">
            Season and event management
          </h1>
          <p className="mt-1 text-[0.84375rem] text-muted">
            {working ? (
              <>
                Working on{' '}
                <b className="font-bold text-ink" dir="auto">
                  {event.name}
                </b>
                {event.id === lists.active.active_event_id && ' (default)'} ·{' '}
                <span className="num">{season.year}</span>
              </>
            ) : (
              DESCRIPTION
            )}
          </p>
        </div>
        {tab !== 'competitions' && events && events.length > 1 && eventId && (
          <Select
            aria-label="Event"
            value={eventId}
            wrapperClassName="w-full sm:w-auto sm:min-w-[240px]"
            onChange={(e) => {
              const id = e.target.value;
              switchCompetition(() => lists.chooseEvent(id));
            }}
          >
            {events.map((row) => (
              <option key={row.id} value={row.id} dir="auto">
                {row.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      <div className="mt-3.5 overflow-hidden rounded-card border border-line">
        <Tabs
          flush
          label="Manage"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'competitions', label: 'Competitions' },
            { key: 'roster', label: 'Teams & roster', count: counted ? roster.length : undefined },
            { key: 'matches', label: 'Matches', count: counted ? matches.length : undefined },
          ]}
        />
      </div>
      <div className="mt-4">
        {tab === 'competitions' &&
          (seasons === null ? (
            seasonsGate
          ) : (
            <CompetitionsPanel
              rpc={rpc}
              seasons={seasons}
              active={lists.active}
              seasonId={lists.seasonId}
              events={events}
              eventsGate={eventsGate}
              onSelectSeason={(id) => {
                if (id !== lists.seasonId) switchCompetition(() => lists.selectSeason(id));
              }}
              onSeasonSaved={lists.saveSeason}
              onActiveChange={lists.setActive}
              onEventsChange={lists.changeEvents}
              onSeasonDeleted={lists.dropSeason}
              onEventDeleted={lists.dropEvent}
            />
          ))}
        {tab === 'roster' &&
          (eventGate('Teams') ??
            (eventId && (
              <RosterPanel
                key={eventId}
                rpc={rpc}
                eventId={eventId}
                roster={roster}
                onRosterChange={setRoster}
                registry={lists.registry}
                registryFailure={lists.registryFailure}
                onRegistryChange={lists.setRegistry}
                onRetryRegistry={lists.retryRegistry}
              />
            )))}
        {tab === 'matches' &&
          (eventGate('Matches') ??
            (eventId && (
              <MatchesPanel
                rpc={rpc}
                eventId={eventId}
                roster={roster}
                matches={matches}
                onMatchesChange={setMatches}
                onRosterChange={setRoster}
                saves={saves}
              />
            )))}
      </div>
      <UnsavedConfirm
        open={pendingSwitch !== null}
        action="switch"
        matches={matches}
        unsaved={saves.held}
        onStay={() => setPendingSwitch(null)}
        onGo={() => {
          pendingSwitch?.();
          setPendingSwitch(null);
        }}
      />
      <LeaveGuard matches={matches} unsaved={saves.held} />
    </main>
  );
}
