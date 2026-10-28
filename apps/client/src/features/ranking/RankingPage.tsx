import { CloudOff } from 'lucide-react';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatTime, type RankSortKey, type RankSortStep } from '@frc/shared';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { CategorySwitch } from '@/components/ui/category-switch';
import { cachedEventName } from '@/data/cache';
import { typedCall, type Rpc } from '@/data/rpc';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { sessionOverride } from '@/features/context/sessionOverride';
import { PATHS } from '@/lib/paths';
import { useIsDesktop, useMediaQuery } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { ListLabels, RankingList } from './RankingList';
import { RankingTable } from './RankingTable';
import {
  categoryOptions,
  DEFAULT_SORT,
  headerClick,
  phasesOf,
  sortedRows,
  type Category,
} from './rankingView';
import { SortControl, SortPopover, SortSheet } from './SortControls';
import { TeamStudyPanel, TeamStudySheet } from './TeamStudy';
import { useQualRange, useRanking, type RankingSource } from './useRanking';

/*
 * `/ranking` (SPEC-FINAL 13.5, 17.9; docs/design/pages/27-ranking/final, variant N; task 1.58): the
 * fixed phase 1 ranking table of the active competition. Two categories (Scoring, Availability)
 * in place of column visibility, each with its own sort of one or several figures; the rank never
 * moves with the sort; a team with no data sorts last; a row opens the team study (a panel beside
 * the list on a wide computer, a bottom sheet otherwise). No pagination, no weighting (D18).
 * The rows are `useRanking`'s: the server's `rankTeams` online, the device's own `buildRankTable`
 * offline. The figures in the sort carry value shading (12.6, task 1.59: `FigureValue`), the
 * number always printed.
 */

/**
 * The study sits beside the list from 1360 px, where the table still fits beside it (the sidebar,
 * the page's margins, the 320 px panel and the table's 728 px); under it, in the bottom sheet.
 */
const WIDE_QUERY = '(min-width: 1360px)';

/** "3 entries waiting to send" (Home's words), or "Everything is sent". */
function waitingText(waiting: number): string {
  return waiting > 0
    ? `${waiting} ${waiting === 1 ? 'entry' : 'entries'} waiting to send`
    : 'Everything is sent';
}

/** Where the figures came from, in the header (computer) or the event line (phone). */
function SourceLine({ source, className }: { source: RankingSource; className?: string }) {
  if (source.kind === 'server') {
    return (
      <p className={cn('flex items-center gap-[7px] text-[0.8125rem] text-muted', className)}>
        <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
        From the server · as of{' '}
        <b className="num font-semibold text-ink-2">{formatTime(source.asOf)}</b>
      </p>
    );
  }
  return (
    <p
      className={cn(
        'flex flex-wrap items-center gap-x-[7px] text-[0.8125rem] text-muted',
        className,
      )}
    >
      <span aria-hidden="true" className="size-2 rounded-full bg-muted" />
      <span className="font-semibold text-ink-2">Computed from the data on this device</span>
      <span>
        ·{' '}
        {source.lastSyncAt ? (
          <>
            Last synced{' '}
            <b className="num font-semibold text-ink-2">{formatTime(source.lastSyncAt)}</b>
          </>
        ) : (
          'Never synced'
        )}{' '}
        · {waitingText(source.waiting)}
      </span>
    </p>
  );
}

/** The phone's notice when the figures are the device's own (frame 2). */
function DeviceNotice({ source }: { source: Extract<RankingSource, { kind: 'device' }> }) {
  return (
    <div className="mx-3 mb-2.5 flex items-start gap-2.5 rounded-control border border-control-border bg-surface px-3 py-2.5">
      <CloudOff aria-hidden="true" className="mt-px size-5 shrink-0 text-ink-2" />
      <div>
        <b className="block text-sm font-[650]">Computed from the data on this device</b>
        <span className="text-[0.78125rem] text-muted">
          {source.lastSyncAt ? (
            <>
              Last synced{' '}
              <b className="num font-semibold text-ink-2">{formatTime(source.lastSyncAt)}</b>
            </>
          ) : (
            'Never synced'
          )}{' '}
          · {waitingText(source.waiting)}
        </span>
      </div>
    </div>
  );
}

