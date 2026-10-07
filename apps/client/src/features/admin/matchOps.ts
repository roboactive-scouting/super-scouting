import {
  createMatchInput,
  MATCH_TYPES,
  updateMatchInput,
  type Alliance,
  type MatchRow,
  type MatchSlot,
  type MatchType,
  type RosterRow,
} from '@frc/shared';
import type { Rpc } from '@/data/rpc';
import { matchLabel } from '@/lib/matchLabel';

/**
 * Plain derivations for the Matches tab and the phone matches view (redesign RB.17),
 * tested without React. SPEC-FINAL 6.4: a match has six alliance stations, each filled
 * from the event roster or left empty; `setMatchTeams` replaces the whole slot set.
 */

export type Station = 1 | 2 | 3;

export const MATCH_TYPE_LABEL: Record<MatchType, string> = {
  practice: 'Practice',
  qualification: 'Qualification',
  playoff: 'Playoff',
};

export const MATCH_TYPE_OPTIONS = MATCH_TYPES.map((key) => ({
  key,
  label: MATCH_TYPE_LABEL[key],
}));

/** Red 1..3 then Blue 1..3: the grid's column order and the wire's slot order. */
export const STATIONS: ReadonlyArray<{ alliance: Alliance; station: Station; label: string }> = [
  { alliance: 'red', station: 1, label: 'Red 1' },
  { alliance: 'red', station: 2, label: 'Red 2' },
  { alliance: 'red', station: 3, label: 'Red 3' },
  { alliance: 'blue', station: 1, label: 'Blue 1' },
  { alliance: 'blue', station: 2, label: 'Blue 2' },
  { alliance: 'blue', station: 3, label: 'Blue 3' },
];

/** The most matches one event's list will follow `next_cursor` through (common.md). */
const MAX_LISTED_MATCHES = 2000;

/** Practice, then qualification, then playoff; by number within a type. */
export function sortMatches(items: readonly MatchRow[]): MatchRow[] {
  return [...items].sort((a, b) => {
    const ta = MATCH_TYPES.indexOf(a.match_type);
    const tb = MATCH_TYPES.indexOf(b.match_type);
    return ta !== tb ? ta - tb : a.number - b.number;
  });
}

/** Every match of one event, following the cursor. A match missing `slots` has none. */
export async function loadAllMatches(rpc: Rpc, eventId: string): Promise<MatchRow[]> {
  const matches: MatchRow[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = (await rpc.call('listMatches', {
      event_id: eventId,
      ...(cursor ? { cursor } : {}),
    })) as
      | {
          items?: Array<Omit<MatchRow, 'slots'> & { slots?: MatchSlot[] }>;
          next_cursor?: string | null;
        }
      | undefined;
    for (const item of page?.items ?? []) matches.push({ ...item, slots: item.slots ?? [] });
    if (!page?.next_cursor || matches.length >= MAX_LISTED_MATCHES) return sortMatches(matches);
    cursor = page.next_cursor;
  }
}

/** The team at one station, or null when it is empty. */
export function slotTeam(match: MatchRow, alliance: Alliance, station: Station): string | null {
  return match.slots.find((s) => s.alliance === alliance && s.station === station)?.team_id ?? null;
}

/** The match's whole new slot set with one station changed or cleared, in station order. */
export function withSlot(
  slots: readonly MatchSlot[],
  alliance: Alliance,
  station: Station,
  teamId: string | null,
): MatchSlot[] {
  const others = slots.filter((s) => !(s.alliance === alliance && s.station === station));
  const next = teamId ? [...others, { alliance, station, team_id: teamId }] : others;
  const order = (s: MatchSlot) => (s.alliance === 'red' ? 0 : 3) + s.station;
  return next.sort((a, b) => order(a) - order(b));
}

export const emptyCount = (match: MatchRow): number => STATIONS.length - match.slots.length;

/** "Q7", "Q7 and Q10", "Q7, Q9 and Q10"; past four labels, "… and 68 more". */
function listLabels(labels: readonly string[]): string {
  if (labels.length === 1) return labels[0] ?? '';
  const shown = labels.length > 4 ? labels.slice(0, 3) : labels.slice(0, -1);
  const last = labels.length > 4 ? `${labels.length - 3} more` : labels[labels.length - 1];
  return `${shown.join(', ')} and ${last}`;
}

