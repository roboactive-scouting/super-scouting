import { z } from 'zod';
import { operationSchema } from './operation';

export const MAX_OPERATIONS_PER_PUSH = 200;
/** The delta pull rewinds the watermark by five seconds (SPEC-FINAL 9.3, D5). */
export const WATERMARK_OVERLAP_MS = 5000;

export const pushRequestSchema = z.object({
  device_id: z.string().uuid(),
  operations: z.array(operationSchema).max(MAX_OPERATIONS_PER_PUSH),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

/**
 * The server's parse of a push (UF.12): the envelope strictly, the operations only as an
 * array. Each operation is then parsed on its own, so a malformed one is answered
 * `invalid` (SPEC-FINAL 9.3.1: a rejection does not stop the batch) instead of turning the
 * whole push into a 400 that blocks every good operation queued behind it. The client
 * still sends a PushRequest.
 */
export const pushEnvelopeSchema = z.object({
  device_id: z.string().uuid(),
  operations: z.array(z.unknown()).max(MAX_OPERATIONS_PER_PUSH),
});

export const REJECTION_REASONS = [
  'parent-deleted',
  'edit-window-expired',
  'forbidden',
  'invalid',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/**
 * The `detail` of a `parent-deleted` rejection, naming the parent that is gone (SPEC-FINAL
 * 9.3.1, amended v1.18). The client keys on it: a missing MATCH is rebuilt from its cached
 * row and pushed again (9.7); any other missing parent follows 9.7 as written. `other` is a
 * foreign-key failure the server cannot attribute to one of these.
 */
export const PARENT_DELETED_DETAIL = {
  event: 'the event no longer exists',
  match: 'the match no longer exists',
  team: 'the team no longer exists',
  form_version: 'the form version no longer exists',
  other: 'a record this one belongs to no longer exists',
} as const;

export type PushStatus = 'applied' | 'noop' | 'divergence' | 'duplicate' | 'rejected';

export type PushResult =
  | { op_id: string; status: 'applied' | 'noop'; row_id: string; new_version: number }
  | {
      op_id: string;
      status: 'divergence';
      row_id: string;
      new_version: number;
      conflict_id: string;
    }
  | {
      op_id: string;
      status: 'duplicate';
      row_id: string;
      new_version: number;
      conflict_id: string;
      duplicate_row_id: string;
    }
  | { op_id: string; status: 'rejected'; reason: RejectionReason; detail?: string };

export type PushResponse = { results: PushResult[] };

/**
 * The durability rule's test (SPEC-FINAL 9.4). applied, noop, divergence and duplicate
 * all mean the data is on the server, so the record may be pruned from the outbox.
 * `rejected` is never an ack and the record stays local.
 */
export function isAck(status: PushStatus): boolean {
  return status !== 'rejected';
}

/** The complete synced set (SPEC-FINAL 9.3). Every row carries its deleted_at. */
export const PULL_ENTITY_KEYS = [
  'app_settings',
  'seasons',
  'events',
  'teams',
  'event_teams',
  'matches',
  'match_teams',
  'forms',
  'form_versions',
  'form_fields',
  'scoring_rules',
  'users',
  'scouting_entries',
  'sync_conflicts',
  'pick_lists',
  'pick_list_entries',
  'do_not_pick',
  'alliances',
  'alliance_slots',
  'alliance_declines',
  'metrics',
  'dashboards',
  'dashboard_charts',
  'weight_presets',
] as const;

export type PullEntityKey = (typeof PULL_ENTITY_KEYS)[number];

export const pullRequestSchema = z.object({
  event_id: z.string().uuid(),
  since: z.string().datetime({ offset: false }).optional(),
  cursor: z.string().optional(),
});
export type PullRequest = z.infer<typeof pullRequestSchema>;

export type PullResponse = {
  watermark: string;
  next_cursor: string | null;
  complete: boolean;
  entities: Record<PullEntityKey, Record<string, unknown>[]>;
  /**
   * SPEC-FINAL 9.3 (amended v1.18): a match has no deleted_at, so a delta pull also names
   * the event's matches hard-deleted since `since`. Always `[]` on a full pull, whose
   * dataset already leaves them out. Optional so a client still reads a server that
   * predates it: read it as `deleted_matches ?? []`.
   */
  deleted_matches?: string[];
};
