import { Search } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { formatPercent, NO_VALUE, type RobotStatus, type TeamStats } from '@frc/shared';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatTile } from '@/components/ui/stat-tile';
import { Tabs } from '@/components/ui/tabs';
import { cachedEventName } from '@/data/cache';
import { typedCall, type Rpc } from '@/data/rpc';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { sessionOverride, useSessionOverride } from '@/features/context/sessionOverride';
import { usePageCrumb, usePageTitle } from '@/lib/pageTitle';
import { PATHS } from '@/lib/paths';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { MatchByMatchTable, MatchList, MatchStrip } from './MatchByMatchTable';
import { NotesList } from './NotesList';
import {
  ChartLegend,
  chartHasValues,
  MetricPicker,
  ProgressionChart,
  ProgressPanel,
} from './ProgressionChart';
import { StatRows } from './StatRows';
import { TeamHeader } from './TeamHeader';
import { loadDeviceTeamStats, useServerTeamStats } from './teamStats';
import { chartMetrics, formatStat, formatTrend, POINTS_METRIC_KEY } from './teamView';

/*
 * `/teams/:teamId` (SPEC-FINAL 13.1; docs/design/pages/24-team/final, variant D2; task 1.53): the
 * fixed, always-available team page — that team's statistics over the matches of the active
 * competition. Computed on the device by @frc/shared's `buildTeamStats` (offline is the normal
 * mode at a venue; 9.6); under a session override, the server's `getTeamStats`.
 */

type TabKey = 'stats' | 'matches' | 'progress' | 'notes';
const TAB_NAME: Record<TabKey, string> = {
  stats: 'Stats',
  matches: 'Matches',
  progress: 'Progress',
  notes: 'Notes',
};

/** Scrolled this far, the phone header shrinks to one line; back under this, it grows again. */
const COMPACT_AT = 24;
const EXPAND_AT = 4;

export function TeamPage({
  teamId,
  eventId,
  rpc = { call: typedCall },
}: {
  teamId: string;
  /** The admin default event, as the shell resolved it. */
  eventId: string;
  rpc?: Rpc;
}) {
  const override = useSessionOverride();
  const device = useDeviceQuery(
    () => (override ? Promise.resolve(null) : loadDeviceTeamStats(teamId, eventId)),
    [teamId, eventId, override?.eventId ?? null],
    ['rows'],
  );
  const server = useServerTeamStats(rpc, teamId, override?.eventId ?? eventId, override !== null);
  const defaultName = useDeviceQuery(() => cachedEventName(eventId), [eventId], ['rows']);

  const notFound = (
    <main className="mx-auto w-full px-4 pt-5 pb-8 lg:px-8 lg:pt-6">
      <StateMessage
        variant="no-results"
        headingLevel={1}
        title="This team is not here"
        detail="The device holds no such team at this competition. It may be a team of another season."
        action={{ label: 'Back to Search', to: PATHS.teams }}
      />
    </main>
  );
  const loading = (
    <main className="mx-auto w-full px-4 pt-5 pb-8 lg:px-8 lg:pt-6">
      <Skeleton rows={6} rowHeight="3rem" label="Loading the team" />
    </main>
  );

  let stats: TeamStats | null = null;
  if (override) {
    if (server.status === 'offline') {
      return (
        <main className="mx-auto w-full px-4 pt-5 pb-8 lg:px-8 lg:pt-6">
          <StateMessage
            variant="offline-needs-server"
            headingLevel={1}
            detail={`${override.eventName ?? 'This event'} is not on this device; its statistics need a connection.`}
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
        <main className="mx-auto w-full px-4 pt-5 pb-8 lg:px-8 lg:pt-6">
          <StateMessage
            variant="failed"
            headingLevel={1}
            detail="The team's statistics did not load from the server. Try again."
            action={{ label: 'Try again', onClick: server.retry }}
          />
        </main>
      );
    }
    if (server.status === 'not-found') return notFound;
    if (server.status === 'loading') return loading;
    stats = server.stats;
  } else {
    if (device === undefined || device === null) return loading;
    if (device.state === 'unknown') return notFound;
    stats = device.stats;
  }
  return <TeamView stats={stats} />;
}