/** "Q7 and Q10 are missing robots", or null when every station is filled. */
export function missingLine(matches: readonly MatchRow[]): string | null {
  const labels = matches.filter((m) => emptyCount(m) > 0).map(matchLabel);
  if (labels.length === 0) return null;
  return `${listLabels(labels)} ${labels.length === 1 ? 'is' : 'are'} missing robots`;
}

/** The teams in a line-up that are not on the event roster, each once, in match order. */
export function offRosterTeamIds(
  matches: readonly MatchRow[],
  rosterIds: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  for (const m of matches) {
    for (const s of m.slots) if (!rosterIds.has(s.team_id)) seen.add(s.team_id);
  }
  return [...seen];
}

/** Roster teams whose number starts with, or whose name contains, what was typed. */
export function rosterSuggestions(roster: readonly RosterRow[], typed: string): RosterRow[] {
  const q = typed.trim().toLowerCase();
  if (!q) return [];
  return roster.filter(
    (r) => String(r.number).startsWith(q) || (!/^\d+$/.test(q) && r.name.toLowerCase().includes(q)),
  );
}

export type Typed =
  { kind: 'empty' } | { kind: 'team'; teamId: string } | { kind: 'unknown'; text: string };

/**
 * What a typed station means: blank clears it, a roster team's number (or its exact name)
 * fills it, and the team already there stays even when it has left the roster.
 */
export function resolveTyped(
  typed: string,
  roster: readonly RosterRow[],
  current: { teamId: string; number?: number } | null,
): Typed {
  const text = typed.trim();
  if (!text) return { kind: 'empty' };
  if (current && current.number !== undefined && text === String(current.number)) {
    return { kind: 'team', teamId: current.teamId };
  }
  const lower = text.toLowerCase();
  const hit = roster.find((r) => String(r.number) === text || r.name.toLowerCase() === lower);
  return hit ? { kind: 'team', teamId: hit.team_id } : { kind: 'unknown', text };
}

/** Today's delete confirmation, unchanged (SPEC-FINAL 17.8). */
export const DELETE_MATCH_BODY =
  'This removes the match. It is refused when the match already has entries recorded — correct the match instead.';

/** The phone view's one line about the rest of Manage (README "Phone"). */
export const COMPUTER_LINE = 'Seasons, events and the roster need a computer.';

/** "7845 is not on this event's roster" (README "Problem summary"). */
export const notOnRosterLine = (team: string | number) => `${team} is not on this event's roster`;

/** "Created 1 playoff match." / "Created 0 playoff matches; 1 already existed." */
export function bulkResultLine(type: MatchType, requested: number, created: number): string {
  const noun = `${MATCH_TYPE_LABEL[type].toLowerCase()} ${created === 1 ? 'match' : 'matches'}`;
  return created < requested
    ? `Created ${created} ${noun}; ${requested - created} already existed.`
    : `Created ${created} ${noun}.`;
}

/** The next free number of a type: the create-one field's placeholder ("73"). */
export function nextNumber(matches: readonly MatchRow[], type: MatchType): number {
  return matches.reduce((n, m) => (m.match_type === type ? Math.max(n, m.number) : n), 0) + 1;
}

export type MatchPatch = { match_type?: MatchType; number?: number };

/**
 * The changed type and number of a match, each checked by the shared schema's own rule
 * (today's EditMatchForm). An empty patch is fine here: the phone sheet may change only
 * the line-up; the desktop dialog says "Change something before saving." itself.
 */
export function matchPatch(
  match: MatchRow,
  type: MatchType,
  numberText: string,
): { patch: MatchPatch } | { error: string } {
  const patch: MatchPatch = {};
  if (type !== match.match_type) patch.match_type = type;
  const parsed = Number(numberText);
  if (parsed !== match.number) {
    const checked = updateMatchInput.innerType().shape.number.safeParse(parsed);
    if (!checked.success) return { error: checked.error.issues[0]?.message ?? 'that is not valid' };
    patch.number = checked.data;
  }
  return { patch };
}

/** A create field's own check, as the shared schema words it: the number, or why not. */
export function checkCreateField(field: 'count' | 'number', value: string): number | string {
  const parsed = createMatchInput.innerType().shape[field].safeParse(Number(value));
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'that is not valid';
  return parsed.data ?? 0;
}

/** A copy of `set` with `id` added (`on`) or dropped. */
export function toggled(set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}
