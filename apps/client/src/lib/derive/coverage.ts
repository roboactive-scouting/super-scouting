import type { LineupSlot } from './entries';

export type CoverageState = 'full' | 'gap' | 'none';

/**
 * Schedule coverage for Home: qualification matches only, by number. 'none' = no entry at
 * all, 'full' = an entry for every slotted team, otherwise 'gap'. Deleted entries and
 * non-match forms do not count.
 */
export function coverage(
  matches: { id: string; type: string; number: number }[],
  slots: LineupSlot[],
  entries: {
    match_id: string | null;
    team_id: string;
    form_kind?: string;
    deleted_at?: string | null;
  }[],
): { matchId: string; number: number; state: CoverageState }[] {
  const scouted = new Set<string>();
  const anyEntry = new Set<string>();
  for (const e of entries) {
    if ((e.form_kind ?? 'match') !== 'match' || e.deleted_at || e.match_id === null) continue;
    scouted.add(`${e.match_id}:${e.team_id}`);
    anyEntry.add(e.match_id);
  }
  const slotsByMatch = new Map<string, LineupSlot[]>();
  for (const s of slots) {
    const list = slotsByMatch.get(s.match_id);
    if (list) list.push(s);
    else slotsByMatch.set(s.match_id, [s]);
  }
  return matches
    .filter((m) => m.type === 'qualification')
    .sort((a, b) => a.number - b.number)
    .map((m) => {
      let state: CoverageState = 'gap';
      if (!anyEntry.has(m.id)) state = 'none';
      else {
        const matchSlots = slotsByMatch.get(m.id) ?? [];
        if (matchSlots.length > 0 && matchSlots.every((s) => scouted.has(`${m.id}:${s.team_id}`)))
          state = 'full';
      }
      return { matchId: m.id, number: m.number, state };
    });
}
