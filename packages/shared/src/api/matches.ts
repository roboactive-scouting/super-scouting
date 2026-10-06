import { z } from 'zod';

/**
 * The wire schemas of the match use cases (SPEC-FINAL 3.1, 6.4; task 1.19). Admin match
 * management — create (one, or in bulk by count), correct, fill the six alliance slots,
 * delete — is `manage_events`, online only. `ensureMatch` is the other thing: the bare
 * auto-creation of 6.4, event + type + number only, available to every role and riding
 * the outbox. Browser-safe: zod only.
 */

/** Wire ids are uuids: every primary key is one (SPEC-FINAL 3). */
const uuid = z.string().uuid();

/** In the order every match list renders them: practice, then qualification, then playoff. */
export const MATCH_TYPES = ['practice', 'qualification', 'playoff'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];
export const matchType = z.enum(MATCH_TYPES);

export const ALLIANCES = ['red', 'blue'] as const;
export type Alliance = (typeof ALLIANCES)[number];

/** An FRC event plays well under 200 matches of any one type. */
export const MATCH_NUMBER_MAX = 999;
/** The most matches one bulk `createMatch` makes: numbers 1..count. */
export const MATCH_BULK_MAX = 200;

export const LIST_MATCHES_DEFAULT_LIMIT = 50;
/** A larger `limit` is clamped to this, not rejected: `next_cursor` says there is more. */
export const LIST_MATCHES_MAX_LIMIT = 200;

const matchNumber = z.number().int().min(1).max(MATCH_NUMBER_MAX);

/** One filled alliance slot. A match has at most six: red 1..3 and blue 1..3. */
export const matchSlot = z
  .object({
    alliance: z.enum(ALLIANCES),
    station: z.number().int().min(1).max(3),
    team_id: uuid,
  })
  .strict();
export type MatchSlot = z.infer<typeof matchSlot>;

/**
 * A match as it leaves the server, with its filled slots in red 1..3 then blue 1..3
 * order. An empty slot is simply absent. `matches` has no `version` column, and the
 * reserved official-result columns are never returned in v1 (SPEC-FINAL 3.1).
 */
export const matchRow = z.object({
  id: uuid,
  event_id: uuid,
  match_type: matchType,
  number: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  slots: z.array(matchSlot),
});
export type MatchRow = z.infer<typeof matchRow>;

/**
 * Exactly one of `number` (create that match; an existing one is a conflict) or `count`
 * (create 1..count, silently skipping the numbers that already exist). The server
 * generates the ids: admin match management is online only.
 */
export const createMatchInput = z
  .object({
    event_id: uuid,
    match_type: matchType,
    number: matchNumber.optional(),
    count: z.number().int().min(1).max(MATCH_BULK_MAX).optional(),
  })
  .strict()
  .refine((value) => (value.number === undefined) !== (value.count === undefined), {
    message: 'give either a match number or a count of matches, not both',
  });
export type CreateMatchInput = z.input<typeof createMatchInput>;

/** The matches this call created, in number order: none that already existed. */
export const createMatchOutput = z.object({
  created: z.number().int(),
  items: z.array(matchRow),
});
export type CreateMatchOutput = z.infer<typeof createMatchOutput>;

/** Corrects a match's type and/or number. Never its event, never its slots. */
export const updateMatchInput = z
  .object({
    match_id: uuid,
    match_type: matchType.optional(),
    number: matchNumber.optional(),
  })
  .strict()
  .refine((value) => value.match_type !== undefined || value.number !== undefined, {
    message: 'give a new match type or number',
  });
export type UpdateMatchInput = z.input<typeof updateMatchInput>;

/**
 * The match's whole new set of filled slots: given slots are written, omitted ones are
 * cleared. Each station and each team at most once.
 */
export const setMatchTeamsInput = z
  .object({ match_id: uuid, slots: z.array(matchSlot).max(6) })
  .strict()
  .superRefine((value, ctx) => {
    const stations = new Set(value.slots.map((s) => `${s.alliance} ${s.station}`));
    if (stations.size !== value.slots.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['slots'],
        message: 'fill each alliance station only once',
      });
    }
    const teams = new Set(value.slots.map((s) => s.team_id));
    if (teams.size !== value.slots.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['slots'],
        message: 'a team can fill only one slot in a match',
      });
    }
  });
export type SetMatchTeamsInput = z.input<typeof setMatchTeamsInput>;

export const deleteMatchInput = z.object({ match_id: uuid }).strict();
export type DeleteMatchInput = z.input<typeof deleteMatchInput>;

export const deleteMatchOutput = z.object({ id: uuid, deleted: z.literal(true) });
export type DeleteMatchOutput = z.infer<typeof deleteMatchOutput>;

export const listMatchesInput = z
  .object({
    event_id: uuid,
    limit: z.number().int().min(1).optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();
export type ListMatchesInput = z.input<typeof listMatchesInput>;

/** Practice, qualification, playoff, then by number. */
export const listMatchesOutput = z.object({
  items: z.array(matchRow),
  next_cursor: z.string().nullable(),
});
export type ListMatchesOutput = z.infer<typeof listMatchesOutput>;

/**
 * SPEC-FINAL 6.4: the bare auto-creation. `id` is client-generated, so an offline device
 * can reference the match before the server has seen it. Event, type and number only:
 * it can never set teams, edit or delete.
 */
export const ensureMatchInput = z
  .object({
    id: uuid,
    event_id: uuid,
    match_type: matchType,
    number: matchNumber,
  })
  .strict();
export type EnsureMatchInput = z.input<typeof ensureMatchInput>;

/**
 * `id` is the match's CANONICAL id: when the match already existed it is the existing
 * row's id, which may differ from the id the caller sent.
 */
export const ensureMatchOutput = z.object({ id: uuid, created: z.boolean() });
export type EnsureMatchOutput = z.infer<typeof ensureMatchOutput>;
