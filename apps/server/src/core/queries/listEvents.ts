import {
  LIST_EVENTS_DEFAULT_LIMIT,
  LIST_EVENTS_MAX_LIMIT,
  listEventsInput,
  type Caller,
  type ListEventsInput,
  type ListEventsOutput,
} from '@frc/shared';
import { z } from 'zod';
import { parseInput } from '../commands/users.js';
import type { UseCaseContext } from '../context.js';
import { decodeCursor, encodeCursor } from '../cursor.js';
import { seasonOrNotFound, toEvent } from '../seasonRows.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  listEventsInput,
  listEventsOutput,
  type ListEventsInput,
  type ListEventsOutput,
} from '@frc/shared';

/** sort_order is not unique, so the id breaks ties. Both are checked before any use. */
const eventCursor = z.object({ s: z.number().int(), i: z.string().uuid() }).strict();

/**
 * A season's events in `sort_order`, then id — the order every season-spanning stat and
 * chart renders competitions in, so the season slope view reads left to right
 * (SPEC-FINAL 6.2). A QUERY: every role and a `service` caller may call it, so it checks
 * no permission. Keyset-paginated like listUsers; `limit` defaults to 50 and a request
 * above 200 is CLAMPED to 200. An unknown season is `not-found`, not an empty list, so a
 * client never shows "no events" for a season that was deleted.
 */
export async function listEvents(
  caller: Caller,
  input: ListEventsInput,
  ctx: UseCaseContext,
): Promise<ListEventsOutput> {
  void caller; // every role, and a service caller, may read the events
  const parsed = parseInput(listEventsInput, input);
  const limit = Math.min(parsed.limit ?? LIST_EVENTS_DEFAULT_LIMIT, LIST_EVENTS_MAX_LIMIT);
  const cursor = parsed.cursor ? decodeCursor(eventCursor, parsed.cursor) : undefined;
  const season = await seasonOrNotFound(ctx, parsed.season_id);

  const rows = await ctx.store.listEvents(
    season.id,
    limit + 1,
    cursor ? { sort_order: cursor.s, id: cursor.i } : undefined,
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toEvent),
    next_cursor:
      rows.length > limit && last ? encodeCursor({ s: last.sort_order, i: last.id }) : null,
  };
}
