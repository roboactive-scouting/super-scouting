import { formatTime } from '@frc/shared';
import type { Station } from '@/data/station';
import { notInLineup, type LineupSlot } from '@/lib/derive/entries';
import type { Tile } from './LineupTiles';
import type { LocalEntry } from './localEntries';

export type Side = 'red' | 'blue';
export type TeamLite = { id: string; number: number; name: string };
/** The robot the scout is about to start (or reopen): its team, side and any existing entry. */
export type Chosen = { team: TeamLite; side: Side; entry?: LocalEntry };

export const sideOf = (s: Station): Side => (s[0] === 'R' ? 'red' : 'blue');

/**
 * The alliance choice belongs to the typed match: a pick made for another match (or before
 * the station changed) is ignored, and the remembered station's side shows instead.
 */
export function allianceFor(
  pick: { key: string; side: Side } | null,
  key: string,
  station: Station | null | undefined,
): Side | null {
  if (pick?.key === key) return pick.side;
  return station ? sideOf(station) : null;
}

type ChoiceInput = {
  /** The typed match; a team pick for another match is ignored. */
  key: string;
  /** The typed match and the station; a tile pick for another one is ignored. */
  tileKey: string;
  valid: boolean;
  showLineup: boolean;
  tiles: Tile[];
  station: Station | null | undefined;
  tilePick: { key: string; station: Station } | null;
  teamPick: { key: string; teamId: string } | null;
  alliance: Side | null;
  roster: TeamLite[];
  scouted: Map<string, LocalEntry>;
  isLocked: (teamId: string) => boolean;
};

/**
 * Which robot is chosen, and which tile is lit. In the line-up the remembered station is
 * picked by default (Scout README 3), unless it is locked; from the roster only an explicit
 * pick counts, on the chosen alliance. A locked robot is never chosen.
 */
export function resolveChoice(i: ChoiceInput): { chosen?: Chosen; selected: Station | null } {
  if (i.showLineup) {
    const mine = i.tiles.find((t) => t.station === i.station && !t.done?.locked);
    const picked = i.tilePick?.key === i.tileKey ? i.tilePick.station : null;
    const tile = picked ? i.tiles.find((t) => t.station === picked) : mine;
    if (!tile) return { selected: null };
    const team = { id: tile.teamId, number: tile.number, name: tile.name };
    return {
      selected: tile.station,
      chosen: { team, side: sideOf(tile.station), entry: i.scouted.get(tile.teamId) },
    };
  }
  if (i.valid && i.alliance && i.teamPick?.key === i.key) {
    const { teamId } = i.teamPick;
    const team = i.roster.find((t) => t.id === teamId);
    if (team && !i.isLocked(team.id)) {
      return { selected: null, chosen: { team, side: i.alliance, entry: i.scouted.get(team.id) } };
    }
  }
  return { selected: null };
}

/**
 * Derived, never stored (Scout README 6): a team picked through "Team not here?" that is
 * not in this match's line-up. A bare match has no line-up and never flags.
 */
export function flaggedNotInLineup(
  notHere: boolean,
  chosen: Chosen | undefined,
  slots: LineupSlot[],
  matchId: string | undefined,
): boolean {
  if (!notHere || !chosen || !matchId) return false;
  return notInLineup(slots, matchId, chosen.team.id, chosen.side);
}

/** "14:05": 24-hour, like every other time in the app (`formatTime`). */
export const hhmm = (d: Date) => formatTime(d.toISOString());
