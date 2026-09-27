import {
  LIST_MATCHES_DEFAULT_LIMIT,
  LIST_MATCHES_MAX_LIMIT,
  listMatchesInput,
  matchType,
  type Caller,
  type ListMatchesInput,
  type ListMatchesOutput,
} from '@frc/shared';
import { z } from 'zod';
import { parseInput } from '../commands/users.js';
import type { UseCaseContext } from '../context.js';
import { decodeCursor, encodeCursor } from '../cursor.js';
import { withSlots } from '../matchRows.js';
import { eventOrNotFound } from '../seasonRows.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  listMatchesInput,
  listMatchesOutput,
  type ListMatchesInput,
  type ListMatchesOutput,
} from '@frc/shared';

/** (event_id, match_type, number) is unique, so type and number are an exact keyset. */
const matchCursor = z.object({ t: matchType, n: z.number().int() }).strict();

/**
 * An event's matches — practice, then qualification, then playoff, each by number — with
 * their filled slots, for the admin page (SPEC-FINAL 6.4). A QUERY: every role and a
 * `service` caller may call it. Keyset-paginated like listEvents; `limit` defaults to 50
 * and a request above 200 is CLAMPED to 200. An unknown event is `not-found`.
 */
export async function listMatches(
  caller: Caller,
  input: ListMatchesInput,
  ctx: UseCaseContext,
): Promise<ListMatchesOutput> {
  void caller; // every role, and a service caller, may read the matches
  const parsed = parseInput(listMatchesInput, input);
  const limit = Math.min(parsed.limit ?? LIST_MATCHES_DEFAULT_LIMIT, LIST_MATCHES_MAX_LIMIT);
  const cursor = parsed.cursor ? decodeCursor(matchCursor, parsed.cursor) : undefined;
  const event = await eventOrNotFound(ctx, parsed.event_id);

  const rows = await ctx.store.listMatches(
    event.id,
    limit + 1,
    cursor ? { match_type: cursor.t, number: cursor.n } : undefined,
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: await withSlots(ctx, page),
    next_cursor:
      rows.length > limit && last ? encodeCursor({ t: last.match_type, n: last.number }) : null,
  };
}