/** The four stat tiles (THEME "Stat tile", 2 × 2): median, availability, best match, trend. */
function Tiles({ stats }: { stats: TeamStats }) {
  const { tiles } = stats;
  return (
    <div className="grid grid-cols-2 gap-2">
      <StatTile
        label="Median points"
        value={formatStat(tiles.median)}
        note={`avg ${formatStat(stats.headline.value)}`}
      />
      <StatTile
        label="Availability"
        value={formatPercent(tiles.availability.rate)}
        note={`${tiles.availability.available} of ${tiles.availability.total} matches`}
      />
      <StatTile
        label="Best match"
        value={tiles.best_match ? formatStat(tiles.best_match.points) : NO_VALUE}
        note={tiles.best_match?.match_label ?? 'none counted yet'}
      />
      <StatTile label="Trend" value={formatTrend(tiles.trend)} note="points per match" />
    </div>
  );
}

/**
 * Reliability (SPEC-FINAL 11.3; `role="group"`): availability, breakdowns, no-shows and disabled,
 * the matches named under the counts, a count above 0 in `--warn`. `strip`: the phone's 4-column
 * strip; otherwise the computer's 2 × 2 grid.
 */
function Reliability({ stats, strip }: { stats: TeamStats; strip: boolean }) {
  const r = stats.reliability;
  const items: { label: string; value: string; warn: boolean; under: string }[] = [
    {
      label: 'Availability',
      value: formatPercent(r.availability_rate),
      warn: false,
      under: `${r.available} of ${r.available + r.missed}`,
    },
    {
      label: 'Breakdowns',
      value: String(r.breakdowns),
      warn: r.breakdowns > 0,
      under: r.breakdown_matches.join(', '),
    },
    {
      label: 'No-shows',
      value: String(r.no_shows),
      warn: r.no_shows > 0,
      under: r.no_show_matches.join(', '),
    },
    {
      label: 'Disabled',
      value: String(r.disabled),
      warn: r.disabled > 0,
      under: r.disabled_matches.join(', '),
    },
  ];
  return (
    <div
      role="group"
      aria-label="Reliability"
      className={cn(
        'grid',
        strip
          ? 'grid-cols-4 [&>div+div]:border-s [&>div+div]:border-line-2'
          : 'grid-cols-2 [&>div:nth-child(-n+2)]:border-b [&>div:nth-child(odd)]:border-e [&>div]:border-line-2',
      )}
    >
      {items.map((item) => (
        <div key={item.label} className={cn('min-w-0', strip ? 'px-2 py-2' : 'px-3 py-2.5')}>
          <small
            className={cn(
              'block truncate font-semibold text-muted',
              strip ? 'text-[0.6875rem]' : 'text-[0.71875rem]',
            )}
          >
            {item.label}
          </small>
          <b
            className={cn(
              'num block font-semibold',
              strip ? 'text-lg' : 'text-[1.375rem]',
              item.warn && 'text-warn',
            )}
          >
            {item.value}
          </b>
          <span className="block min-h-4 truncate text-xs text-muted">{item.under}</span>
        </div>
      ))}
    </div>
  );
}

/** A section heading with a rule (the computer's "NOTES ——— newest first"). */
function RuleHeading({ id, title, end }: { id: string; title: string; end: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-2.5 text-xs font-[750] uppercase tracking-[0.06em] text-muted">
      <h2 id={id}>{title}</h2>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
      <span className="font-semibold normal-case tracking-normal">{end}</span>
    </div>
  );
}

