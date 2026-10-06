import {
  getActiveContextInput,
  type ActiveContext,
  type Caller,
  type GetActiveContextInput,
} from '@frc/shared';
import { parseInput } from '../commands/users.js';
import type { UseCaseContext } from '../context.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  activeContext,
  getActiveContextInput,
  type ActiveContext,
  type GetActiveContextInput,
} from '@frc/shared';

/**
 * The admin's default season and event (SPEC-FINAL 3.1, 4.1) — what every device opens to.
 * A QUERY: every role and a `service` caller may call it, so it checks no permission
 * (`view_all_data` is one a service caller never holds; see permissions.ts).
 *
 * Pulled forward from task 1.18 into task 1.17b: a device with no cached `app_settings`
 * has no other way to learn the event id the pull needs.
 *
 * `active_event_id` comes back null when the singleton names an event that no longer
 * exists. The foreign key is `on delete set null`, so that should not happen; the check
 * makes sure a client is never sent to pull an event the server would answer 404 for.
 */
export async function getActiveContext(
  caller: Caller,
  input: GetActiveContextInput,
  ctx: UseCaseContext,
): Promise<ActiveContext> {
  void caller; // every role, and a service caller, may read the active context
  parseInput(getActiveContextInput, input);
  const current = await ctx.store.getActiveContext();
  const eventId = current.active_event_id;
  const eventLives = eventId !== null && (await ctx.store.eventExists(eventId));
  return {
    active_season_id: current.active_season_id,
    active_event_id: eventLives ? eventId : null,
  };
}