export function RankingPage({
  eventId,
  rpc = { call: typedCall },
}: {
  /** The admin default event, as the shell resolved it. */
  eventId: string;
  rpc?: Rpc;
}) {
  const ranking = useRanking(eventId, rpc);
  const quals = useQualRange(eventId);
  const desktop = useIsDesktop();
  const wide = useMediaQuery(WIDE_QUERY, true);
  const defaultName = useDeviceQuery(() => cachedEventName(eventId), [eventId], ['rows']);

  const [category, setCategory] = useState<Category>('scoring');
  const [sorts, setSorts] = useState<Record<Category, RankSortStep[]>>(DEFAULT_SORT);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const sortButton = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  const rows = ranking.status === 'ready' ? ranking.rows : null;
  const sort = sorts[category];
  const phases = useMemo(() => (rows ? phasesOf(rows) : []), [rows]);
  const categories = useMemo(() => categoryOptions(phases), [phases]);
  const ordered = useMemo(() => (rows ? sortedRows(rows, sort) : []), [rows, sort]);
  const setSort = (next: RankSortStep[]) => setSorts((was) => ({ ...was, [category]: next }));
  const onHeader = (key: RankSortKey) => setSort(headerClick(sort, key));

  const shell = (children: ReactNode) => (
    <main className="mx-auto w-full px-4 pt-5 pb-8 lg:px-8 lg:pt-[22px]">{children}</main>
  );

  if (ranking.status === 'loading') {
    return shell(<Skeleton rows={10} rowHeight="2rem" label="Loading the ranking" />);
  }
  if (ranking.status === 'offline-needs-server') {
    return shell(
      <StateMessage
        variant="offline-needs-server"
        headingLevel={1}
        detail="That competition is not on this device; its ranking needs a connection."
        action={{
          label: `Back to ${defaultName ?? 'the default event'}`,
          onClick: () => sessionOverride.clear(),
        }}
      />,
    );
  }
  if (ranking.status === 'failed') {
    return shell(
      <StateMessage
        variant="failed"
        headingLevel={1}
        detail="The ranking did not load from the server. Try again."
        action={{ label: 'Try again', onClick: ranking.retry }}
      />,
    );
  }
  if (ranking.status === 'unknown' || rows === null || rows.length === 0) {
    return shell(
      <StateMessage
        variant="no-data"
        headingLevel={1}
        title="No teams to rank yet"
        detail="This device holds no teams for this competition yet. They arrive with the next sync."
        action={{ label: 'Back to Home', to: PATHS.home }}
      />,
    );
  }

  const { event, source } = ranking;
  const selectedRow = rows.find((r) => r.team_id === selected) ?? null;
  const panelBeside = desktop && wide && selectedRow !== null;
  const builder = {
    category,
    phases,
    sort,
    onChange: setSort,
  };
  const select = (teamId: string) =>
    setSelected((was) => (desktop && was === teamId ? null : teamId));

  if (desktop) {
    return (
      <main className="mx-auto flex w-full flex-col gap-4 px-8 pt-[22px] pb-8">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h1 className="text-[1.625rem] leading-[1.1] font-[750] tracking-[-0.02em]">Ranking</h1>
            <p className="mt-1 text-[0.84375rem] text-muted">
              <b className="font-[650] text-ink-2">{event.name}</b>
              {quals && (
                <>
                  {' '}
                  · Qualifications <span className="num">{quals}</span>
                </>
              )}{' '}
              · <span className="num">{rows.length}</span> teams · averages leave out no-show and
              disabled matches
            </p>
          </div>
          <SourceLine source={source} />
        </div>
        <div className="relative flex flex-wrap items-center gap-2.5">
          <CategorySwitch
            label="Category"
            options={categories}
            value={category}
            onChange={(key) => {
              setCategory(key);
              setBuilderOpen(false);
            }}
          />
          <span className="flex-1" />
          <span className="flex items-center gap-2.5">
            <span className="text-[0.8125rem] text-muted">Sorted by</span>
            <SortControl
              ref={sortButton}
              sort={sort}
              category={category}
              open={builderOpen}
              onOpen={() => setBuilderOpen((was) => !was)}
              controls={popoverId}
            />
          </span>
          <SortPopover
            {...builder}
            id={popoverId}
            open={builderOpen}
            onClose={() => setBuilderOpen(false)}
            anchor={sortButton}
          />
        </div>
        <div
          className={cn(
            'grid items-start gap-4',
            panelBeside ? 'grid-cols-[minmax(0,1fr)_320px]' : 'grid-cols-1',
          )}
        >
          <RankingTable
            category={category}
            rows={ordered}
            allRows={rows}
            phases={phases}
            sort={sort}
            onSort={onHeader}
            selected={selected}
            onSelect={select}
          />
          {panelBeside && (
            <TeamStudyPanel
              row={selectedRow}
              rows={rows}
              phases={phases}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
        {!wide && (
          <TeamStudySheet
            open={selectedRow !== null}
            row={selectedRow}
            rows={rows}
            phases={phases}
            onClose={() => setSelected(null)}
          />
        )}
      </main>
    );
  }

  return (
    <main className="w-full pb-6">
      <h1 className="sr-only">Ranking</h1>
      <div className="flex flex-col gap-0.5 px-4 pt-3 pb-2.5">
        <b className="text-base font-bold tracking-[-0.01em]">{event.name}</b>
        <span className="text-[0.78125rem] text-muted">
          {quals && <span className="num">{quals}</span>}
          {source.kind === 'server' && (
            <>
              {quals && ' · '}from the server · as of{' '}
              <span className="num">{formatTime(source.asOf)}</span>
            </>
          )}
        </span>
      </div>
      {source.kind === 'device' && <DeviceNotice source={source} />}
      <div className="sticky top-[var(--top-bar,0px)] z-10 flex flex-col gap-2 bg-bg px-3 pt-0.5">
        <CategorySwitch
          compact
          label="Category"
          options={categories}
          value={category}
          onChange={setCategory}
        />
        <SortControl
          compact
          sort={sort}
          category={category}
          open={builderOpen}
          onOpen={() => setBuilderOpen(true)}
        />
        <ListLabels category={category} phases={phases} sort={sort} allRows={rows} />
      </div>
      <RankingList
        category={category}
        rows={ordered}
        allRows={rows}
        phases={phases}
        sort={sort}
        selected={selected}
        onSelect={select}
      />
      <SortSheet {...builder} open={builderOpen} onClose={() => setBuilderOpen(false)} />
      <TeamStudySheet
        open={selectedRow !== null}
        row={selectedRow}
        rows={rows}
        phases={phases}
        onClose={() => setSelected(null)}
      />
    </main>
  );
}
