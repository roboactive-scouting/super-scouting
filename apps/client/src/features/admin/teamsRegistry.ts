import type { TeamRow } from '@frc/shared';
import type { Rpc } from '@/data/rpc';

/**
 * The global team registry, shared by `TeamsPanel` (the roster editor) and `MatchesPanel`
 * (which needs it to label a slot whose team has since left the event roster — task 1.21).
 *
 * Teams are returned by number (task-1.21 addendum), so pages are concatenated in wire
 * order rather than re-sorted here: `TeamsPanel` builds `setEventRoster`'s `team_ids` from
 * this same order, and a client-side re-sort would silently reorder that call's payload.
 */

/** The most teams the registry will follow `next_cursor` through — the team list only
 * grows season over season, but a runaway cursor must not loop forever. */
export const MAX_LISTED_TEAMS = 2000;

/**
 * Every team in the registry. Tolerant of a page missing `items`/`next_cursor` (a test
 * double that does not stub `listTeams` at all, e.g. `MatchesPanel.test.tsx`'s fixture) —
 * that is treated as one empty, terminal page rather than a crash.
 */
export async function loadAllTeams(rpc: Rpc): Promise<TeamRow[]> {
  const teams: TeamRow[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = (await rpc.call('listTeams', cursor ? { cursor } : {})) as
      { items?: TeamRow[]; next_cursor?: string | null } | undefined;
    teams.push(...(page?.items ?? []));
    if (!page?.next_cursor || teams.length >= MAX_LISTED_TEAMS) return teams;
    cursor = page.next_cursor;
  }
}
