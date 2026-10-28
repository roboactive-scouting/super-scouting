import { z } from 'zod';

/**
 * The wire schemas of the admin deletes (SPEC-FINAL 3.9, 17.8; task 1.60) that are not
 * already beside their objects: `getDeleteImpact`, what the one DeleteDialog (task 1.61)
 * reads to pick its face and fill its bill, and `deleteEntry`, the lead/admin soft delete.
 * The season, event, form, form version and match deletes keep their inputs where they were
 * (context.ts, forms.ts, matches.ts). Browser-safe: zod only.
 */

/** Wire ids are uuids: every primary key is one (SPEC-FINAL 3). */
const uuid = z.string().uuid();
const count = z.number().int().min(0);

/** Every cascade delete refuses a name that is not typed back exactly (no trim, no case fold). */
export const TYPE_NAME_EXACTLY = 'Type the name exactly to delete.';

export const DELETE_KINDS = ['season', 'event', 'form', 'form_version', 'match', 'entry'] as const;
export type DeleteKind = (typeof DELETE_KINDS)[number];
export const deleteKind = z.enum(DELETE_KINDS);

/**
 * Why a delete is refused whatever is typed (the dialog's Blocked face):
 * - `active_season` / `default_event`: switch the active context first (SPEC-FINAL 3.9);
 * - `version_has_entries`: entries are bound to the version (no text overrides it);
 * - `version_published`: a published version, since a device may still hold queued entries
 *   for it (Phase 1 D review #2); only a draft is deleted on its own;
 * - `version_active`: the form's active version (a backstop no use case reaches).
 */
export const DELETE_BLOCKED_REASONS = [
  'active_season',
  'default_event',
  'version_has_entries',
  'version_published',
  'version_active',
] as const;
export type DeleteBlockedReason = (typeof DELETE_BLOCKED_REASONS)[number];

export const getDeleteImpactInput = z.object({ kind: deleteKind, id: uuid }).strict();
export type GetDeleteImpactInput = z.input<typeof getDeleteImpactInput>;

/** One of a match's six stations, in the order red 1–3, blue 1–3. */
export const deleteImpactStation = z.object({
  alliance: z.enum(['red', 'blue']),
  station: z.number().int().min(1).max(3),
  /** The team in the slot; null for an empty slot. */
  team_number: z.number().int().nullable(),
  /** Entry rows naming the match for that team, soft-deleted ones included. */
  entries: count,
});
export type DeleteImpactStation = z.infer<typeof deleteImpactStation>;

/**
 * The exact damage, counted on the server just now; it deletes nothing. Every count is of
 * rows the delete would physically remove, so `entries` INCLUDES soft-deleted rows (they
 * still hold the foreign keys); `deleted_entries` says how many of them are already
 * soft-deleted, and `match_entries` + `super_entries` = `entries`. A count that does not
 * apply to the kind is 0 (an event deletes no forms).
 *
 * - `name`: the object as the dialog names it — the season's year, the event's or form's
 *   name, "v1", "Q41", "Q12 · 2096" (an entry; a super entry is the team number alone).
 * - `confirm_name`: what must be typed back exactly to delete, or null when nothing is
 *   typed (an entry, a match with no entries: "Are you sure?") or the delete is blocked.
 * - `blocked_reason` / `blocked_message`: set when no text unblocks it.
 * - `stations`: the six stations of a match, else null.
 * - `last_saved_at`: a match's newest entry edit (`client_updated_at`), else null.
 */
export const getDeleteImpactOutput = z.object({
  kind: deleteKind,
  id: uuid,
  name: z.string(),
  confirm_name: z.string().nullable(),
  blocked_reason: z.enum(DELETE_BLOCKED_REASONS).nullable(),
  blocked_message: z.string().nullable(),
  events: count,
  /** The deleted events' names, in event order (a season's, or the one event). */
  event_names: z.array(z.string()),
  matches: count,
  entries: count,
  match_entries: count,
  super_entries: count,
  deleted_entries: count,
  forms: count,
  form_versions: count,
  metrics: count,
  dashboards: count,
  weight_presets: count,
  stations: z.array(deleteImpactStation).nullable(),
  last_saved_at: z.string().nullable(),
});
export type GetDeleteImpactOutput = z.infer<typeof getDeleteImpactOutput>;

/**
 * SPEC-FINAL 3.9, 7.6: a lead or admin soft-deletes one entry (`deleted_at`, a new
 * revision, the tombstone the delta pull already carries). Scouters never delete, their
 * own entry included; a service caller never. The same rule as a `delete` push operation.
 */
export const deleteEntryInput = z.object({ entry_id: uuid }).strict();
export type DeleteEntryInput = z.input<typeof deleteEntryInput>;

/** `version` is the row's revision after the delete (unchanged if it was already deleted). */
export const deleteEntryOutput = z.object({
  id: uuid,
  deleted: z.literal(true),
  version: z.number().int(),
});
export type DeleteEntryOutput = z.infer<typeof deleteEntryOutput>;
