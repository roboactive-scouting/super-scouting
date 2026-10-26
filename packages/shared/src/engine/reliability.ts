import { canonicalEntries } from './select';
import type { EngineEntry } from './types';

/** SPEC-FINAL 11.3's reliability figures for one team over a scope. */
export type Reliability = {
  /** Matches the robot played and then broke down in: available, and flagged. */
  breakdowns: number;
  no_shows: number;
  disabled: number;
  /** `played` + `broke_down`. */
  available: number;
  /** `no_show` + `disabled`. */
  missed: number;
  /** available / (available + missed), 0–1; null when no match counts (no data, never 0). */
  availability_rate: number | null;
};

/**
 * SPEC-FINAL 11.3, for ONE team: pass that team's entries in the scope (it does not split by
 * team). This is the one place no_show and disabled count — as events, never as a zero score
 * — so it does NOT read `entriesForAggregates` / `applyFilters`, which remove them. It reads:
 *
 * - one canonical entry per (team, match) (11.6): a duplicate counts once, and a soft-deleted
 *   entry never counts;
 * - match entries of qualification matches only (11.2): practice and playoff matches and
 *   super entries never count;
 * - each entry's `robot_status`: played → available; broke_down → available and a breakdown;
 *   no_show → missed and a no-show; disabled → missed and disabled. A match entry with no
 *   status says nothing about availability and is not counted.
 *
 * No counted match: every count is 0 (nothing happened) and `availability_rate` is null.
 */
export function reliabilityFor(entries: readonly EngineEntry[]): Reliability {
  let breakdowns = 0;
  let noShows = 0;
  let disabled = 0;
  let played = 0;

  for (const entry of canonicalEntries(entries)) {
    if (entry.form_kind !== 'match' || entry.match_type !== 'qualification') continue;
    switch (entry.robot_status) {
      case 'played':
        played += 1;
        break;
      case 'broke_down':
        breakdowns += 1;
        break;
      case 'no_show':
        noShows += 1;
        break;
      case 'disabled':
        disabled += 1;
        break;
      default:
        break;
    }
  }

  const available = played + breakdowns;
  const missed = noShows + disabled;
  const counted = available + missed;
  return {
    breakdowns,
    no_shows: noShows,
    disabled,
    available,
    missed,
    availability_rate: counted === 0 ? null : available / counted,
  };
}
