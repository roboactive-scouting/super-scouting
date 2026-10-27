import { useMemo, useState } from 'react';
import { formatDate, formatTime, scoutedPoints } from '@frc/shared';
import { cachedLiveSlots, cachedRows } from '@/data/cache';
import { db } from '@/data/db';
import { rejectedRows } from '@/data/outbox';
import { rejectionMessage } from '@/data/rejections';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { matchesSearch, newestFirst, notInLineup } from '@/lib/derive/entries';
import type { LineupSlot } from '@/lib/derive/entries';
import { entryData, robotStatusOf, scoringCache, type ScoringRows } from '@/lib/derive/scoring';
import { matchLabel } from '@/lib/matchLabel';

export type EntryStatus = 'played' | 'broke_down' | 'disabled' | 'no_show';
export type EntriesFilter = 'all' | 'mine' | 'waiting' | 'look';
/** The kind switch (26-entry-search final): Both by default. */
export type EntriesKind = 'both' | 'match' | 'super';

export type EntryRow = {
  id: string;
  kind: 'match' | 'super';
  /** "Q38"; '' for a super entry (the list shows "—"). */
  matchLabel: string;
  matchNumber: number | null;
  teamNumber: number | null;
  teamName: string;
  /** A match entry's robot status; null for a super entry. */
  status: EntryStatus | null;
  scouter: string;
  scouterId: string;
  /** Time only when the entry is from today, else the date and the time. */
  time: string;
  /**
   * The scouted points (`scoutedPoints` from @frc/shared, scored with the form's ACTIVE
   * version): null for a no-show or disabled robot ("—"), for a super entry (no score), and when
   * the device does not hold the entry's form.
   */
  points: number | null;
  /** Still in the outbox and not refused: it will be sent (the amber ↑ beside the time). */
  waiting: boolean;
  /**
   * Still in the outbox, refused or not: the "Waiting" chip (README: "still in the outbox"), so
   * the chip agrees with the shell's waiting count (SPEC-FINAL 9.10 keeps a refused record in
   * the unsynced count until it is fixed). RB.19.
   */
  unsent: boolean;
  /** Why the server refused it ("Changed after the 5-minute edit window. …"), or null. */
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
  /** The cached forms, versions, fields and rules the points are scored with. */
  scoring?: ScoringRows;
  /** row_id → the refusal's one line. */
  refusals: Map<string, string>;
  /** row_ids of entries still in the outbox. */
  outboxIds: Set<string>;
  now: Date;
};

const NO_SCORING: ScoringRows = { forms: [], versions: [], fields: [], rules: [] };

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

/**
 * Every live entry of the event, match and super, newest first (SPEC-FINAL 13.3, v1.43). Pure:
 * no database, no clock. Another event's entries and soft-deleted ones never appear.
 */
