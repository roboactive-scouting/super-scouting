import { formatCount, type RankRow } from '@frc/shared';

/**
 * The "of N" of the ranking's "Rank 4 of 30" and of Home's "#3 / 30" (task 1.58b): every team
 * on the event's roster, ranked or not, as the team page counts it (user, 2026-10-29 — was the
 * ranked teams only). The table holds one row per roster team. A module of its own so Home
 * (the first chunk) reads it without the ranking page's view helpers; `rankingView.ts`
 * re-exports it.
 */
export const rosterCount = (rows: readonly RankRow[]): number => rows.length;

/**
 * The roster count in words, "30 teams" / "1 team" (user, 2026-11-01): the ranking's event line
 * and Home's Top teams heading ("of 30 teams").
 */
export const teamsText = (rows: readonly RankRow[]): string => {
  const n = rosterCount(rows);
  return `${formatCount(n)} ${n === 1 ? 'team' : 'teams'}`;
};
