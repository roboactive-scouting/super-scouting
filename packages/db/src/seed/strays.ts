/** The deterministic seed id space (see `fixtures.ts`). Anything outside it was written
 *  by the app, a rehearsal, or a smoke run — never by the seed script itself. */
export const SEED_PREFIX = '00000000-0000-4000-8000-';

/**
 * Pure filter behind `clean.ts`'s `purge()`: which of these ids fall outside the seed
 * id space and are therefore safe to consider litter. Extracted so it can be unit
 * tested without the top-level-await script's Supabase/dotenv side effects.
 */
export function strayIds(ids: readonly string[], seedPrefix: string = SEED_PREFIX): string[] {
  return ids.filter((id) => !id.startsWith(seedPrefix));
}

/**
 * The tables `clean.ts` purges of stray rows, in the order it purges them: every child
 * before the parents it references. `teams` is last because every table that references
 * it does so `on delete restrict` (match_teams, event_teams, scouting_entries and the
 * alliance tables, which go with their events), so a team still referenced from a table
 * outside this list fails loudly rather than being left behind. `users` follows `events`
 * for the same reason: a stray event takes its conflicts and alliance rows with it.
 *
 * Never `applied_operations`: clearing that ledger would let an already-applied operation
 * replay as a new write.
 */
export const PURGE_ORDER = [
  'scouting_entries',
  'match_teams',
  'matches',
  'event_teams',
  'events',
  'seasons',
  'users',
  'teams',
] as const;

export type PurgeTable = (typeof PURGE_ORDER)[number];
