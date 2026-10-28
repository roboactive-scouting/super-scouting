import type { RankRow } from '@frc/shared';

/**
 * How many teams hold a rank (the "of N" of the ranking's "Rank 4 of 23" and of Home's "#3 / 42",
 * task 1.58b). A module of its own so Home (the first chunk) reads it without the ranking page's
 * view helpers; `rankingView.ts` re-exports it.
 */
export const rankedCount = (rows: readonly RankRow[]): number =>
  rows.filter((r) => r.rank !== null).length;
