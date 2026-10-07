import { z } from 'zod';

/**
 * The wire schemas of the active-context use cases (SPEC-FINAL 3.1, 4.1). The active
 * context is the `app_settings` singleton: the admin's default season and event, which
 * every device opens to. Browser-safe: zod only.
 *
 * `getActiveContext` arrived with task 1.17b, ahead of the rest of task 1.18: a device
 * holding no cached `app_settings` cannot learn the active event from the pull, because
 * the pull itself needs an event id. Task 1.18 added the season and event schemas below.
 */

/** Strict, so a field is refused rather than dropped: the query takes no arguments. */
export const getActiveContextInput = z.object({}).strict();
export type GetActiveContextInput = z.input<typeof getActiveContextInput>;

/**
 * Either id may be null: nothing has been set up yet, or a brand-new season has no event
 * yet. `active_event_id` is also null when the singleton names an event that no longer
 * exists, so a client can trust any id it receives here.
 */
export const activeContext = z.object({
  active_season_id: z.string().uuid().nullable(),
  active_event_id: z.string().uuid().nullable(),
});
export type ActiveContext = z.infer<typeof activeContext>;

// ---------------------------------------------------------------------------------------
// Seasons and events (SPEC-FINAL 3.1, 6.2, 6.3, 6.4; task 1.18). All the commands are
// admin only (`manage_events`); the two lists are queries every role may call.
//
// Every input is strict, so a field a use case does not take is REFUSED rather than
// dropped: `updateEvent` cannot move an event to another season or reorder it, and a
// client that sends `season_id` or `sort_order` to it should hear so.
// ---------------------------------------------------------------------------------------

/** Wire ids are uuids: every primary key is one (SPEC-FINAL 3). */
const uuid = z.string().uuid();

/** The first FIRST Robotics Competition season was 1992. */
export const SEASON_YEAR_MIN = 1992;
export const SEASON_YEAR_MAX = 2100;
export const NAME_MAX_LENGTH = 80;
/** The most events one `reorderEvents` call may name; a season holds a handful. */
export const REORDER_EVENTS_MAX = 200;

export const LIST_SEASONS_DEFAULT_LIMIT = 50;
/** A larger `limit` is clamped to this, not rejected: `next_cursor` says there is more. */
export const LIST_SEASONS_MAX_LIMIT = 200;
export const LIST_EVENTS_DEFAULT_LIMIT = 50;
/** A larger `limit` is clamped to this, not rejected: `next_cursor` says there is more. */
export const LIST_EVENTS_MAX_LIMIT = 200;

const seasonYear = z.number().int().min(SEASON_YEAR_MIN).max(SEASON_YEAR_MAX);
const displayName = z.string().trim().min(1).max(NAME_MAX_LENGTH);
/**
 * Only the shape here. Whether the path RESOLVES — is one of the committed images in
 * SEASON_IMAGE_MANIFEST — is the use case's check, so its refusal can name the file to
 * commit (SPEC-FINAL 6.4, 16.7).
 */
const fieldImagePath = z.string().trim().min(1).max(200);

