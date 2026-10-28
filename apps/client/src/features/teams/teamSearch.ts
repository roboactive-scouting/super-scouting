import { rankByAveragePoints, type TeamSearchItem } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { formScoring, toEngineEntry } from '@/lib/derive/scoring';

/*
 * Team search (SPEC-FINAL 13.2, task 1.51) as plain functions: the device's own list (offline,
 * the normal mode at a venue), the search, the order, the chips. The page is TeamSearchPage.tsx.
 */

/** One team as the page lists it: the server's `searchTeams` item, or the device's twin. */
export type TeamItem = TeamSearchItem;

/** The chips: All · At this event · Other events. At this event is the default (A2). */
export type TeamFilter = 'all' | 'at_event' | 'other';

/** Our own team (ROBACTIVE): its row is tinted and marked "· us" (23-team-search final). */
export { OUR_TEAM_NUMBER } from '@/lib/ourTeam';

/**
 * Whether a team matches what was typed, exactly as the server's `searchTeams` decides: the
 * name holds the text (any case), or the text is digits and the number starts with them.
 */
export function teamHit(team: { number: number; name: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    team.name.toLowerCase().includes(q) || (/^\d+$/.test(q) && String(team.number).startsWith(q))
  );
}

/** At-event teams by rank (unranked last, by number), then the others by number (13.2). */
export function orderTeams(items: readonly TeamItem[]): TeamItem[] {
  const here = items
    .filter((t) => t.in_active_event)
    .sort((a, b) => {
      if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      return a.number - b.number;
    });
  const elsewhere = items.filter((t) => !t.in_active_event).sort((a, b) => a.number - b.number);
  return [...here, ...elsewhere];
}

export type TeamCounts = { all: number; at_event: number; other: number };

/** What the list shows for a query and a chip; the counts follow the query, not the chip. */
export function teamView(
  items: readonly TeamItem[],
  query: string,
  filter: TeamFilter,
): { rows: TeamItem[]; counts: TeamCounts } {
  const hits = orderTeams(items.filter((t) => teamHit(t, query)));
  const here = hits.filter((t) => t.in_active_event);
  const elsewhere = hits.filter((t) => !t.in_active_event);
  const rows = filter === 'at_event' ? here : filter === 'other' ? elsewhere : hits;
  return { rows, counts: { all: hits.length, at_event: here.length, other: elsewhere.length } };
}

/** The event's short name, as the design says it: "District #3 · Tel Aviv" → "District #3". */
export function shortEventName(name: string): string {
  return name.split(' · ')[0] ?? name;
}

/** "Mar 2026": when we last held an entry for a team at an event (the event picker's line). */
export function monthYear(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(
    new Date(iso),
  );
}

/** The matched part of `text`, for the `--warn-tint` highlight: [before, match, after] or null. */
export function matchSpan(
  text: string,
  query: string,
  kind: 'name' | 'number',
): [string, string, string] | null {
  const q = query.trim();
  if (!q) return null;
  if (kind === 'number') {
    return /^\d+$/.test(q) && text.startsWith(q) ? ['', q, text.slice(q.length)] : null;
  }
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  return at < 0
    ? null
    : [text.slice(0, at), text.slice(at, at + q.length), text.slice(at + q.length)];
}

// ---------------------------------------------------------------------------------------
// The device's list (offline): the cache holds every team of the season (SPEC-FINAL 9.3) and
// the active event's roster, schedule and entries — never another event's.

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const live = (r: Row) => r.deleted_at == null;

export type CachedTeamSearch = {
  items: TeamItem[];
  /** The cached event's name, or null when the device holds no row for it. */
  eventName: string | null;
  /** The year of the event's season, or null when the device does not hold it. */
  seasonYear: number | null;
};

/**
 * The season's teams as the device holds them, ranked at `eventId` by the SAME shared helper the
 * server ranks with (`rankByAveragePoints`, task 1.50) over the cached live match entries, scored
 * with the season match form's ACTIVE version's fields and the form's rules — so offline and
 * online agree. `entries_here` counts the event's live entries of both kinds, as the server
 * does. The device holds no other event, so `other_events` is empty.
 */
export async function loadCachedTeamSearch(eventId: string): Promise<CachedTeamSearch> {
  const [events, seasons, teams, roster, entries, matches, forms, fields, rules] =
    await Promise.all([
      cachedRows<Row>('events'),
      cachedRows<Row>('seasons'),
      cachedRows<Row>('teams'),
      cachedRows<Row>('event_teams'),
      cachedRows<Row>('scouting_entries'),
      cachedRows<Row>('matches'),
      cachedRows<Row>('forms'),
      cachedRows<Row>('form_fields'),
      cachedRows<Row>('scoring_rules'),
    ]);
  const event = events.find((e) => e.id === eventId);
  const seasonId = str(event?.season_id);
  const season = seasons.find((s) => s.id === seasonId);

  const atEvent = new Set(
    roster.filter((r) => r.event_id === eventId && live(r)).map((r) => String(r.team_id)),
  );
  const here = entries.filter((e) => e.event_id === eventId && live(e));
  const entriesHere = new Map<string, number>();
  for (const e of here) {
    const id = String(e.team_id);
    entriesHere.set(id, (entriesHere.get(id) ?? 0) + 1);
  }

  const seasonTeams = teams
    .filter(live)
    .map((t) => ({ id: String(t.id), number: Number(t.number), name: String(t.name ?? '') }));

  const rank = new Map<string, number | null>();
  const form = forms.find((f) => f.season_id === seasonId && f.kind === 'match' && live(f));
  const scoring =
    form && str(form.active_version_id)
      ? formScoring(String(form.id), { forms, versions: [], fields, rules })
      : null;
  if (scoring) {
    const byId = new Map(matches.map((m) => [String(m.id), m]));
    const sortOrder = typeof event?.sort_order === 'number' ? event.sort_order : 0;
    const ranks = rankByAveragePoints(
      here.filter((e) => e.form_kind !== 'super').map((e) => toEngineEntry(e, byId, sortOrder)),
      seasonTeams.filter((t) => atEvent.has(t.id)),
      scoring.fields,
      scoring.rules,
    );
    for (const r of ranks) rank.set(r.team_id, r.rank);
  }

  return {
    items: orderTeams(
      seasonTeams.map((t) => ({
        ...t,
        in_active_event: atEvent.has(t.id),
        rank: atEvent.has(t.id) ? (rank.get(t.id) ?? null) : null,
        entries_here: entriesHere.get(t.id) ?? 0,
        other_events: [],
      })),
    ),
    eventName: str(event?.name),
    seasonYear: typeof season?.year === 'number' ? season.year : null,
  };
}
