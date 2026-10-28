import { formatDate, formatMetric, formatTime, type RankRow } from '@frc/shared';
import { cachedLiveSlots, cachedRows } from '@/data/cache';
import { db } from '@/data/db';
import { coverage, type CoverageState } from '@/lib/derive/coverage';
import { newestFirst, type LineupSlot } from '@/lib/derive/entries';
import { matchLabel } from '@/lib/matchLabel';
import { rankedCount } from '@/features/ranking/rankedCount';

/*
 * What Home shows, read from the device alone (redesign RB.10): no RPC. The one exception is the
 * ranking (task 1.58b): Our team and Top teams read the ranking page's own source, `useRanking`
 * (`rankTeams` online, the device's `buildRankTable` offline), so Home and /ranking never
 * disagree; `ourTeamOf` and `topTeamsOf` below only pick from its rows. The plain functions are
 * the derivations, tested without React.
 */

type MatchRow = { id: string; event_id: string; match_type: string; number: number };
type TeamRow = { id: string; number: number; name: string };
type EntryRow = {
  id: string;
  event_id: string;
  match_id: string | null;
  team_id: string;
  alliance: 'red' | 'blue';
  scouter_id: string;
  form_kind?: string;
  deleted_at?: string | null;
  client_created_at: string;
};

export type LastEntry = {
  matchId: string;
  teamId: string;
  alliance: 'red' | 'blue';
  match: string;
  teamNumber: number | null;
  teamName: string;
  at: string;
};

/** One coverage square: `scouted` is how many of the match's robots have an entry. */
export type CoverageCell = {
  matchId: string;
  label: string;
  state: CoverageState;
  scouted: number;
};

export type HomeData = {
  lastEntry: LastEntry | null;
  cells: CoverageCell[];
  /** The cached season's year for the desktop crumb, or null when the device holds none. */
  seasonYear: number | null;
};

/** The newest match entry `userId` made at this event, named for the tile. */
export function lastEntryOf(
  entries: EntryRow[],
  matches: MatchRow[],
  teams: TeamRow[],
  eventId: string,
  userId: string,
): LastEntry | null {
  const mine = entries.filter(
    (e) =>
      e.event_id === eventId &&
      e.scouter_id === userId &&
      !e.deleted_at &&
      e.match_id !== null &&
      (e.form_kind ?? 'match') === 'match',
  );
  const newest = newestFirst(mine)[0];
  if (!newest || newest.match_id === null) return null;
  const match = matches.find((m) => m.id === newest.match_id);
  const team = teams.find((t) => t.id === newest.team_id);
  return {
    matchId: newest.match_id,
    teamId: newest.team_id,
    alliance: newest.alliance,
    match: match ? matchLabel(match) : '',
    teamNumber: team?.number ?? null,
    teamName: team?.name ?? '',
    at: newest.client_created_at,
  };
}

/** Schedule coverage for this event's qualification matches, each labelled "Q7". */
export function coverageCells(
  matches: MatchRow[],
  slots: LineupSlot[],
  entries: EntryRow[],
  eventId: string,
): CoverageCell[] {
  const here = matches.filter((m) => m.event_id === eventId);
  const ids = new Set(here.map((m) => m.id));
  const byId = new Map(here.map((m) => [m.id, m]));
  return coverage(
    here.map((m) => ({ id: m.id, type: m.match_type, number: m.number })),
    slots.filter((s) => ids.has(s.match_id)),
    entries.filter((e) => e.event_id === eventId),
  ).map((c) => ({
    matchId: c.matchId,
    label: matchLabel(byId.get(c.matchId)!),
    state: c.state,
    scouted: c.scouted,
  }));
}

/** A coverage square's name, shown on tap, hover and focus (UF.21): "Q12 · 4 scouted". */
export function cellText(cell: CoverageCell): string {
  return `${cell.label} · ${cell.scouted} scouted`;
}

/** "2 min ago" within the hour, "3 h ago" within the day, else the date. */
export function agoText(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return formatDate(iso);
}

type Sync = { waiting: number; lastSyncAt: string | null };

