import { formatDate, formatTime } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { db } from '@/data/db';
import { coverage, type CoverageState } from '@/lib/derive/coverage';
import { newestFirst, type LineupSlot } from '@/lib/derive/entries';
import { matchLabel } from '@/lib/matchLabel';

/*
 * What Home shows, read from the device alone (redesign RB.10): no RPC, ever. The plain
 * functions below are the derivations, tested without React.
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
    cachedRows<LineupSlot>('match_teams'),
    cachedRows<TeamRow>('teams'),
  ]);
  return {
    lastEntry: lastEntryOf(entries, matches, teams, eventId, userId),
    cells: coverageCells(matches, slots, entries, eventId),
    seasonYear: await cachedSeasonYear(eventId),
  };
}
