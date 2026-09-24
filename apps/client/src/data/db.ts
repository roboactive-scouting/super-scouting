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

export type DiscardedRecord = {
  id: string;
  discarded_at: string;
  reason: string;
  summary: Record<string, unknown>;
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

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const record = await db.meta.get(key);
  return record === undefined ? fallback : (record.value as T);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
