import { cachedRows } from '@/data/cache';
import { matchLabel } from '@/lib/matchLabel';
import { localEntries, type LocalEntry } from './localEntries';

type EventRow = { id: string; season_id: string; name: string };
type FormRow = { id: string; kind: string; season_id: string; active_version_id: string | null };
type AppSettingsRow = { active_season_id: string | null };
type TeamRow = { id: string; number: number; name: string };
type RosterRow = { event_id: string; team_id: string; deleted_at: string | null };
type MatchRow = { id: string; event_id?: string; match_type: string; number: number };

/** One roster team as the super picker shows it (15-super final). */
export type SuperTeam = {
  id: string;
  number: number;
  name: string;
  /** The matches this device's scout scouted the team in, in match order: "Q12", "Q19". */
  seen: string[];
  /** This device's super entry for the team at this event, if it holds one (SPEC-FINAL 8.1). */
  entry: LocalEntry | undefined;
};

export type SuperData = {
  eventName: string;
  /** The active season's super form's published version; null while there is none. */
  formVersionId: string | null;
  teams: SuperTeam[];
};

/** Matches in the order they are played: practice, then qualifications, then playoffs. */
const TYPE_ORDER: Record<string, number> = { practice: 0, qualification: 1, playoff: 2 };

/**
 * Everything the super picker and form read, from what the device already holds — no server
 * query (15-super README): the event, its season's `super` form (resolved by kind, never chosen,
 * SPEC-FINAL 8.1), the event roster, this device's super entries, and the scout's own match
 * entries (what "seen in 4 matches here" counts). "Here" is the signed-in scout on this device:
 * a pulled match entry by someone else on another device was not seen here.
 */
export async function loadSuper(eventId: string, scoutId: string): Promise<SuperData> {
  const [events, forms, settings, teams, roster, matches, entries] = await Promise.all([
    cachedRows<EventRow>('events'),
    cachedRows<FormRow>('forms'),
    cachedRows<AppSettingsRow>('app_settings'),
    cachedRows<TeamRow>('teams'),
    cachedRows<RosterRow>('event_teams'),
    cachedRows<MatchRow>('matches'),
    localEntries(eventId),
  ]);
  const event = events.find((e) => e.id === eventId);
  // As EntryRoute: the event's own season, else the default's when the event row is missing.
  const seasonId = event?.season_id ?? settings[0]?.active_season_id ?? null;
  const form = forms.find((f) => f.kind === 'super' && f.season_id === seasonId);
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const seenBy = new Map<string, Set<string>>();
  const superBy = new Map<string, LocalEntry>();
  for (const entry of entries) {
    if (entry.form_kind === 'super') {
      superBy.set(entry.team_id, entry);
    } else if (entry.scouter_id === scoutId && entry.match_id) {
      const set = seenBy.get(entry.team_id) ?? new Set<string>();
      set.add(entry.match_id);
      seenBy.set(entry.team_id, set);
    }
  }
  const labels = (teamId: string) =>
    [...(seenBy.get(teamId) ?? [])]
      .map((id) => matchById.get(id))
      .filter((m): m is MatchRow => m !== undefined)
      .sort(
        (a, b) =>
          (TYPE_ORDER[a.match_type] ?? 9) - (TYPE_ORDER[b.match_type] ?? 9) || a.number - b.number,
      )
      .map(matchLabel);

  return {
    eventName: event?.name ?? 'This competition',
    formVersionId: form?.active_version_id ?? null,
    teams: roster
      .filter((r) => r.event_id === eventId && r.deleted_at == null)
      .map((r) => teamById.get(r.team_id))
      .filter((t): t is TeamRow => t !== undefined)
      .map((t) => ({
        id: t.id,
        number: t.number,
        name: t.name,
        seen: labels(t.id),
        entry: superBy.get(t.id),
      })),
  };
}

export type SuperFilter = 'todo' | 'done' | 'all';

/**
 * The picker's list (15-super README): to do first, the teams this device saw most at the top
 * (then by number); done after, by number. A search matches the number's start or the name.
 */
export function superList(teams: readonly SuperTeam[], filter: SuperFilter, query: string) {
  const q = query.trim().toLowerCase();
  const found = teams.filter(
    (t) => q === '' || String(t.number).startsWith(q) || t.name.toLowerCase().includes(q),
  );
  const todo = found
    .filter((t) => !t.entry)
    .sort((a, b) => b.seen.length - a.seen.length || a.number - b.number);
  const done = found.filter((t) => t.entry).sort((a, b) => a.number - b.number);
  if (filter === 'todo') return todo;
  if (filter === 'done') return done;
  return [...todo, ...done];
}
