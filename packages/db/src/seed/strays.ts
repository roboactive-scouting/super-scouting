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
