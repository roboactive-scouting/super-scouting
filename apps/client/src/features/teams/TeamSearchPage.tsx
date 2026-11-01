import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { SEARCH_TEAMS_MAX_LIMIT, type SearchTeamsOutput } from '@frc/shared';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { FilterChips } from '@/components/ui/filter-chips';
import { LINK_KEY_TEXT, LinkRow, LinkTableRow } from '@/components/ui/link-row';
import { Note } from '@/components/ui/notice';
import { RankBadge } from '@/components/ui/rank-badge';
import { SearchField } from '@/components/ui/search-field';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { typedCall, type Rpc } from '@/data/rpc';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { sessionOverride, useSessionOverride } from '@/features/context/sessionOverride';
import { useCapability } from '@/lib/useCapability';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { useOnline } from '@/lib/useOnline';
import { PATHS, teamPath } from '@/lib/paths';
import { plural } from '@/lib/plural';
import { cn } from '@/lib/utils';
import { CrossEventJump, OtherEventButton } from './CrossEventJump';
import {
  loadCachedTeamSearch,
  matchSpan,
  OUR_TEAM_NUMBER,
  shortEventName,
  teamView,
  type TeamFilter,
  type TeamItem,
} from './teamSearch';

/** At most this many pages of `searchTeams` (200 a page): a season has a few hundred teams. */
const MAX_PAGES = 5;

/** Every season team from the server, ranked at `eventId` (one list; the chips filter it here). */
async function serverTeams(
  rpc: Rpc,
  eventId: string,
): Promise<{ items: TeamItem[]; eventName: string | null }> {
  const items: TeamItem[] = [];
  let eventName: string | null = null;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const out = (await rpc.call('searchTeams', {
      event_id: eventId,
      filter: 'all',
      limit: SEARCH_TEAMS_MAX_LIMIT,
      ...(cursor ? { cursor } : {}),
    })) as SearchTeamsOutput;
    items.push(...out.items);
    eventName = out.event?.name ?? eventName;
    if (!out.next_cursor) break;
    cursor = out.next_cursor;
  }
  return { items, eventName };
}

type Remote =
  | { key: string; status: 'loading' }
  | { key: string; status: 'ok'; items: TeamItem[]; eventName: string | null }
  | { key: string; status: 'failed' };

/** The typed text, highlighted in `--warn-tint` where it matches (23-team-search final). */
function Marked({ text, query, kind }: { text: string; query: string; kind: 'name' | 'number' }) {
  const span = matchSpan(text, query, kind);
  if (!span) return <>{text}</>;
  return (
    <>
      {span[0]}
      <mark className="rounded-[3px] bg-warn-tint text-inherit shadow-[0_0_0_1px_var(--warn-tint)]">
        {span[1]}
      </mark>
      {span[2]}
    </>
  );
}

const entriesLine = (n: number) =>
  n > 0 ? `${plural(n, 'entry', 'entries')} here` : 'no entries yet';

/** The phone sub-line of a team elsewhere: the events we scouted it at, then where it is not. */
function elsewhereLine(team: TeamItem): string {
  const where = team.other_events.map((e) => shortEventName(e.name)).join(', ');
  return where ? `${where} · not at this event` : 'not at this event';
}

/**
 * THEME "Show-all line": a `--bg` line that closes the filtered list while At this event is on —
 * "22 more 2026 teams at other events", or while typing "2 more teams match at other events" —
 * with Show all ›, which selects All, so a search never looks empty when the team exists
 * elsewhere.
 */
function ShowAllLine({
  count,
  typing,
  year,
  onShowAll,
  className,
}: {
  count: number;
  typing: boolean;
  year: number | null;
  onShowAll: () => void;
  className?: string;
}) {
  const what = typing
    ? `${count} more ${count === 1 ? 'team matches' : 'teams match'} at other events`
    : `${count} more ${year === null ? '' : `${year} `}${count === 1 ? 'team' : 'teams'} at other events`;
  return (
    <div
      className={cn(
        'flex items-center gap-2 bg-bg px-3 py-2 text-[0.8125rem] text-muted lg:px-4',
        className,
      )}
    >
      <span className="min-w-0 flex-1">{what}</span>
      <button
        type="button"
        onClick={onShowAll}
        className="tap-target relative -my-2 inline-flex items-center whitespace-nowrap font-[650] text-accent-ink hover:underline"
      >
        Show all ›
      </button>
    </div>
  );
}

/**
 * `/teams` (SPEC-FINAL 13.2; 23-team-search final, variant A2): every team in the season by
 * number or name. At this event is the default chip; a team at the event is a link row to its
 * page with the side rank badge (a medal on the top 3); a team elsewhere gets the dashed Other
 * event button, the cross-event jump. A table on a computer, rows on a phone.
 *
 * Offline is the normal mode at a venue: the list then comes from the device (the season's teams,
 * ranked by the shared helper over the cached entries) and the cross-event path is held. Online,
 * and always under a session override, it comes from `searchTeams` for the effective event.
 */
