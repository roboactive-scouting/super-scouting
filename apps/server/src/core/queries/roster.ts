import {
  listEventRosterInput,
  type Caller,
  type EventRosterOutput,
  type ListEventRosterInput,
} from '@frc/shared';
import { parseInput } from '../commands/users.js';
import type { UseCaseContext } from '../context.js';
import { eventOrNotFound } from '../seasonRows.js';
import { toRosterRow } from '../teamRows.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  eventRosterOutput,
  listEventRosterInput,
  type EventRosterOutput,
  type ListEventRosterInput,
} from '@frc/shared';

/**
 * An event's live roster, by team number (SPEC-FINAL 3.1, 6.4): removed teams are not
 * in it. A QUERY: every role and a `service` caller may call it. Not paginated —
 * setEventRoster bounds a roster at ROSTER_MAX_TEAMS. An unknown event is `not-found`,
 * not an empty roster, so a client never shows "no teams" for a deleted event.
 */
export async function listEventRoster(
  caller: Caller,
  input: ListEventRosterInput,
  ctx: UseCaseContext,
): Promise<EventRosterOutput> {
  void caller; // every role, and a service caller, may read the roster
  const parsed = parseInput(listEventRosterInput, input);
  const event = await eventOrNotFound(ctx, parsed.event_id);
  return { items: (await ctx.store.getRoster(event.id)).map(toRosterRow) };
}
