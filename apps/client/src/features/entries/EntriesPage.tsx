import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterChips } from '@/components/ui/filter-chips';
import { Notice } from '@/components/ui/notice';
import { SearchField } from '@/components/ui/search-field';
import { Segmented } from '@/components/ui/segmented';
import { typedCall, type Rpc } from '@/data/rpc';
import { useSyncStatus } from '@/data/syncStatus';
import {
  sessionOverride,
  useSessionOverride,
  type SessionOverrideState,
} from '@/features/context/sessionOverride';
import { useEventName } from '@/features/context/useEventName';
import { useShellContext, useSignedInUser } from '@/features/shell/shellContext';
import { failureLine } from '@/features/shell/SyncPill';
import { usePageCrumb } from '@/lib/pageTitle';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { PATHS } from '@/lib/paths';
import { EntriesTable } from './EntriesTable';
import { EntryCard } from './EntryCard';
import { useServerEntries } from './serverEntries';
import {
  useEntriesView,
  useRowsView,
  type EntriesFilter,
  type EntriesKind,
  type EntriesView,
} from './useEntriesView';

/**
 * `/entries` (design 05-entries + 26-entry-search, SPEC-FINAL 13.3 v1.43): the entry search, one
 * page. Every entry of the current competition, match and super, newest first, read from the
 * device alone (the venue is offline). Under a session override the device does not hold the
 * event, so the rows are the server's `queryEntries` (`OverrideEntries`). The search, the chips (All · Mine · Waiting · Needs a look) and the Both · Match · Super switch
 * filter in memory. A table on a laptop, cards on a phone; every row opens the entry's preview
 * (`/entries/:id`), a full page.
 */
export function EntriesPage({
  eventId,
  rpc = { call: typedCall },
}: {
  /** The admin default event, as the shell resolved it. */
  eventId: string;
  rpc?: Rpc;
}) {
  const override = useSessionOverride();
  const eventName = useEventName(eventId, useShellContext().gate);
  // The desktop crumb: "District #3 · Tel Aviv / Entries".
  const shown = override ? override.eventName : eventName;
  usePageCrumb(shown ? [shown, 'Entries'] : null);
  return override ? (
    <OverrideEntries key={override.eventId} override={override} defaultName={eventName} rpc={rpc} />
  ) : (
    <DeviceEntries eventId={eventId} eventName={eventName} />
  );
}

/** The device path: every entry of the default event this device holds. */
function DeviceEntries({ eventId, eventName }: { eventId: string; eventName: string | null }) {
  const view = useEntriesView(eventId, useSignedInUser().id);
  return <EntriesList view={view} eventName={eventName} device />;
}

/**
 * Under a session override (SPEC-FINAL 6.3) the device holds only the default event, so the list
 * is the server's `queryEntries` for the overridden event, held offline (9.6
 * `cross_event_view`). Waiting and Needs a look are this device's states: hidden here.
 */
function OverrideEntries({
  override,
  defaultName,
  rpc,
}: {
  override: NonNullable<SessionOverrideState>;
  defaultName: string | null;
  rpc: Rpc;
}) {
  const server = useServerEntries(rpc, override.eventId);
  const view = useRowsView(server.status === 'ok' ? server.rows : null, useSignedInUser().id);
  const shell = 'mx-auto w-full px-4 pb-8 pt-5 lg:px-8 lg:pt-6';
  if (server.status === 'offline') {
    return (
      <main className={shell}>
        <StateMessage
          variant="offline-needs-server"
          headingLevel={1}
          detail={`${override.eventName ?? 'This event'} is not on this device; other events need a connection.`}
          action={{
            label: `Back to ${defaultName ?? 'the default event'}`,
            onClick: () => sessionOverride.clear(),
          }}
        />
      </main>
    );
  }
  if (server.status === 'failed') {
    return (
      <main className={shell}>
        <StateMessage
          variant="failed"
          headingLevel={1}
          detail="The entries did not load from the server. Try again."
          action={{ label: 'Try again', onClick: server.retry }}
        />
      </main>
    );
  }
  return (
    <EntriesList
      view={view}
      eventName={override.eventName}
      device={false}
      emptyAction={
        <Button variant="primary" onClick={() => sessionOverride.clear()}>
          Back to {defaultName ?? 'the default event'}
        </Button>
      }
    />
  );
}

