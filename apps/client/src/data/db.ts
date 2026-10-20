import Dexie, { type Table } from 'dexie';
import type { Operation, PullEntityKey, RejectionReason } from '@frc/shared';

/** SPEC-FINAL 9.2. Per-record sync state is the representation behind the durability
 *  rule (9.4), QR-copy disposal (9.8) and the wipe guard (9.9). */
export type SyncStateRecord = {
  row_id: string;
  sync_state: 'pending' | 'acked';
  acked_at: string | null;
  origin: 'local' | 'qr';
  /**
   * The latest push rejection for this row, if its last push was refused. The operation
   * stays in the outbox regardless (the durability rule, 9.4); this only lets the UI say
   * why it has not synced. Cleared on ack. Not indexed, so no schema version bump.
   */
  rejection?: PushRejection | null;
  /**
   * The last time this row's QR batch was on the sender's screen (SPEC-FINAL 9.8, 9.10; task
   * 1.47): Sync says "shown by QR hh:mm". A display, never a receipt: the row stays pending.
   * Local only, not indexed (no schema version bump); a new local save drops it (enqueue
   * writes a fresh state), since the new content has not been shown.
   */
  qr_shown_at?: string | null;
  /**
   * A copy this device received from another by QR (SPEC-FINAL 9.8; task 1.48). Permanent:
   * unlike `origin`, which the outbox consults and an ack clears to 'local', this stays, so
   * "Discard received QR data" can still find a copy after its ack. Not indexed (no schema
   * version bump).
   */
  received_by_qr?: boolean;
  /** When this device last scanned the copy (Sync's "last scan 11:44"); with `received_by_qr`. */
  received_at?: string | null;
};

export type PushRejection = { code: RejectionReason; message: string; at: string };

export type CachedRow = Record<string, unknown> & { id: string; entity: PullEntityKey };

export type DraftRecord = {
  key: string; // a stable key per (form_kind, match_id, team_id)
  row_id: string;
  payload: Record<string, unknown>;
  updated_at: string;
};

export type MetaRecord = { key: string; value: unknown };

/**
 * What was discarded, as SPEC-FINAL 9.7 lists it, resolved from the cache before the record
 * went. Labels only: **never the entered values** (`data`, `breakdown_seconds`) — the log does
 * not show them (user, 2026-10-12), so the device does not keep them either.
 */
export type DiscardedSummary = {
  form_kind: 'match' | 'super' | null;
  /** "Q12"; null for a super entry, or when the match was not cached. */
  match: string | null;
  match_type: string | null;
  match_number: number | null;
  alliance: 'red' | 'blue' | null;
  /** "R2", from the cached line-up; null when the team was not in it. */
  station: 'R1' | 'R2' | 'R3' | 'B1' | 'B2' | 'B3' | null;
  /** "2096 ROBACTIVE", or the team id when the team was not cached. */
  team: string;
  team_number: number | null;
  team_name: string | null;
  robot_status: string | null;
  /** The scouter's full name, or "unknown scouter". */
  scouter: string;
  scouter_id: string | null;
  /** When the entry was last saved on the device. */
  client_updated_at: string;
};

/** SPEC-FINAL 9.7: one record in the discarded log, kept for the life of the install. */
export type DiscardedRecord = {
  /** The discarded operation's op_id: writing the same record twice is one record. */
  id: string;
  discarded_at: string;
  /** The cause, in general words (`parent-deleted` does not say which parent went). */
  reason: string;
  row_id: string;
  event_id: string | null;
  /** The competition's name as the cache held it, or "an earlier competition". */
  event_name: string;
  summary: DiscardedSummary;
  /** Set once the Sync notice has been dismissed; the log keeps showing the record. */
  dismissed_at?: string | null;
};

class ScoutingDb extends Dexie {
  rows!: Table<CachedRow, string>;
  outbox!: Table<Operation, string>;
  syncState!: Table<SyncStateRecord, string>;
  drafts!: Table<DraftRecord, string>;
  practiceDrafts!: Table<DraftRecord, string>;
  discarded!: Table<DiscardedRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super('robactive-scouting');
    this.version(1).stores({
      rows: '[entity+id], entity, id, event_id, updated_at, team_id, match_id',
      outbox: 'op_id, row_id, seq',
      syncState: 'row_id, sync_state, origin',
      drafts: 'key, row_id, updated_at',
      practiceDrafts: 'key, updated_at',
      discarded: 'id, discarded_at',
      meta: 'key',
    });
  }
}

export const db = new ScoutingDb();

/**
 * When this device was last wiped (SPEC-FINAL 9.9; task 1.49, `data/wipe.ts`). A sync reads it
 * as its pull begins and again as it marks the device hydrated: a wipe in between means the pull
 * was partly written to a device that has since been emptied, so it does not claim hydration.
 */
export const WIPED_AT_KEY = 'device.wiped_at';

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const record = await db.meta.get(key);
  return record === undefined ? fallback : (record.value as T);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
