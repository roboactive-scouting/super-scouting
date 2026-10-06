import {
  LIST_SEASONS_DEFAULT_LIMIT,
  LIST_SEASONS_MAX_LIMIT,
  listSeasonsInput,
  type Caller,
  type ListSeasonsInput,
  type ListSeasonsOutput,
} from '@frc/shared';
import { z } from 'zod';
import { parseInput } from '../commands/users.js';
import type { UseCaseContext } from '../context.js';
import { decodeCursor, encodeCursor } from '../cursor.js';
import { toSeason } from '../seasonRows.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  listSeasonsInput,
  listSeasonsOutput,
  type ListSeasonsInput,
  type ListSeasonsOutput,
} from '@frc/shared';

/** `year` is unique, so it alone is an exact keyset. */
const seasonCursor = z.object({ y: z.number().int() }).strict();

/**
 * Every season, newest year first, for the admin page and the context switcher
 * (SPEC-FINAL 6.3, 6.4). A QUERY: every role and a `service` caller may call it, so it
 * checks no permission (see permissions.ts). Keyset-paginated like listUsers; `limit`
 * defaults to 50 and a request above 200 is CLAMPED to 200, not rejected.
 */
export async function listSeasons(
  caller: Caller,
  input: ListSeasonsInput,
  ctx: UseCaseContext,
): Promise<ListSeasonsOutput> {
  void caller; // every role, and a service caller, may read the seasons
  const parsed = parseInput(listSeasonsInput, input);
  const limit = Math.min(parsed.limit ?? LIST_SEASONS_DEFAULT_LIMIT, LIST_SEASONS_MAX_LIMIT);
  const after = parsed.cursor ? { year: decodeCursor(seasonCursor, parsed.cursor).y } : undefined;

  // One extra row says whether another page exists, so the last page never comes back empty.
  const rows = await ctx.store.listSeasons(limit + 1, after);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toSeason),
    next_cursor: rows.length > limit && last ? encodeCursor({ y: last.year }) : null,
  };
}
