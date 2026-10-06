import {
  LIST_TEAMS_DEFAULT_LIMIT,
  LIST_TEAMS_MAX_LIMIT,
  listTeamsInput,
  type Caller,
  type ListTeamsInput,
  type ListTeamsOutput,
} from '@frc/shared';
import { z } from 'zod';
import { parseInput } from '../commands/users.js';
import type { UseCaseContext } from '../context.js';
import { decodeCursor, encodeCursor } from '../cursor.js';
import { toTeam } from '../teamRows.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  listTeamsInput,
  listTeamsOutput,
  type ListTeamsInput,
  type ListTeamsOutput,
} from '@frc/shared';

/** `number` is unique, so it alone is an exact keyset. */
const teamCursor = z.object({ n: z.number().int() }).strict();

/**
 * The global team registry by number, for the admin page and the roster picker
 * (SPEC-FINAL 6.4). `query` matches a team-number prefix or a case-insensitive name
 * substring, every character literal. A QUERY: every role and a `service` caller may call
 * it, so it checks no permission. Keyset-paginated like listSeasons; `limit` defaults to
 * 50 and a request above 200 is CLAMPED to 200.
 *
 * Not `searchTeams` (Appendix C), which is season-scoped and carries rank badges; the
 * Store's `seasonId` option is reserved for it and unused here.
 */
export async function listTeams(
  caller: Caller,
  input: ListTeamsInput,
  ctx: UseCaseContext,
): Promise<ListTeamsOutput> {
  void caller; // every role, and a service caller, may read the teams
  const parsed = parseInput(listTeamsInput, input);
  const limit = Math.min(parsed.limit ?? LIST_TEAMS_DEFAULT_LIMIT, LIST_TEAMS_MAX_LIMIT);
  const after = parsed.cursor ? { number: decodeCursor(teamCursor, parsed.cursor).n } : undefined;

  // One extra row says whether another page exists, so the last page never comes back empty.
  const rows = await ctx.store.listTeams({ query: parsed.query, limit: limit + 1, after });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toTeam),
    next_cursor: rows.length > limit && last ? encodeCursor({ n: last.number }) : null,
  };
}
