import {
  AppError,
  assertCan,
  createEventInput,
  reorderEventsInput,
  setActiveEventInput,
  updateEventInput,
  type ActiveContext,
  type Caller,
  type CreateEventInput,
  type EventRow,
  type ReorderEventsInput,
  type ReorderEventsOutput,
  type SetActiveEventInput,
  type UpdateEventInput,
} from '@frc/shared';
import type { StoredEvent, UseCaseContext } from '../context.js';
import {
  allEventsOf,
  eventOrNotFound,
  noSuchSeason,
  pgCode,
  seasonOrNotFound,
  toEvent,
} from '../seasonRows.js';
import { parseInput } from './users.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  createEventInput,
  eventRow,
  reorderEventsInput,
  reorderEventsOutput,
  setActiveEventInput,
  updateEventInput,
  type CreateEventInput,
  type EventRow,
  type ReorderEventsInput,
  type ReorderEventsOutput,
  type SetActiveEventInput,
  type UpdateEventInput,
} from '@frc/shared';

// A query, so it lives in core/queries/ (every commands/ use case rejects a service
// caller, SPEC-FINAL 16.5); re-exported so the event use cases import from one module.
export { listEvents } from '../queries/listEvents.js';

function nameTaken(name: string): AppError {
  return new AppError('conflict', `this season already has an event named '${name}'`, { name });
}

/**
 * Every write to `events` goes through here. The pre-checks give the friendly answers;
 * the unique (season_id, name) constraint and the season foreign key are the real guards
 * against a race, and their violations must read as `conflict` / `not-found`, not a 500.
 */
async function writeEvent(
  name: string,
  seasonId: string,
  write: () => Promise<StoredEvent>,
): Promise<StoredEvent> {
  try {
    return await write();
  } catch (e) {
    const code = pgCode(e);
    if (code === '23505') throw nameTaken(name);
    if (code === '23503') throw noSuchSeason(seasonId);
    throw e;
  }
}

/**
 * SPEC-FINAL 6.2, 6.4. Admin only. A new event goes last in its season (the default
 * order is creation order); the name is unique within the season, exactly as the unique
 * constraint compares it.
 */
export async function createEvent(
  caller: Caller,
  input: CreateEventInput,
  ctx: UseCaseContext,
): Promise<EventRow> {
  assertCan(caller, 'manage_events');
  const parsed = parseInput(createEventInput, input);
  const season = await seasonOrNotFound(ctx, parsed.season_id);
  const siblings = await allEventsOf(ctx, season.id);
  if (siblings.some((e) => e.name === parsed.name)) throw nameTaken(parsed.name);
  const sortOrder = siblings.reduce((max, e) => Math.max(max, e.sort_order), 0) + 1;
  const stored = await writeEvent(parsed.name, season.id, () =>
    ctx.store.insertEvent({
      id: crypto.randomUUID(),
      season_id: season.id,
      name: parsed.name,
      sort_order: sortOrder,
    }),
  );
  return toEvent(stored);
}

/** SPEC-FINAL 6.4: rename an event. Admin only. Never changes its order or its season. */
export async function updateEvent(
  caller: Caller,
  input: UpdateEventInput,
  ctx: UseCaseContext,
): Promise<EventRow> {
  assertCan(caller, 'manage_events');
  const parsed = parseInput(updateEventInput, input);
  const current = await eventOrNotFound(ctx, parsed.event_id);
  if (parsed.name === current.name) return toEvent(current);
  const siblings = await allEventsOf(ctx, current.season_id);
  if (siblings.some((e) => e.id !== current.id && e.name === parsed.name)) {
    throw nameTaken(parsed.name);
  }
  const stored = await writeEvent(parsed.name, current.season_id, () =>
    ctx.store.updateEvent(current.id, { name: parsed.name }),
  );
  return toEvent(stored);
}

/**
 * SPEC-FINAL 6.2: set a season's display order. Admin only. `event_ids` is the whole new
 * order and must name each of the season's events exactly once — a partial or stale list
 * is refused rather than guessed at. It writes `sort_order` (1..n) and nothing else, and
 * only on the events whose position moved. Reordering changes display order only; it
 * never re-weights an aggregate.
 */
export async function reorderEvents(
  caller: Caller,
  input: ReorderEventsInput,
  ctx: UseCaseContext,
): Promise<ReorderEventsOutput> {
  assertCan(caller, 'manage_events');
  const parsed = parseInput(reorderEventsInput, input);
  const season = await seasonOrNotFound(ctx, parsed.season_id);
  const current = await allEventsOf(ctx, season.id);
  const byId = new Map(current.map((e) => [e.id, e]));
  const ids = parsed.event_ids;
  const isPermutation =
    ids.length === current.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => byId.has(id));
  if (!isPermutation) {
    throw new AppError(
      'invalid',
      `the new order must name every event in this season exactly once (it has ${current.length}); reload the events and try again`,
      { expected: current.length, received: ids.length },
    );
  }

  const items: EventRow[] = [];
  for (const [index, id] of ids.entries()) {
    const event = byId.get(id) as StoredEvent;
    const sortOrder = index + 1;
    items.push(
      toEvent(
        event.sort_order === sortOrder
          ? event
          : await ctx.store.updateEvent(id, { sort_order: sortOrder }),
      ),
    );
  }
  return { items };
}

/**
 * SPEC-FINAL 6.3: the admin sets the default event. Writes BOTH active_event_id and its
 * season in one update, so the singleton can never hold a mismatched pair.
 */
export async function setActiveEvent(
  caller: Caller,
  input: SetActiveEventInput,
  ctx: UseCaseContext,
): Promise<ActiveContext> {
  assertCan(caller, 'manage_events');
  const parsed = parseInput(setActiveEventInput, input);
  const event = await eventOrNotFound(ctx, parsed.event_id);
  return ctx.store.setActiveContext({
    active_season_id: event.season_id,
    active_event_id: event.id,
  });
}