export function TeamSearchPage({
  eventId,
  rpc = { call: typedCall },
}: {
  /** The admin default event, as the shell resolved it. */
  eventId: string;
  rpc?: Rpc;
}) {
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const online = useOnline();
  /** SPEC-FINAL 9.6: any cross-event view is held offline. */
  const canCross = useCapability('cross_event_view');
  const override = useSessionOverride();
  const effectiveId = override?.eventId ?? eventId;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TeamFilter>('at_event');
  const [jumping, setJumping] = useState<TeamItem | null>(null);
  const [retry, setRetry] = useState(0);

  const cache = useDeviceQuery(() => loadCachedTeamSearch(eventId), [eventId], ['rows']);

  const key = `${effectiveId}|${retry}`;
  const [remote, setRemote] = useState<Remote | null>(null);
  useEffect(() => {
    if (!online) return;
    let live = true;
    setRemote({ key, status: 'loading' });
    serverTeams(rpc, effectiveId).then(
      (out) => live && setRemote({ key, status: 'ok', ...out }),
      () => live && setRemote({ key, status: 'failed' }),
    );
    return () => {
      live = false;
    };
    // rpc is an injected dependency held stable by the caller; a reconnect asks again.
  }, [key, online]);
  const current = online && remote?.key === key ? remote : null;

  // Where the list comes from now.
  let source: { items: TeamItem[]; eventName: string | null; year: number | null } | null = null;
  if (current?.status === 'ok') {
    source = {
      items: current.items,
      eventName: current.eventName ?? (override ? override.eventName : (cache?.eventName ?? null)),
      // The device holds only the default's season; an override may be another season's event.
      year: override ? null : (cache?.seasonYear ?? null),
    };
  } else if (!override && cache) {
    source = { items: cache.items, eventName: cache.eventName, year: cache.seasonYear };
  }

  if (!source) {
    if (override && !online) {
      return (
        <main className="mx-auto w-full px-4 pb-8 pt-5 lg:px-8 lg:pt-6">
          <StateMessage
            variant="offline-needs-server"
            headingLevel={1}
            detail={`${override.eventName ?? 'This event'} is not on this device; its teams need a connection.`}
            action={{
              label: `Back to ${cache?.eventName ? shortEventName(cache.eventName) : 'the default event'}`,
              onClick: () => sessionOverride.clear(),
            }}
          />
        </main>
      );
    }
    if (current?.status === 'failed') {
      return (
        <main className="mx-auto w-full px-4 pb-8 pt-5 lg:px-8 lg:pt-6">
          <StateMessage
            variant="failed"
            headingLevel={1}
            detail="The teams did not load from the server. Try again."
            action={{ label: 'Try again', onClick: () => setRetry((n) => n + 1) }}
          />
        </main>
      );
    }
    return (
      <main className="mx-auto w-full px-4 pb-8 pt-5 lg:px-8 lg:pt-6">
        <Skeleton rows={6} rowHeight="3.75rem" label="Loading the teams" />
      </main>
    );
  }

  const eventName = source.eventName ?? 'this event';
  const here = shortEventName(eventName);
  const total = source.items.length;
  const view = teamView(source.items, query, filter);
  const typing = query.trim() !== '';
  const showAll = filter === 'at_event' && view.counts.other > 0;
  const chips: { key: TeamFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: view.counts.all },
    { key: 'at_event', label: 'At this event', count: view.counts.at_event },
    { key: 'other', label: 'Other events', count: view.counts.other },
  ];
  const openJump = (team: TeamItem) => setJumping(team);
  const showAllLine = (className?: string) => (
    <ShowAllLine
      count={view.counts.other}
      typing={typing}
      year={source.year}
      onShowAll={() => setFilter('all')}
      className={className}
    />
  );

  let list: ReactNode;
  if (view.rows.length === 0 && !showAll) {
    list = typing ? (
      <StateMessage
        variant="no-results"
        detail={`No team in the season matches “${query.trim()}”.`}
        action={{
          label: 'Clear the search',
          onClick: () => {
            setQuery('');
            setFilter('all');
          },
        }}
      />
    ) : (
      <StateMessage
        variant="no-data"
        title="No teams here yet"
        detail="Teams appear once an admin adds them to an event's roster."
        action={{ label: 'Go to Home', to: PATHS.home }}
      />
    );
  } else if (view.rows.length === 0) {
    list = showAllLine('rounded-card border border-line');
  } else if (desktop) {
    list = (
      <>
        <Table containerClassName="rounded-card border border-line bg-surface">
          <TableHeader>
            <TableRow>
              <TableHead className="ps-5">Team</TableHead>
              <TableHead>Rank here</TableHead>
              <TableHead numeric>Entries here</TableHead>
              <TableHead className="pe-5">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.rows.map((team) => {
              const us = team.number === OUR_TEAM_NUMBER;
              const name = (
                <TableCell className="ps-5">
                  <span className={cn('num text-[0.9375rem] font-semibold', LINK_KEY_TEXT)}>
                    <Marked text={String(team.number)} query={query} kind="number" />
                  </span>
                  <span dir="auto" className="ms-2 text-ink-2">
                    <Marked text={team.name} query={query} kind="name" />
                  </span>
                </TableCell>
              );
              if (team.in_active_event) {
                return (
                  <LinkTableRow
                    key={team.id}
                    to={teamPath(team.id)}
                    label={`${team.number} ${team.name}, team page`}
                    endLabel="Team page"
                    tinted={us}
                  >
                    {name}
                    <TableCell>
                      <RankBadge rank={team.rank} none="not ranked yet" />
                    </TableCell>
                    <TableCell numeric>{team.entries_here}</TableCell>
                  </LinkTableRow>
                );
              }
              return (
                <TableRow key={team.id} readOnly className="bg-bg">
                  {name}
                  <TableCell>
                    <RankBadge rank={null} none="not at this event" />
                  </TableCell>
                  <TableCell numeric className="font-normal text-muted">
                    —
                  </TableCell>
                  <TableCell className="py-1.5 pe-5 text-end">
                    <OtherEventButton
                      team={team}
                      disabled={!canCross}
                      onClick={() => openJump(team)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {showAll && showAllLine('mt-2.5 rounded-card border border-line py-3')}
      </>
    );
  } else {
    list = (
      <ul
        aria-label="Teams"
        className="overflow-hidden rounded-card border border-line bg-surface [&>li+li]:border-t [&>li+li]:border-line-2"
      >
        {view.rows.map((team) => {
          const us = team.number === OUR_TEAM_NUMBER;
          const number = (
            <span
              className={cn(
                'num min-w-12 text-lg font-semibold',
                !team.in_active_event && 'text-ink-2',
              )}
            >
              <Marked text={String(team.number)} query={query} kind="number" />
            </span>
          );
          const nameBlock = (sub: string) => (
            <span className="min-w-0 flex-1">
              <b
                dir="auto"
                className={cn(
                  'block truncate text-[0.90625rem] font-[650]',
                  !team.in_active_event && 'text-ink-2',
                )}
              >
                <Marked text={team.name} query={query} kind="name" />
                {us && <span className="text-xs font-medium text-accent-ink"> · us</span>}
              </b>
              <small className="block truncate text-xs text-muted">{sub}</small>
            </span>
          );
          return (
            <li key={team.id}>
              {team.in_active_event ? (
                <LinkRow
                  to={teamPath(team.id)}
                  label={`${team.number} ${team.name}, team page`}
                  tinted={us}
                >
                  {number}
                  {nameBlock(entriesLine(team.entries_here))}
                  <RankBadge rank={team.rank} none="not ranked yet" />
                </LinkRow>
              ) : (
                <div className="flex min-h-[60px] items-center gap-2.5 px-3 py-2">
                  {number}
                  {nameBlock(elsewhereLine(team))}
                  <OtherEventButton
                    team={team}
                    disabled={!canCross}
                    onClick={() => openJump(team)}
                  />
                </div>
              )}
            </li>
          );
        })}
        {showAll && <li>{showAllLine('min-h-12')}</li>}
      </ul>
    );
  }

  return (
    <main className="mx-auto w-full px-4 pb-8 pt-3.5 lg:px-8 lg:pt-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-tight lg:text-[1.625rem]">
          Search teams
        </h1>
        <p dir="auto" className="mt-0.5 text-[0.78125rem] text-muted lg:mt-1 lg:text-[0.84375rem]">
          {[
            source.year === null ? null : `${source.year} season`,
            plural(total, 'team'),
            `ranks from ${eventName}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      <div className="mt-2.5 flex flex-col gap-2.5 lg:mt-3.5 lg:flex-row lg:items-center">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Team number or name"
          label="Search teams"
          className="lg:w-[420px]"
        />
        <div className="-my-2 overflow-x-auto py-2 lg:overflow-visible [&_button]:shrink-0 [&>[role=group]]:flex-nowrap">
          <FilterChips label="Show teams" options={chips} value={filter} onChange={setFilter} />
        </div>
      </div>

      {!canCross && (
        <Note icon="offline" className="mt-2.5 lg:mt-3.5">
          <b className="font-bold text-ink">Offline.</b> Other events need a connection; teams at{' '}
          {here} still open.
        </Note>
      )}

      <div className="mt-2.5 lg:mt-3.5">{list}</div>

      {/* Going offline mid-pick closes it: the whole path is a server read (9.6). */}
      {jumping && canCross && (
        <CrossEventJump
          team={jumping}
          rpc={rpc}
          currentEventName={eventName}
          defaultEventId={eventId}
          defaultEventName={cache?.eventName ?? 'the default event'}
          onClose={() => setJumping(null)}
          onSwitched={(team) => {
            setJumping(null);
            void navigate(teamPath(team.id));
          }}
        />
      )}
    </main>
  );
}
