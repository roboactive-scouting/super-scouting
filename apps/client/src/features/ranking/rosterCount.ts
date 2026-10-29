import type { RankRow } from '@frc/shared';

/**
 * The "of N" of the ranking's "Rank 4 of 30" and of Home's "#3 / 30" (task 1.58b): every team
 * on the event's roster, ranked or not, as the team page counts it (user, 2026-10-29 — was the
 * ranked teams only). The table holds one row per roster team. A module of its own so Home
 * (the first chunk) reads it without the ranking page's view helpers; `rankingView.ts`
 * re-exports it.
 */
export const rosterCount = (rows: readonly RankRow[]): number => rows.length;
