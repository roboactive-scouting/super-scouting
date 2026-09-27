import { AppError, type EventRow, type SeasonRow } from '@frc/shared';
import type { StoredEvent, StoredSeason, UseCaseContext } from './context.js';

/**
 * What the season and event use cases (task 1.18) share. Its own module, not
 * commands/seasons.ts, so the list queries can use it without importing a command
 * module that re-exports them.
 */

/** Field by field, like toPublicUser: a column added later does not leak by default. */
export function toSeason(row: StoredSeason): SeasonRow {
  return {
    id: row.id,
    year: row.year,
    game_name: row.game_name,
    field_image_path: row.field_image_path,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toEvent(row: StoredEvent): EventRow {
  return {
    id: row.id,
    season_id: row.season_id,
    name: row.name,
    code: row.code ?? null,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function noSuchSeason(seasonId: string): AppError {
  return new AppError('not-found', 'that season does not exist; it may have been deleted', {
    season_id: seasonId,
  });
}

export function noSuchEvent(eventId: string): AppError {
  return new AppError('not-found', 'that event does not exist; it may have been deleted', {
    event_id: eventId,
  });
}

export async function seasonOrNotFound(ctx: UseCaseContext, id: string): Promise<StoredSeason> {
  const season = await ctx.store.getSeason(id);
  if (!season) throw noSuchSeason(id);
  return season;
}

export async function eventOrNotFound(ctx: UseCaseContext, id: string): Promise<StoredEvent> {
  const event = await ctx.store.getEvent(id);
  if (!event) throw noSuchEvent(id);
  return event;
}

/** The page size allEventsOf reads the store in. */
const EVENTS_PAGE = 200;

/**
 * Every event of a season, in sort_order then id. Pages through the bounded
 * `Store.listEvents` rather than asking for "all": a season holds a handful of events, so
 * this is one query in practice, and it stays correct if one ever holds more.
 */
export async function allEventsOf(ctx: UseCaseContext, seasonId: string): Promise<StoredEvent[]> {
  const all: StoredEvent[] = [];
  let after: { sort_order: number; id: string } | undefined;
  for (;;) {
    const page = await ctx.store.listEvents(seasonId, EVENTS_PAGE, after);
    all.push(...page);
    const last = page[page.length - 1];
    if (page.length < EVENTS_PAGE || !last) return all;
    after = { sort_order: last.sort_order, id: last.id };
  }
}

/** Postgres's own codes, which both stores keep on a failed write. */
export function pgCode(e: unknown): string | undefined {
  if (typeof e !== 'object' || e === null) return undefined;
  const code = (e as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
