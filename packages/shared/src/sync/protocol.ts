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

export const REJECTION_REASONS = [
  'parent-deleted',
  'edit-window-expired',
  'forbidden',
  'invalid',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

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
};
