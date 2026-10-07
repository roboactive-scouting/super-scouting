import type { Station } from '@/data/station';

export type LineupSlot = {
  match_id: string;
  team_id: string;
  alliance: 'red' | 'blue';
  station: 1 | 2 | 3;
};

/** The station a team holds in a match, e.g. 'B2', or null when it is not in the line-up. */
export function stationOf(slots: LineupSlot[], matchId: string, teamId: string): Station | null {
  const slot = slots.find((s) => s.match_id === matchId && s.team_id === teamId);
  if (!slot) return null;
  return `${slot.alliance === 'red' ? 'R' : 'B'}${slot.station}` as Station;
}

/**
 * True only when the match HAS line-up slots for that alliance and the team is not among
 * them. A match with no line-up (a bare match) never flags (Scout README).
 */
export function notInLineup(
  slots: LineupSlot[],
  matchId: string,
  teamId: string,
  alliance: 'red' | 'blue',
): boolean {
  let hasAlliance = false;
  for (const s of slots) {
    if (s.match_id !== matchId || s.alliance !== alliance) continue;
    if (s.team_id === teamId) return false;
    hasAlliance = true;
  }
  return hasAlliance;
}

/** An entry needs a look when the server refused it or its team is outside the line-up. */
export function needsLook(
  e: { id: string; match_id: string; team_id: string; alliance: 'red' | 'blue' },
  slots: LineupSlot[],
  refusedIds: Set<string>,
): boolean {
  return refusedIds.has(e.id) || notInLineup(slots, e.match_id, e.team_id, e.alliance);
}

/** A copy ordered by `client_created_at`, newest first. */
export function newestFirst<T extends { client_created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.client_created_at.localeCompare(a.client_created_at));
}

/**
 * Case-insensitive, trimmed. A number field matches by prefix (typing "59" finds 5951);
 * text fields match by substring. An empty query matches everything.
 */
export function matchesSearch(q: string, fields: (string | number | null | undefined)[]): boolean {
  const needle = q.trim().toLowerCase();
  if (needle === '') return true;
  return fields.some((f) => {
    if (f === null || f === undefined) return false;
    if (typeof f === 'number') return String(f).startsWith(needle);
    return f.toLowerCase().includes(needle);
  });
}
