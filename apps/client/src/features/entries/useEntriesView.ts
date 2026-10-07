import { useMemo, useState } from 'react';
import { formatDate, formatTime } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { db } from '@/data/db';
import { rejectedRows } from '@/data/outbox';
import { rejectionMessage } from '@/data/rejections';
import type { Station } from '@/data/station';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import {
  matchesSearch,
  needsLook,
  newestFirst,
  notInLineup,
  stationOf,
} from '@/lib/derive/entries';
import type { LineupSlot } from '@/lib/derive/entries';
import { matchLabel } from '@/lib/matchLabel';

export type EntryStatus = 'played' | 'broke_down' | 'disabled' | 'no_show';
export type EntriesFilter = 'all' | 'mine' | 'waiting' | 'look';

export type EntryRow = {
  id: string;
  matchLabel: string;
  matchNumber: number | null;
  /** The driver station from the match line-up, or null when the team is not in it. */
  station: Station | null;
  alliance: 'red' | 'blue';
  teamNumber: number | null;
  teamName: string;
  status: EntryStatus | null;
  scouter: string;
  scouterId: string;
  /** Time only when the entry is from today, else the date and the time. */
  time: string;
  /** Still in the outbox and not refused: it will be sent. */
  waiting: boolean;
  /** Why the server refused it ("This entry is locked — ask a lead"), or null. */
  refused: string | null;
  notInLineup: boolean;
  /** Refused by the server or not in the line-up: the "Needs a look" chip. */
  look: boolean;
};

type Raw = Record<string, unknown>;
export type EntriesSource = {
  eventId: string;
  entries: Raw[];
  matches: Raw[];
  teams: Raw[];
  users: Raw[];
  slots: LineupSlot[];
  /** row_id → the refusal's one line. */
  refusals: Map<string, string>;
  /** row_ids of entries still in the outbox. */
  outboxIds: Set<string>;
  now: Date;
};

const STATUSES: readonly string[] = ['played', 'broke_down', 'disabled', 'no_show'];

/**
 * "11:41" for today, "17/03/2026 11:41" for any other day (SPEC-FINAL 17.8); "—" when the
 * entry carries no time at all.
 */
export function timeLabel(iso: string, now: Date): string {
  if (iso === '' || Number.isNaN(new Date(iso).getTime())) return '—';
  const time = formatTime(iso);
  return formatDate(iso) === formatDate(now.toISOString()) ? time : `${formatDate(iso)} ${time}`;
}

const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** Every live match entry of the event, newest first. Pure: no database, no clock. */
export function buildEntryRows(src: EntriesSource): EntryRow[] {
  const matchById = new Map(src.matches.map((m) => [String(m.id), m]));
  const teamById = new Map(src.teams.map((t) => [String(t.id), t]));
  const userById = new Map(src.users.map((u) => [String(u.id), u]));
  const live = src.entries
    .filter((e) => e.event_id === src.eventId && e.deleted_at == null && e.form_kind !== 'super')
    .map((e) => ({
      e,
      client_created_at: text(e.client_created_at) || text(e.client_updated_at),
    }));
  return newestFirst(live).map(({ e, client_created_at }) => {
    const id = String(e.id);
    const matchId = String(e.match_id);
    const teamId = String(e.team_id);
    const alliance = e.alliance === 'blue' ? 'blue' : 'red';
    const match = matchById.get(matchId);
    const team = teamById.get(teamId);
    const refusal = src.refusals.get(id) ?? null;
    return {
      id,
      matchLabel: match
        ? matchLabel({ match_type: text(match.match_type), number: Number(match.number) })
        : '',
      matchNumber: match ? Number(match.number) : null,
      station: stationOf(src.slots, matchId, teamId),
      alliance,
      teamNumber: team ? Number(team.number) : null,
      teamName: text(team?.name),
      status: STATUSES.includes(String(e.robot_status)) ? (e.robot_status as EntryStatus) : null,
      scouter: text(userById.get(String(e.scouter_id))?.full_name),
      scouterId: String(e.scouter_id),
      time: timeLabel(client_created_at, src.now),
      waiting: src.outboxIds.has(id) && refusal === null,
      refused: refusal,
      notInLineup: notInLineup(src.slots, matchId, teamId, alliance),
      look: needsLook(
        { id, match_id: matchId, team_id: teamId, alliance },
        src.slots,
        new Set(refusal === null ? [] : [id]),
      ),
    };
  });
}

export function searchRows(rows: EntryRow[], query: string): EntryRow[] {
  return rows.filter((r) =>
    matchesSearch(query, [r.teamNumber, r.teamName, r.matchLabel, r.matchNumber, r.scouter]),
  );
}

const PICK: Record<EntriesFilter, (r: EntryRow, me: string) => boolean> = {
  all: () => true,
  mine: (r, me) => r.scouterId === me,
  waiting: (r) => r.waiting,
  look: (r) => r.look,
};

export function filterRows(rows: EntryRow[], filter: EntriesFilter, me: string): EntryRow[] {
  return rows.filter((r) => PICK[filter](r, me));
}

/** Chip counts follow the search: "All 4" after searching "Noa". */
export function chipCounts(searched: EntryRow[], me: string): Record<EntriesFilter, number> {
  return {
    all: searched.length,
    mine: filterRows(searched, 'mine', me).length,
    waiting: filterRows(searched, 'waiting', me).length,
    look: filterRows(searched, 'look', me).length,
  };
}

async function loadSource(eventId: string): Promise<EntriesSource> {
  const [entries, matches, teams, users, slots, rejected, outbox] = await Promise.all([
    cachedRows('scouting_entries'),
    cachedRows('matches'),
    cachedRows('teams'),
    cachedRows('users'),
    cachedRows<LineupSlot>('match_teams'),
    rejectedRows(),
    db.outbox.filter((op) => op.entity === 'scouting_entry').toArray(),
  ]);
  return {
    eventId,
    entries,
    matches,
    teams,
    users,
    slots,
    refusals: new Map(
      rejected.flatMap((s) =>
        s.rejection ? [[s.row_id, rejectionMessage(s.rejection)] as const] : [],
      ),
    ),
    outboxIds: new Set(outbox.map((op) => op.row_id)),
    now: new Date(),
  };
}

/**
 * The Entries page's data, all from this device (SPEC-FINAL 17.9). Reads once and again when
 * rows or the outbox change; search and filter run in memory over what was read.
 */
export function useEntriesView(eventId: string, me: string) {
  const all = useDeviceQuery(
    async () => buildEntryRows(await loadSource(eventId)),
    [eventId],
    ['rows', 'outbox'],
  );
  const [filter, setFilter] = useState<EntriesFilter>('all');
  const [query, setQuery] = useState('');
  const view = useMemo(() => {
    if (!all) return null;
    const searched = searchRows(all, query);
    return {
      rows: filterRows(searched, filter, me),
      counts: chipCounts(searched, me),
    };
  }, [all, query, filter, me]);
  return {
    loading: view === null,
    total: all?.length ?? 0,
    rows: view?.rows ?? [],
    counts: view?.counts ?? { all: 0, mine: 0, waiting: 0, look: 0 },
    filter,
    setFilter,
    query,
    setQuery,
  };
}
