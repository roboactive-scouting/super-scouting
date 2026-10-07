import {
  AppError,
  assertCan,
  deleteEventInput,
  deleteSeasonInput,
  SWITCH_EVENT_FIRST,
  SWITCH_SEASON_FIRST,
  type Caller,
  type DeleteEventInput,
  type DeleteImpactOutput,
  type DeleteSeasonInput,
} from '@frc/shared';
import type { UseCaseContext } from '../context.js';
import { eventOrNotFound, seasonOrNotFound } from '../seasonRows.js';
import { parseInput } from './users.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  deleteEventInput,
  deleteImpactOutput,
  deleteSeasonInput,
  type DeleteEventInput,
  type DeleteImpactOutput,
  type DeleteSeasonInput,
} from '@frc/shared';

export const TYPE_NAME_EXACTLY = 'Type the name exactly to delete.';

function refuseActive(message: string, details: Record<string, string>): AppError {
  return new AppError('conflict', message, details);
}

/** The name must be typed exactly: no trimming, no case folding (SPEC-FINAL 17.8). */
function assertConfirmed(typed: string | undefined, name: string): void {
  if (typed !== name) throw new AppError('invalid', TYPE_NAME_EXACTLY);
}

/**
 * SPEC-FINAL 3.9: hard-delete a season with its events, matches, entries and forms (and
 * everything that cascades from them). Admin only, irreversible. The active season cannot
 * go — nor a season holding the default event, should the singleton ever disagree with
 * itself. `dry_run` answers the damage and deletes nothing; the real delete needs the
 * year typed back. The delete is one SQL function, so it is all or nothing.
 */
export async function deleteSeason(
  caller: Caller,
  input: DeleteSeasonInput,
  ctx: UseCaseContext,
): Promise<DeleteImpactOutput> {
  assertCan(caller, 'delete_objects');
  const parsed = parseInput(deleteSeasonInput, input);
  const season = await seasonOrNotFound(ctx, parsed.season_id);
  const active = await ctx.store.getActiveContext();
  let holdsDefault = false;
  if (active.active_event_id !== null) {
    const event = await ctx.store.getEvent(active.active_event_id);
    holdsDefault = event?.season_id === season.id;
  }
  if (active.active_season_id === season.id || holdsDefault) {
    throw refuseActive(SWITCH_SEASON_FIRST, { season_id: season.id });
  }
  const impact = await ctx.store.countDeleteImpact('season', season.id);
  if (parsed.dry_run) return { deleted: false, ...impact };
  assertConfirmed(parsed.confirm_name, String(season.year));
  await ctx.store.deleteSeason(season.id);
  return { deleted: true, ...impact };
}

/**
 * SPEC-FINAL 3.9: hard-delete an event with its matches, entries, roster, pick lists and
 * bracket. Admin only, irreversible. The default event cannot go. `dry_run` answers the
 * damage; the real delete needs the event's name typed back exactly.
 */
export async function deleteEvent(
  caller: Caller,
  input: DeleteEventInput,
  ctx: UseCaseContext,
): Promise<DeleteImpactOutput> {
  assertCan(caller, 'delete_objects');
  const parsed = parseInput(deleteEventInput, input);
  const event = await eventOrNotFound(ctx, parsed.event_id);
  const active = await ctx.store.getActiveContext();
  if (active.active_event_id === event.id) {
    throw refuseActive(SWITCH_EVENT_FIRST, { event_id: event.id });
  }
  const impact = await ctx.store.countDeleteImpact('event', event.id);
  if (parsed.dry_run) return { deleted: false, ...impact };
  assertConfirmed(parsed.confirm_name, event.name);
  await ctx.store.deleteEvent(event.id);
  return { deleted: true, ...impact };
}