/**
 * The page itself, from either source. `device` false (an override's server rows) hides the
 * device-only chips (Waiting, Needs a look); its empty state offers the way back instead of
 * Scout a match (no entry may be created under an override).
 */
function EntriesList({
  view,
  eventName,
  device,
  emptyAction,
}: {
  view: EntriesView;
  eventName: string | null;
  device: boolean;
  emptyAction?: ReactNode;
}) {
  const desktop = useIsDesktop();
  const failed = failureLine(useSyncStatus());

  const chips: { key: EntriesFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: view.counts.all },
    { key: 'mine', label: 'Mine', count: view.counts.mine },
    ...(device
      ? [
          { key: 'waiting' as const, label: 'Waiting', count: view.counts.waiting },
          { key: 'look' as const, label: 'Needs a look', count: view.counts.look },
        ]
      : []),
  ];

  const kinds: { key: EntriesKind; label: string; word: string }[] = [
    { key: 'both', word: 'Both', label: `Both ${view.kinds.both}` },
    { key: 'match', word: 'Match', label: `Match ${view.kinds.match}` },
    { key: 'super', word: 'Super', label: `Super ${view.kinds.super}` },
  ];
  const kindSwitch = (
    <Segmented
      label="Entry kind"
      value={view.kind}
      onChange={view.setKind}
      options={kinds.map((k) => ({
        key: k.key,
        label: k.label,
        content: (
          <span className="inline-flex items-center justify-center gap-[5px]">
            {k.word}
            <span className="num text-xs font-medium text-muted">{view.kinds[k.key]}</span>
          </span>
        ),
      }))}
    />
  );
  const where = eventName ?? 'this competition';

  return (
    <main className="mx-auto w-full px-4 pb-8 pt-5 lg:px-8 lg:pt-6">
      <header>
        <h1 className="text-[1.375rem] font-bold tracking-tight lg:text-[1.625rem]">Entries</h1>
        <p className="mt-0.5 text-[0.78125rem] text-muted lg:mt-1 lg:text-[0.84375rem]">
          {desktop
            ? `Every entry at ${where}, match and super, newest first. A row opens the entry.`
            : `${where} · match and super · newest first`}
        </p>
      </header>

      {/* UF.13: why the waiting entries have not gone, in one quiet line. */}
      {failed && (
        <Notice tone="warning" role="status" still className="mt-4">
          {failed}
        </Notice>
      )}

      {view.loading ? (
        <div className="mt-5">
          <Skeleton rows={6} label="Loading the entries" />
        </div>
      ) : view.total === 0 ? (
        <EmptyState
          icon={Search}
          title="No entries yet"
          detail="Entries appear here as soon as a device syncs. Nothing is lost while a device is offline."
          className="mx-auto mt-6 max-w-md"
          action={
            emptyAction ?? (
              <Link to={PATHS.scout} className={buttonVariants({ variant: 'primary' })}>
                Scout a match
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2.5 lg:mb-3 lg:mt-[18px] lg:flex-row lg:items-center lg:gap-2.5">
            <SearchField
              value={view.query}
              onChange={view.setQuery}
              placeholder="Team, match or scouter"
              label="Search entries"
              className="lg:w-[300px] lg:shrink-0"
            />
            {desktop ? null : kindSwitch}
            <div className="-my-2 overflow-x-auto py-2 lg:overflow-visible [&_button]:shrink-0 [&>[role=group]]:flex-nowrap lg:[&>[role=group]]:flex-wrap">
              <FilterChips
                label="Show entries"
                options={chips}
                value={view.filter}
                onChange={view.setFilter}
              />
            </div>
            {desktop ? <div className="ms-auto w-[340px] shrink-0">{kindSwitch}</div> : null}
          </div>

          {view.rows.length === 0 ? (
            <StateMessage
              variant="no-results"
              action={{
                label: 'Show all',
                onClick: () => {
                  view.setQuery('');
                  view.setFilter('all');
                  view.setKind('both');
                },
              }}
            />
          ) : desktop ? (
            <EntriesTable rows={view.rows} />
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {view.rows.map((row) => (
                <EntryCard key={row.id} row={row} />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