/** The Waiting-to-send tile's note: "Last sync 09:08 · sends when online". */
export function syncNote({ waiting, lastSyncAt }: Sync): string {
  const parts = [
    lastSyncAt ? `Last sync ${formatTime(lastSyncAt)}` : null,
    waiting > 0 ? 'sends when online' : null,
  ].filter((p): p is string => p !== null);
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The phone's one line: "3 entries waiting to send · last sync 09:08" or "Everything is sent". */
export function phoneSyncLine({ waiting, lastSyncAt }: Sync): string {
  const head =
    waiting > 0
      ? `${waiting} ${waiting === 1 ? 'entry' : 'entries'} waiting to send`
      : 'Everything is sent';
  return lastSyncAt ? `${head} · last sync ${formatTime(lastSyncAt)}` : head;
}

/** "4 matches are missing a robot" (one: "1 match is missing a robot"). */
export function missingLine(count: number): string {
  return count === 1 ? '1 match is missing a robot' : `${count} matches are missing a robot`;
}

/** The footer: "version 1.4.0", and on a computer " · 2026-10-02" when the build date is known. */
export function versionLine(version: string, builtAt: string, desktop: boolean): string {
  return desktop && builtAt ? `version ${version} · ${builtAt}` : `version ${version}`;
}

/** The year of the season `eventId` belongs to, from the cached rows. */
async function cachedSeasonYear(eventId: string): Promise<number | null> {
  const event = await db.rows.get(['events', eventId]);
  const seasonId = typeof event?.season_id === 'string' ? event.season_id : null;
  const season = seasonId ? await db.rows.get(['seasons', seasonId]) : undefined;
  return typeof season?.year === 'number' ? season.year : null;
}

/**
 * Everything Home reads from the cached rows, from IndexedDB only. The station is meta and
 * read apart, so a sync tick's meta notifications do not re-read every table.
 */
export async function loadHome(eventId: string, userId: string): Promise<HomeData> {
  const [entries, matches, slots, teams] = await Promise.all([
    cachedRows<EntryRow>('scouting_entries'),
    cachedRows<MatchRow>('matches'),
    cachedLiveSlots<LineupSlot>(),
    cachedRows<TeamRow>('teams'),
  ]);
  return {
    lastEntry: lastEntryOf(entries, matches, teams, eventId, userId),
    cells: coverageCells(matches, slots, entries, eventId),
    seasonYear: await cachedSeasonYear(eventId),
  };
}

/** How many teams Top teams lists (03-home final). */
export const TOP_TEAMS = 5;

/** Places moved since our last match: `places` > 0 is up, < 0 down, 0 no change. */
export type RankMove = { places: number; since: string };

/** The Our-team card (03-home final; task 1.58b): "#3 / 42", the average and the move. */
export type OurTeam = {
  row: RankRow;
  rank: number;
  /** The ranked teams (`rankedCount`, as the ranking page's "Rank 4 of 23"). */
  of: number;
  average: string;
  /** Null with fewer than two counted matches, or while the earlier ranking is not in. */
  move: RankMove | null;
};

/**
 * The qualification match our places-moved is measured from: our latest counted match, once we
 * have two (with one there is no earlier ranking to move from). Read from the same rows as the
 * rank, so the two come from one source.
 */
export function moveMatchOf(row: RankRow | undefined): number | null {
  if (!row || row.rank === null || row.matches_counted < 2) return null;
  return row.last_counted_match;
}

/**
 * Our team in a ranking (`rows`: `useRanking`'s), or null when it is not ranked yet (the card
 * then stays hidden). `before` is the same source's ranking before our last counted match
 * (`useRankingBefore`); the move is our rank then minus our rank now.
 */
export function ourTeamOf(
  rows: readonly RankRow[],
  teamNumber: number,
  before: readonly RankRow[] | null,
): OurTeam | null {
  const row = rows.find((r) => r.number === teamNumber);
  if (!row || row.rank === null) return null;
  const at = moveMatchOf(row);
  const then = before?.find((r) => r.team_id === row.team_id)?.rank ?? null;
  return {
    row,
    rank: row.rank,
    of: rankedCount(rows),
    average: formatMetric(row.average_points),
    move:
      at !== null && then !== null
        ? {
            places: then - row.rank,
            since: matchLabel({ match_type: 'qualification', number: at }),
          }
        : null,
  };
}

/** The move as drawn — "▲2 since Q36", "▼1 since Q36", "No change since Q36" — and as spoken. */
export function moveText(move: RankMove): { shown: string; spoken: string } {
  const n = Math.abs(move.places);
  const places = `${n} ${n === 1 ? 'place' : 'places'}`;
  if (move.places > 0)
    return { shown: `▲${n} since ${move.since}`, spoken: `Up ${places} since ${move.since}` };
  if (move.places < 0)
    return { shown: `▼${n} since ${move.since}`, spoken: `Down ${places} since ${move.since}` };
  return { shown: `No change since ${move.since}`, spoken: `No change since ${move.since}` };
}

/** Top teams: the first five by the canonical rank (whatever any page's sort), ranked teams only. */
export function topTeamsOf(rows: readonly RankRow[]): RankRow[] {
  return rows
    .filter((r): r is RankRow & { rank: number } => r.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, TOP_TEAMS);
}
