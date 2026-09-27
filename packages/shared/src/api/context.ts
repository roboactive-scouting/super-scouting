import { z } from 'zod';

/**
 * The wire schemas of the active-context use cases (SPEC-FINAL 3.1, 4.1). The active
 * context is the `app_settings` singleton: the admin's default season and event, which
 * every device opens to. Browser-safe: zod only.
 *
 * `getActiveContext` arrived with task 1.17b, ahead of the rest of task 1.18: a device
 * holding no cached `app_settings` cannot learn the active event from the pull, because
 * the pull itself needs an event id. Task 1.18 adds the season and event schemas here.
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