function TeamView({ stats }: { stats: TeamStats }) {
  const desktop = useIsDesktop();
  const navigate = useNavigate();
  const location = useLocation();
  const { team } = stats;
  usePageTitle(`Team ${team.number}`);
  usePageCrumb(['Search', `${team.number} ${team.name}`.trim()]);

  const [tab, setTab] = useState<TabKey>('stats');
  const pool = useMemo(() => chartMetrics(stats.metrics), [stats.metrics]);
  const [charts, setCharts] = useState<string[]>(() => [
    pool.find((m) => m.key === POINTS_METRIC_KEY)?.key ?? pool[0]?.key ?? POINTS_METRIC_KEY,
  ]);
  const statusById = useMemo(
    () => new Map(stats.matches.map((m) => [m.entry_id, m.robot_status])),
    [stats.matches],
  );
  const statusOf = (entryId: string): RobotStatus | null => statusById.get(entryId) ?? null;

  // The phone header shrinks to one line once the page is scrolled (with a little hysteresis, so
  // the height it gives back cannot flip it straight back).
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (desktop) {
      setCompact(false);
      return;
    }
    const onScroll = () =>
      setCompact((was) => (was ? window.scrollY > EXPAND_AT : window.scrollY > COMPACT_AT));
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [desktop]);

  /*
   * ONE sticky block (Phase 1 I side task 2: nothing pinned floats): the header and the tabs are
   * in one wrapper that sticks, so the tabs sit right under the header by layout — no measured
   * offset between them, whatever the header's height or its compact transition. On a phone the
   * stat tiles sit between the two and scroll away under the header: the block sticks the tiles'
   * height above the top bar (`--team-tiles`, read from the tiles' own box; they never animate),
   * while the header's own `sticky` keeps it on the bar.
   */
  const root = useRef<HTMLDivElement>(null);
  const tilesBox = useRef<HTMLDivElement>(null);
  const block = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = root.current;
    const tiles = tilesBox.current;
    if (!host) return;
    if (!tiles) {
      host.style.removeProperty('--team-tiles');
      return;
    }
    const publish = () =>
      host.style.setProperty('--team-tiles', `${tiles.getBoundingClientRect().height}px`);
    publish();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(publish);
    observer.observe(tiles, { box: 'border-box' });
    return () => observer.disconnect();
  }, [desktop, stats.entry_count === 0]);

  // A tab chosen while the block is stuck keeps it stuck, with the new panel from its top.
  const sentinel = useRef<HTMLDivElement>(null);
  const keepStuckAt = useRef<number | null>(null);
  const choose = (next: TabKey) => {
    const s = sentinel.current?.getBoundingClientRect().top;
    const b = block.current?.getBoundingClientRect().bottom;
    keepStuckAt.current = s !== undefined && b !== undefined && s < b - 0.5 ? b : null;
    setTab(next);
  };
  useLayoutEffect(() => {
    const at = keepStuckAt.current;
    keepStuckAt.current = null;
    const s = sentinel.current;
    if (at === null || !s) return;
    window.scrollTo({ top: window.scrollY + s.getBoundingClientRect().top - at });
  }, [tab]);

  const back = () => {
    if (location.key !== 'default') void navigate(-1);
    else void navigate(PATHS.teams);
  };

  const headerEl = (
    <TeamHeader
      stats={stats}
      desktop={desktop}
      compact={!desktop && compact && stats.entry_count > 0}
      onBack={back}
    />
  );

  if (stats.entry_count === 0) {
    const where = stats.event?.name ? ` at ${stats.event.name}` : '';
    return (
      <div className="flex flex-1 flex-col">
        {headerEl}
        <main className="w-full px-3.5 pt-[18px] pb-8 lg:max-w-2xl lg:px-8">
          <EmptyState
            icon={Search}
            align="start"
            title="No entries for this team yet"
            detail={`Stats, matches and notes appear here once someone scouts ${team.number}${where}.`}
            action={
              <Link to={PATHS.scout} className={buttonVariants({ variant: 'primary' })}>
                Scout a match
              </Link>
            }
          />
        </main>
      </div>
    );
  }

  const tabs = [
    { key: 'stats' as const, label: 'Stats' },
    { key: 'matches' as const, label: 'Matches', count: stats.match_count },
    { key: 'progress' as const, label: 'Progress' },
    { key: 'notes' as const, label: 'Notes', count: stats.notes.length },
  ];
  const setFirstChart = (key: string) => setCharts((list) => [key, ...list.slice(1)]);
  const first = pool.find((m) => m.key === charts[0]) ?? null;
  const notesCaption = "Long-text answers from this team's entries here · newest first";
  const noNotes = <p className="text-[0.8125rem] text-muted">No notes for this team yet.</p>;

  let panel: ReactNode;
  if (tab === 'stats' && desktop) {
    panel = (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_330px] items-start gap-4 px-8 py-[18px]">
        <div className="flex flex-col gap-3">
          <Tiles stats={stats} />
          <section
            aria-labelledby="team-reliability"
            className="overflow-hidden rounded-card border border-line bg-surface"
          >
            <h2 id="team-reliability" className="px-3.5 pt-3 text-[0.9375rem] font-bold">
              Reliability
            </h2>
            <div className="mt-2 border-t border-line-2">
              <Reliability stats={stats} strip={false} />
            </div>
          </section>
          {first && (
            <section
              aria-labelledby="team-progress"
              className="rounded-card border border-line bg-surface px-3.5 pt-3 pb-2.5"
            >
              <div className="flex items-center gap-2">
                <h2 id="team-progress" className="text-[0.9375rem] font-bold">
                  Progress
                </h2>
                <span className="flex-1" />
                <MetricPicker metrics={pool} value={first.key} onChange={setFirstChart} />
              </div>
              <div className="mt-2 mb-1.5">
                <ProgressionChart metric={first} statusOf={statusOf} height={150} />
              </div>
              {chartHasValues(first) && <ChartLegend metric={first} />}
            </section>
          )}
        </div>
        <StatRows metrics={stats.metrics} />
        <section aria-labelledby="team-notes">
          <RuleHeading id="team-notes" title="Notes" end="newest first" />
          {stats.notes.length > 0 ? <NotesList notes={stats.notes} limit={4} /> : noNotes}
        </section>
      </div>
    );
  } else if (tab === 'stats') {
    panel = (
      <div className="flex flex-col gap-2.5 px-3.5 py-2.5">
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <Reliability stats={stats} strip />
        </div>
        <StatRows metrics={stats.metrics} />
      </div>
    );
  } else if (tab === 'matches') {
    panel = (
      <>
        <MatchStrip matches={stats.matches} />
        {desktop ? (
          <div className="px-8 pt-3.5 pb-8">
            <MatchByMatchTable matches={stats.matches} columns={stats.columns} />
            <p className="mt-2 text-xs text-muted">
              A row opens the entry
              {stats.matches
                .filter((m) => m.robot_status === 'no_show')
                .map(
                  (m) => ` · ${m.match_label ?? 'A match'} was a no-show: no values, not counted`,
                )
                .join('')}
            </p>
          </div>
        ) : (
          <MatchList matches={stats.matches} />
        )}
      </>
    );
  } else if (tab === 'progress') {
    panel = (
      <div className={cn('px-3.5 py-2.5', desktop && 'max-w-3xl px-8 py-[18px]')}>
        <ProgressPanel
          metrics={stats.metrics}
          charts={charts}
          onChange={setCharts}
          statusOf={statusOf}
        />
      </div>
    );
  } else {
    panel = (
      <div className={cn('px-3.5 pt-3 pb-4', desktop && 'max-w-3xl px-8 py-[18px]')}>
        <p className="mb-2 text-xs text-muted">{notesCaption}</p>
        {stats.notes.length > 0 ? <NotesList notes={stats.notes} /> : noNotes}
      </div>
    );
  }

  return (
    <div
      ref={root}
      className="flex flex-1 flex-col"
      // At least a screen tall once the tiles have scrolled away, so a short panel can still be
      // read with the block stuck (a tab chosen while it is stuck keeps it there).
      style={{ minHeight: 'calc(100dvh - var(--top-bar, 0px) + var(--team-tiles, 0px))' }}
    >
      <div
        ref={block}
        data-team-head=""
        className="sticky top-[calc(var(--top-bar,0px)-var(--team-tiles,0px))] z-20"
      >
        {headerEl}
        {!desktop && (
          <div ref={tilesBox} className="border-b border-line bg-surface px-3.5 py-2.5">
            <Tiles stats={stats} />
          </div>
        )}
        <div className={cn('border-b border-line bg-surface', desktop && 'px-8')}>
          <Tabs
            label="Team page"
            tabs={tabs}
            value={tab}
            onChange={choose}
            flush
            fit={desktop}
            tight={!desktop}
          />
        </div>
      </div>
      <main className="flex flex-1 flex-col">
        <div ref={sentinel} aria-hidden="true" />
        <div role="tabpanel" aria-label={TAB_NAME[tab]} data-tab-panel={tab}>
          {panel}
        </div>
      </main>
    </div>
  );
}
