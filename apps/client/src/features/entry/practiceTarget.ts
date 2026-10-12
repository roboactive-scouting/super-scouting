import type { Station } from '@/data/station';
import type { LineupSlot } from '@/lib/derive/entries';

export type PracticeTarget = { matchId: string; teamId: string; alliance: 'red' | 'blue' };

type MatchRow = { id: string; match_type: string; number: number };

/** The order a practice run walks the schedule in: qualifications first, as at the venue. */
const TYPE_ORDER: Record<string, number> = { qualification: 0, playoff: 1, practice: 2 };

/**
 * Which match and robot Practice a match opens (SPEC-FINAL 8.5; task 1.37), from what the device
 * holds — practice never creates a match. In order:
 *
 * 1. `prefer`: the robot the Scout page had picked, when its match is on this device;
 * 2. `after` (Practice another match): the next match with a line-up after that one, wrapping;
 * 3. otherwise the first match with a line-up this device holds no entry for, else the first.
 *
 * The robot is the one at the scout's station, else the first in the line-up (Red 1 first).
 * Null when no match on the device has a line-up.
 */
export function practiceTarget({
  matches,
  slots,
  station,
  scoutedMatchIds,
  prefer,
  after,
}: {
  /** The event's matches. */
  matches: readonly MatchRow[];
  slots: readonly LineupSlot[];
  station: Station | null;
  /** Matches this device holds a match entry for. */
  scoutedMatchIds: ReadonlySet<string>;
  prefer?: PracticeTarget | null;
  after?: string | null;
}): PracticeTarget | null {
  if (prefer && matches.some((m) => m.id === prefer.matchId)) return prefer;

  const lined = matches
    .filter((m) => slots.some((s) => s.match_id === m.id))
    .sort(
      (a, b) =>
        (TYPE_ORDER[a.match_type] ?? 9) - (TYPE_ORDER[b.match_type] ?? 9) || a.number - b.number,
    );
  if (lined.length === 0) return null;

  const at = after ? lined.findIndex((m) => m.id === after) : -1;
  const match =
    at >= 0
      ? lined[(at + 1) % lined.length]!
      : (lined.find((m) => !scoutedMatchIds.has(m.id)) ?? lined[0]!);

  const lineup = slots
    .filter((s) => s.match_id === match.id)
    .sort((a, b) =>
      a.alliance === b.alliance ? a.station - b.station : a.alliance === 'red' ? -1 : 1,
    );
  const mine = station
    ? lineup.find(
        (s) =>
          s.alliance === (station[0] === 'R' ? 'red' : 'blue') && s.station === Number(station[1]),
      )
    : undefined;
  const slot = mine ?? lineup[0]!;
  return { matchId: match.id, teamId: slot.team_id, alliance: slot.alliance };
}
