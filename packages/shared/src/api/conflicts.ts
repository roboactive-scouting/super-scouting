import { z } from 'zod';
import { matchType } from './matches';

/**
 * The wire schemas of the conflict review queue (SPEC-FINAL 3.6, 9.5; task 1.41).
 * `listConflicts` is a QUERY — every role and a `service` caller may read the queue, and it
 * is readable offline from the pulled `sync_conflicts` rows (9.6). `resolveConflict` is a
 * lead/admin COMMAND that needs a connection: it settles the row for everyone.
 * Browser-safe: zod only.
 */

/** Wire ids of rows the server reads by a filter are uuids (SPEC-FINAL 3). */
const uuid = z.string().uuid();
/**
 * Not a uuid check: the in-memory store's fixture ids are not uuids (as users.ts). The
 * Supabase store reads an id that is not a uuid as no row, so it is `not-found`, never a 500.
 */
const rowId = z.string().min(1);

export const CONFLICT_KINDS = ['divergence', 'duplicate'] as const;
export type ConflictKind = (typeof CONFLICT_KINDS)[number];

export const LIST_CONFLICTS_DEFAULT_LIMIT = 20;
/** A larger `limit` is clamped to this, not rejected: `next_cursor` says there is more. */
export const LIST_CONFLICTS_MAX_LIMIT = 50;
/** The most settled conflicts one call returns, newest first; there is no paging. */
export const SETTLED_CONFLICTS_MAX = 100;
/** `settled_since` when the client sends none: the last 24 hours. */
export const SETTLED_DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * What a lead or admin chose (SPEC-FINAL 9.5), stored as given in
 * `sync_conflicts.resolution` (v1.28). A divergence keeps the live copy or restores the
 * superseded one; a duplicate keeps one of its two rows and soft-deletes the other.
 */
export const divergenceResolution = z.object({ keep: z.enum(['live', 'superseded']) }).strict();
export const duplicateResolution = z.object({ keep_row_id: rowId }).strict();
export const conflictResolution = z.union([divergenceResolution, duplicateResolution]);
export type ConflictResolution = z.infer<typeof conflictResolution>;

export const listConflictsInput = z
  .object({
    event_id: uuid,
    limit: z.number().int().min(1).optional(),
    cursor: z.string().min(1).optional(),
    /**
     * The start of "Settled today": the DEVICE's local midnight, as an ISO instant with an
     * offset. The server does not know the venue's day. Omitted: the last 24 hours.
     */
    settled_since: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type ListConflictsInput = z.input<typeof listConflictsInput>;

const person = z.object({ id: z.string(), full_name: z.string().nullable() });
const conflictTeam = z.object({ id: z.string(), number: z.number().int(), name: z.string() });
const conflictMatch = z.object({ id: z.string(), match_type: matchType, number: z.number().int() });
const entryData = z.record(z.unknown());

/** One stored row of a conflict, as it is in `scouting_entries` now. */
const liveCopy = z.object({
  row_id: z.string(),
  version: z.number().int(),
  form_version_id: z.string().nullable(),
  author: person,
  client_updated_at: z.string(),
  robot_status: z.string().nullable(),
  breakdown_seconds: z.number().nullable(),
  data: entryData,
  /** A soft-deleted row is still shown, so the reader sees why it does not count. */
  deleted_at: z.string().nullable(),
});

/** A divergence's losing copy, from `superseded_*`. Its author may be unknown (null id). */
const supersededCopy = z.object({
  form_version_id: z.string().nullable(),
  author: z.object({ id: z.string().nullable(), full_name: z.string().nullable() }),
  client_updated_at: z.string().nullable(),
  base_version: z.number().int().nullable(),
  robot_status: z.string().nullable(),
  breakdown_seconds: z.number().nullable(),
  data: entryData,
});

/**
 * One field of the field-by-field diff: the union of both copies' `data` keys plus
 * `robot_status` and `breakdown_seconds`, equal fields included (`differs: false`) so the
 * page can offer "Show the n that match". A key one copy lacks reads as null there.
 */
const divergenceDiff = z.object({
  field_key: z.string(),
  live: z.unknown(),
  superseded: z.unknown(),
  differs: z.boolean(),
});
const duplicateDiff = z.object({
  field_key: z.string(),
  a: z.unknown(),
  b: z.unknown(),
  differs: z.boolean(),
});

const itemBase = {
  id: z.string(),
  created_at: z.string(),
  form_kind: z.enum(['match', 'super']),
  team: conflictTeam.nullable(),
  /** Null for a super entry. */
  match: conflictMatch.nullable(),
  alliance: z.enum(['red', 'blue']).nullable(),
};

export const divergenceItem = z.object({
  ...itemBase,
  kind: z.literal('divergence'),
  live: liveCopy,
  superseded: supersededCopy,
  /** The live copy is always the one the statistics use (SPEC-FINAL 9.5). */
  counted: z.literal('live'),
  diff: z.array(divergenceDiff),
});

export const duplicateItem = z.object({
  ...itemBase,
  kind: z.literal('duplicate'),
  /** The conflict's `row_id`: the row that arrived second. */
  a: liveCopy,
  /** The conflict's `duplicate_row_id`: the row the server already held. */
  b: liveCopy,
  /** The live row with the greater client_updated_at: what the statistics use now. */
  counted: z.enum(['a', 'b']),
  diff: z.array(duplicateDiff),
});

export const conflictItem = z.discriminatedUnion('kind', [divergenceItem, duplicateItem]);
export type ConflictItem = z.infer<typeof conflictItem>;

/** One row of "Settled today". `team`/`match` are null when the rows are gone since. */
export const settledConflict = z.object({
  id: z.string(),
  kind: z.enum(CONFLICT_KINDS),
  form_kind: z.enum(['match', 'super']).nullable(),
  team: conflictTeam.nullable(),
  match: conflictMatch.nullable(),
  resolution: conflictResolution.nullable(),
  resolved_at: z.string(),
  resolved_by: person.nullable(),
  /** Whose copy stayed. Null only for a conflict resolved with no recorded choice. */
  kept: z.object({ row_id: z.string(), author_full_name: z.string().nullable() }).nullable(),
});
export type SettledConflict = z.infer<typeof settledConflict>;

export const listConflictsOutput = z.object({
  /** The event's OPEN conflicts, oldest first, one page. */
  items: z.array(conflictItem),
  next_cursor: z.string().nullable(),
  /** Resolved at or after `settled_since`, newest first, at most SETTLED_CONFLICTS_MAX. */
  settled: z.array(settledConflict),
});
export type ListConflictsOutput = z.infer<typeof listConflictsOutput>;

export const resolveConflictInput = z
  .object({ conflict_id: rowId, resolution: conflictResolution })
  .strict();
export type ResolveConflictInput = z.input<typeof resolveConflictInput>;

export const resolveConflictOutput = z.object({
  conflict_id: z.string(),
  resolved_at: z.string(),
  resolution: conflictResolution,
  /** The row that stays live. */
  row_id: z.string(),
  /** `row_id`'s new version when it was rewritten (a restore), else null. */
  new_version: z.number().int().nullable(),
  /** A duplicate's row that was soft-deleted, with its new version; null otherwise. */
  soft_deleted: z.object({ row_id: z.string(), new_version: z.number().int() }).nullable(),
});
export type ResolveConflictOutput = z.infer<typeof resolveConflictOutput>;