export function buildEntryRows(src: EntriesSource): EntryRow[] {
  const matchById = new Map(src.matches.map((m) => [String(m.id), m]));
  const teamById = new Map(src.teams.map((t) => [String(t.id), t]));
  const userById = new Map(src.users.map((u) => [String(u.id), u]));
  const scoring = scoringCache(src.scoring ?? NO_SCORING);
  const live = src.entries
    .filter((e) => e.event_id === src.eventId && e.deleted_at == null)
    .map((e) => ({
      e,
      client_created_at: text(e.client_created_at) || text(e.client_updated_at),
    }));
  return newestFirst(live).map(({ e, client_created_at }) => {
    const id = String(e.id);
    const kind = e.form_kind === 'super' ? 'super' : 'match';
    const teamId = String(e.team_id);
    const team = teamById.get(teamId);
    const refusal = src.refusals.get(id) ?? null;
    const status = kind === 'super' ? null : robotStatusOf(e.robot_status);
    const forms = scoring(String(e.form_version_id));
    const points =
      kind === 'super' || !forms
        ? null
        : scoutedPoints(
            { form_kind: kind, robot_status: status, data: entryData(e) },
            forms.fields,
            forms.rules,
          );
    let label = '';
    let matchNumber: number | null = null;
    let offLineup = false;
    if (kind === 'match') {
      const matchId = String(e.match_id);
      const match = matchById.get(matchId);
      label = match
        ? matchLabel({ match_type: text(match.match_type), number: Number(match.number) })
        : '';
      matchNumber = match ? Number(match.number) : null;
      offLineup = notInLineup(src.slots, matchId, teamId, e.alliance === 'blue' ? 'blue' : 'red');
    }
    return {
      id,
      kind,
      matchLabel: label,
      matchNumber,
      teamNumber: team ? Number(team.number) : null,
      teamName: text(team?.name),
      status,
      scouter: text(userById.get(String(e.scouter_id))?.full_name),
      scouterId: String(e.scouter_id),
      time: timeLabel(client_created_at, src.now),
      points,
      waiting: src.outboxIds.has(id) && refusal === null,
      unsent: src.outboxIds.has(id),
      refused: refusal,
      notInLineup: offLineup,
      look: refusal !== null || offLineup,
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
  waiting: (r) => r.unsent,
  look: (r) => r.look,
};

export function filterRows(rows: EntryRow[], filter: EntriesFilter, me: string): EntryRow[] {
  return rows.filter((r) => PICK[filter](r, me));
}

export function kindRows(rows: EntryRow[], kind: EntriesKind): EntryRow[] {
  return kind === 'both' ? rows : rows.filter((r) => r.kind === kind);
}

/** Chip counts follow the search and the kind: "All 4" after searching "Noa". */
export function chipCounts(searched: EntryRow[], me: string): Record<EntriesFilter, number> {
  return {
    all: searched.length,
    mine: filterRows(searched, 'mine', me).length,
    waiting: filterRows(searched, 'waiting', me).length,
    look: filterRows(searched, 'look', me).length,
  };
}

/** The kind switch's counts follow the search and the chip: "Both 3 · Match 3 · Super 0". */
export function kindCounts(rows: EntryRow[]): Record<EntriesKind, number> {
  const supers = rows.filter((r) => r.kind === 'super').length;
  return { both: rows.length, match: rows.length - supers, super: supers };
}

async function loadSource(eventId: string): Promise<EntriesSource> {
  const [entries, matches, teams, users, slots, forms, versions, fields, rules, rejected, outbox] =
    await Promise.all([
      cachedRows('scouting_entries'),
      cachedRows('matches'),
      cachedRows('teams'),
      cachedRows('users'),
      cachedLiveSlots<LineupSlot>(),
      cachedRows('forms'),
      cachedRows('form_versions'),
      cachedRows('form_fields'),
      cachedRows('scoring_rules'),
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
    scoring: { forms, versions, fields, rules },
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
 * The Entries page's data, all from this device (SPEC-FINAL 17.9, 13.3). Reads once and again
 * when rows or the outbox change; search, kind and chip run in memory over what was read.
 */
export function useEntriesView(eventId: string, me: string) {
  const all = useDeviceQuery(
    async () => buildEntryRows(await loadSource(eventId)),
    [eventId],
    ['rows', 'outbox'],
  );
  return useRowsView(all, me);
}

/**
 * Search, kind and chip over a list already read (null or undefined while it loads): the device's rows, or the
 * server's under a session override (`serverEntries.ts`).
 */
export function useRowsView(all: EntryRow[] | null | undefined, me: string) {
  const [filter, setFilter] = useState<EntriesFilter>('all');
  const [kind, setKind] = useState<EntriesKind>('both');
  const [query, setQuery] = useState('');
  const view = useMemo(() => {
    if (!all) return null;
    const searched = searchRows(all, query);
    const ofKind = kindRows(searched, kind);
    return {
      rows: filterRows(ofKind, filter, me),
      counts: chipCounts(ofKind, me),
      kinds: kindCounts(filterRows(searched, filter, me)),
    };
  }, [all, query, filter, kind, me]);
  return {
    loading: view === null,
    total: all?.length ?? 0,
    rows: view?.rows ?? [],
    counts: view?.counts ?? { all: 0, mine: 0, waiting: 0, look: 0 },
    kinds: view?.kinds ?? { both: 0, match: 0, super: 0 },
    filter,
    setFilter,
    kind,
    setKind,
    query,
    setQuery,
  };
}

export type EntriesView = ReturnType<typeof useRowsView>;
