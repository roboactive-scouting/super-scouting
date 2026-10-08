import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterChips } from '@/components/ui/filter-chips';
import { Notice } from '@/components/ui/notice';
import { SearchField } from '@/components/ui/search-field';
import { useSyncStatus } from '@/data/syncStatus';
import { useEventName } from '@/features/context/useEventName';
import { useShellContext, useSignedInUser } from '@/features/shell/shellContext';
import { failureLine } from '@/features/shell/SyncPill';
import { usePageCrumb } from '@/lib/pageTitle';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { PATHS } from '@/lib/paths';
import { EntriesTable } from './EntriesTable';
import { EntryCard } from './EntryCard';
import { useEntriesView, type EntriesFilter } from './useEntriesView';

/**
 * `/entries` (design 05-entries): everything this device holds for the current competition,
 * newest first, read from the device alone. A table on a laptop, cards on a phone. Rows do
 * not open anything yet: the entry preview is a later page (SPEC-FINAL 13.4).
 */
export function EntriesPage({ eventId }: { eventId: string }) {
  const me = useSignedInUser().id;
  const desktop = useIsDesktop();
  const view = useEntriesView(eventId, me);
  const failed = failureLine(useSyncStatus());
  const eventName = useEventName(eventId, useShellContext().gate);
  // The desktop crumb: "District #3 · Tel Aviv / Entries".
  usePageCrumb(eventName ? [eventName, 'Entries'] : null);

  const chips: { key: EntriesFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: view.counts.all },
    { key: 'mine', label: 'Mine', count: view.counts.mine },
    { key: 'waiting', label: desktop ? 'Waiting to send' : 'Waiting', count: view.counts.waiting },
    { key: 'look', label: 'Needs a look', count: view.counts.look },
  ];

  return (
    <main className="mx-auto w-full px-4 pb-8 pt-5 lg:px-8 lg:pt-6">
      <header>
        <h1 className="text-[1.375rem] font-bold tracking-tight lg:text-[1.625rem]">Entries</h1>
        <p className="mt-0.5 text-[0.78125rem] text-muted lg:mt-1 lg:text-[0.84375rem]">
          {desktop
            ? 'Everything this device holds for the current competition, newest first.'
            : 'On this device · newest first'}
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
            <Link to={PATHS.scout} className={buttonVariants({ variant: 'primary' })}>
              Scout a match
            </Link>
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
              className="lg:w-[300px]"
            />
            <div className="-my-2 overflow-x-auto py-2 lg:overflow-visible [&_button]:shrink-0 [&>[role=group]]:flex-nowrap lg:[&>[role=group]]:flex-wrap">
              <FilterChips
                label="Show entries"
                options={chips}
                value={view.filter}
                onChange={view.setFilter}
              />
            </div>
          </div>

          {view.rows.length === 0 ? (
            <StateMessage
              variant="no-results"
              action={{
                label: 'Show all',
                onClick: () => {
                  view.setQuery('');
                  view.setFilter('all');
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
