import type { LineupSlot } from './entries';

export type CoverageState = 'full' | 'gap' | 'none';

/**
 * Schedule coverage for Home: qualification matches only, by number. 'none' = no entry at
 * all, 'full' = an entry for every slotted team, otherwise 'gap'. `scouted` = how many
 * robots of the match have an entry (UF.21: "Q12 · 4 scouted"). Deleted entries and
 * non-match forms do not count.
 *
 * One square per match NUMBER, not per row (UF.22): a device that made a match twice before
 * that fix holds two rows for it until both push and the server merges them. Their robots are
 * merged, judged against the line-up of whichever copy has one; the square names the copy with
 * a line-up, else the first.
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
): { matchId: string; number: number; state: CoverageState; scouted: number }[] {
  /** The robots scouted in each match: match id → team ids with a live match entry. */
  const scouted = new Map<string, Set<string>>();
  for (const e of entries) {
    if ((e.form_kind ?? 'match') !== 'match' || e.deleted_at || e.match_id === null) continue;
    const teams = scouted.get(e.match_id);
    if (teams) teams.add(e.team_id);
    else scouted.set(e.match_id, new Set([e.team_id]));
  }
  const slotsByMatch = new Map<string, LineupSlot[]>();
  for (const s of slots) {
    const list = slotsByMatch.get(s.match_id);
    if (list) list.push(s);
    else slotsByMatch.set(s.match_id, [s]);
  }
  /** Qualification number → the ids of every row this device holds for it, in input order. */
  const copies = new Map<number, string[]>();
  for (const m of matches) {
    if (m.type !== 'qualification') continue;
    const ids = copies.get(m.number);
    if (ids) ids.push(m.id);
    else copies.set(m.number, [m.id]);
  }
  return [...copies]
    .sort(([a], [b]) => a - b)
    .map(([number, ids]) => {
      const lined = ids.find((id) => slotsByMatch.has(id));
      const matchSlots = lined ? slotsByMatch.get(lined)! : [];
      const teams = new Set(ids.flatMap((id) => [...(scouted.get(id) ?? [])]));
      let state: CoverageState = 'gap';
      if (teams.size === 0) state = 'none';
      else if (matchSlots.length > 0 && matchSlots.every((s) => teams.has(s.team_id))) {
        state = 'full';
      }
      return { matchId: lined ?? ids[0]!, number, state, scouted: teams.size };
    });
}
