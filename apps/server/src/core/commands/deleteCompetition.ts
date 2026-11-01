import {
  AppError,
  assertCan,
  deleteEventInput,
  deleteSeasonInput,
  SWITCH_EVENT_FIRST,
  SWITCH_SEASON_FIRST,
  TYPE_NAME_EXACTLY,
  type Caller,
  type DeleteEventInput,
  type DeleteImpactOutput,
  type DeleteSeasonInput,
} from '@frc/shared';
import type { StoredEvent, StoredSeason, UseCaseContext } from '../context.js';
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
  TYPE_NAME_EXACTLY,
} from '@frc/shared';

function refuseActive(message: string, details: Record<string, string>): AppError {
  return new AppError('conflict', message, details);
}

/**
 * The name must be typed exactly: no trimming, no case folding (SPEC-FINAL 17.8). Every
 * cascade delete (task 1.60: season, event, form, form version, a match with its entries)
 * checks it here, so the refusal is one code and one sentence everywhere.
 */
export function assertConfirmed(typed: string | undefined, name: string): void {
  if (typed !== name) throw new AppError('invalid', TYPE_NAME_EXACTLY);
}

/** What a season's delete must have typed back: its year (SPEC-FINAL 3.9; RB.20). */
export const seasonName = (season: StoredSeason): string => String(season.year);

/**
 * The active season cannot be deleted — nor a season holding the default event, should the
 * singleton ever disagree with itself. Task 1.60: shared with getDeleteImpact.
 */
export async function seasonIsActive(ctx: UseCaseContext, season: StoredSeason): Promise<boolean> {
  const active = await ctx.store.getActiveContext();
  if (active.active_season_id === season.id) return true;
  if (active.active_event_id === null) return false;
  const event = await ctx.store.getEvent(active.active_event_id);
  return event?.season_id === season.id;
}

/** The default event cannot be deleted. Task 1.60: shared with getDeleteImpact. */
export async function eventIsDefault(ctx: UseCaseContext, event: StoredEvent): Promise<boolean> {
  return (await ctx.store.getActiveContext()).active_event_id === event.id;
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
  if (await seasonIsActive(ctx, season)) {
    throw refuseActive(SWITCH_SEASON_FIRST, { season_id: season.id });
  }
  const impact = await ctx.store.countDeleteImpact('season', season.id);
  if (parsed.dry_run) return { deleted: false, ...impact };
  assertConfirmed(parsed.confirm_name, seasonName(season));
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
  if (await eventIsDefault(ctx, event)) {
    throw refuseActive(SWITCH_EVENT_FIRST, { event_id: event.id });
  }
  const impact = await ctx.store.countDeleteImpact('event', event.id);
  if (parsed.dry_run) return { deleted: false, ...impact };
  assertConfirmed(parsed.confirm_name, event.name);
  await ctx.store.deleteEvent(event.id);
  return { deleted: true, ...impact };
}