/** A season as it leaves the server. `seasons` has no `version` column. */
export const seasonRow = z.object({
  id: uuid,
  year: z.number().int(),
  game_name: z.string(),
  field_image_path: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type SeasonRow = z.infer<typeof seasonRow>;

/**
 * An event as it leaves the server. `code` is reserved for a future import; null in v1.
 * Named `eventRow`/`EventRow`, not `event`/`Event`, so it never shadows the DOM globals.
 */
export const eventRow = z.object({
  id: uuid,
  season_id: uuid,
  name: z.string(),
  code: z.string().nullable(),
  sort_order: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type EventRow = z.infer<typeof eventRow>;

export const createSeasonInput = z
  .object({ year: seasonYear, game_name: displayName, field_image_path: fieldImagePath })
  .strict();
export type CreateSeasonInput = z.input<typeof createSeasonInput>;

/**
 * At least one field. `field_image_path` may change only while the season has no
 * entries (SPEC-FINAL 16.7); `game_name` and `year` may always be corrected.
 */
export const updateSeasonInput = z
  .object({
    season_id: uuid,
    year: seasonYear.optional(),
    game_name: displayName.optional(),
    field_image_path: fieldImagePath.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.year !== undefined ||
      value.game_name !== undefined ||
      value.field_image_path !== undefined,
    { message: 'give a new year, game name or game image path' },
  );
export type UpdateSeasonInput = z.input<typeof updateSeasonInput>;

export const setActiveSeasonInput = z.object({ season_id: uuid }).strict();
export type SetActiveSeasonInput = z.input<typeof setActiveSeasonInput>;

export const listSeasonsInput = z
  .object({
    limit: z.number().int().min(1).optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();
export type ListSeasonsInput = z.input<typeof listSeasonsInput>;

/** Newest year first. */
export const listSeasonsOutput = z.object({
  items: z.array(seasonRow),
  next_cursor: z.string().nullable(),
});
export type ListSeasonsOutput = z.infer<typeof listSeasonsOutput>;

/** `sort_order` is not an input: a new event goes last in its season (SPEC-FINAL 6.2). */
export const createEventInput = z.object({ season_id: uuid, name: displayName }).strict();
export type CreateEventInput = z.input<typeof createEventInput>;

/** A rename only. Order is `reorderEvents`; an event never moves to another season. */
export const updateEventInput = z.object({ event_id: uuid, name: displayName }).strict();
export type UpdateEventInput = z.input<typeof updateEventInput>;

/**
 * `event_ids` is the season's whole new order, first to last, and must name each of its
 * events exactly once. It changes display order only and never re-weights an aggregate
 * (SPEC-FINAL 6.2).
 */
export const reorderEventsInput = z
  .object({ season_id: uuid, event_ids: z.array(uuid).max(REORDER_EVENTS_MAX) })
  .strict();
export type ReorderEventsInput = z.input<typeof reorderEventsInput>;

/** The season's events in their new order. */
export const reorderEventsOutput = z.object({ items: z.array(eventRow) });
export type ReorderEventsOutput = z.infer<typeof reorderEventsOutput>;

export const setActiveEventInput = z.object({ event_id: uuid }).strict();
export type SetActiveEventInput = z.input<typeof setActiveEventInput>;

export const listEventsInput = z
  .object({
    season_id: uuid,
    limit: z.number().int().min(1).optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();
export type ListEventsInput = z.input<typeof listEventsInput>;

/** In `sort_order`, then id: the order every season-spanning view reads left to right. */
export const listEventsOutput = z.object({
  items: z.array(eventRow),
  next_cursor: z.string().nullable(),
});
export type ListEventsOutput = z.infer<typeof listEventsOutput>;

// ---------------------------------------------------------------------------------------
// Hard delete of a season or an event (SPEC-FINAL 3.9, 17.8; task RB.20). Admin only,
// irreversible. `dry_run: true` answers the damage as counts and deletes nothing; the real
// delete needs `confirm_name` to equal the season's year or the event's name exactly. The
// active season and the default event are refused either way.
// ---------------------------------------------------------------------------------------

export const deleteSeasonInput = z
  .object({
    season_id: uuid,
    dry_run: z.boolean().default(false),
    confirm_name: z.string().optional(),
  })
  .strict();
export type DeleteSeasonInput = z.input<typeof deleteSeasonInput>;

export const deleteEventInput = z
  .object({
    event_id: uuid,
    dry_run: z.boolean().default(false),
    confirm_name: z.string().optional(),
  })
  .strict();
export type DeleteEventInput = z.input<typeof deleteEventInput>;

/** The refusals for the active season and the default event, word for word on both sides. */
export const SWITCH_SEASON_FIRST = 'Switch the active season first.';
export const SWITCH_EVENT_FIRST = 'Switch the default event first.';

/** What is (or would be) deleted. An event's answer has `events: 1` and `forms: 0`. */
export const deleteImpactOutput = z.object({
  deleted: z.boolean(),
  events: z.number().int(),
  matches: z.number().int(),
  entries: z.number().int(),
  forms: z.number().int(),
});
export type DeleteImpactOutput = z.infer<typeof deleteImpactOutput>;
