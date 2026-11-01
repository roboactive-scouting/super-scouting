import {
  formatDate,
  formatTime,
  formatWeekdayTime,
  type Operation,
  type RejectionReason,
} from '@frc/shared';
import { cachedRows } from './cache';
import { db, type DiscardedSummary, type PushRejection } from './db';
import { describeEntry } from './discarded';
import { rejectionMessage } from './rejections';

/**
 * One record on the Sync page (SPEC-FINAL 9.10; 17-sync final): what a person recognises — the
 * match, the team, the robot status, the station, when it was saved, where it was made — plus
 * its sync state. An unsynced record comes from its outbox operation; a sent one from its
 * cached row.
 */
export type SyncRecord = {
  row_id: string;
  entity: Operation['entity'];
  /** The queued operation's action; null for a sent record. */
  action: Operation['action'] | null;
  /** The record's competition, and its name when the device holds the `events` row. */
  event_id: string | null;
  event_name: string | null;
  summary: DiscardedSummary;
  match_id: string | null;
  team_id: string | null;
  /** Made on this device, or received from another by QR (SPEC-FINAL 9.8). */
  origin: 'local' | 'qr';
  /** For a QR copy: its author's first name ("QR · from Yael"). */
  from: string | null;
  /** Its match was created on this device and sends with it (SPEC-FINAL 6.4, 9.10). */
  new_match: boolean;
  /** The server refused its last push (SPEC-FINAL 9.3.1); it waits for a lead. */
  rejection: PushRejection | null;
  /** When the cloud acked it; null while it waits. */
  acked_at: string | null;
  /** The last time the QR sender showed it ("shown by QR 11:44", SPEC-FINAL 9.10); else null. */
  qr_shown_at: string | null;
};

export type SyncList = {
  /** Every unsynced record on the device, whatever its event: exactly `unsyncedCount()` items. */
  waiting: SyncRecord[];
  /** What reached the cloud, newest ack first, at most SENT_LIMIT. */
  sent: SyncRecord[];
  /** The waiting records the server refused (Problems). */
  refused: SyncRecord[];
};

/** How many sent records the Sent tab lists: the latest acks, enough for a competition day. */
export const SENT_LIMIT = 100;

type Raw = Record<string, unknown>;
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const firstName = (full: string | null) => (full ? (full.split(' ')[0] ?? full) : null);
const newestSaved = (a: SyncRecord, b: SyncRecord) =>
  b.summary.client_updated_at.localeCompare(a.summary.client_updated_at);

/**
 * The Sync page's three lists, from this device only. Waiting is built from the very source
 * `unsyncedCount()` counts — `db.outbox` minus bare matches — so the list and the indicator
 * cannot disagree (SPEC-FINAL 9.10). A bare match is never a line of its own: the entry it
 * carries says "new match — sends with this entry".
 */
export async function readSyncList(): Promise<SyncList> {
  const [ops, states, users] = await Promise.all([
    db.outbox.orderBy('seq').toArray(),
    db.syncState.toArray(),
    cachedRows<{ id: string; full_name?: string }>('users'),
  ]);
  const stateOf = new Map(states.map((s) => [s.row_id, s]));
  const nameOf = new Map(users.map((u) => [u.id, text(u.full_name)]));
  const queuedMatches = new Set(ops.filter((op) => op.entity === 'match').map((op) => op.row_id));

  const waiting: SyncRecord[] = [];
  for (const op of ops) {
    if (op.entity === 'match') continue;
    const row =
      op.entity === 'scouting_entry'
        ? await db.rows.get(['scouting_entries', op.row_id])
        : undefined;
    const src: Raw = { ...(row ?? {}), ...op.payload };
    const { summary, event_id, event_name } = await describeEntry(op, row);
    const state = stateOf.get(op.row_id);
    const matchId = text(src.match_id);
    waiting.push({
      row_id: op.row_id,
      entity: op.entity,
      action: op.action,
      event_id,
      event_name,
      summary,
      match_id: matchId,
      team_id: text(src.team_id),
      origin: state?.origin ?? 'local',
      from: firstName(nameOf.get(op.author_user_id) ?? null),
      new_match: matchId !== null && queuedMatches.has(matchId),
      rejection: state?.rejection ?? null,
      acked_at: null,
      qr_shown_at: state?.qr_shown_at ?? null,
    });
  }
  waiting.sort(newestSaved);

  const acked = states
    .filter((s) => s.sync_state === 'acked' && s.rejection == null && s.acked_at !== null)
    .sort((a, b) => String(b.acked_at).localeCompare(String(a.acked_at)));
  const sent: SyncRecord[] = [];
  for (const state of acked) {
    if (sent.length >= SENT_LIMIT) break;
    // A bare match's ack is not a record; neither is an entry no longer on the device.
    const row = await db.rows.get(['scouting_entries', state.row_id]);
    if (!row || row.deleted_at != null) continue;
    const saved = text(row.client_updated_at) ?? text(row.updated_at) ?? '';
    const scouter = text(row.scouter_id);
    const { summary, event_id, event_name } = await describeEntry(
      { payload: {}, author_user_id: scouter ?? '', client_updated_at: saved },
      row,
    );
    sent.push({
      row_id: state.row_id,
      entity: 'scouting_entry',
      action: null,
      event_id,
      event_name,
      summary,
      match_id: text(row.match_id),
      team_id: text(row.team_id),
      // An ack clears a received copy's `origin` (SPEC-FINAL 9.8); it was still received by QR.
      origin: state.received_by_qr ? 'qr' : state.origin,
      from: firstName(scouter ? (nameOf.get(scouter) ?? null) : null),
      new_match: false,
      rejection: null,
      acked_at: state.acked_at,
      qr_shown_at: null,
    });
  }

  return { waiting, sent, refused: waiting.filter((r) => r.rejection !== null) };
}

/** One competition's records, as Waiting groups them (17-sync final). */
export type SyncGroup = {
  event_id: string | null;
  event_name: string | null;
  /** The event this device works on: listed first, "this event · n". */
  current: boolean;
  records: SyncRecord[];
};

/**
 * Waiting grouped by competition: this event first, then each other event under its own
 * heading, by name (spec §7.5 item 4: after a default move, the old event's records are still
 * on a screen). Records keep their order.
 */
export function groupByEvent(
  records: readonly SyncRecord[],
  currentEventId: string | null,
): SyncGroup[] {
  const groups = new Map<string, SyncGroup>();
  for (const record of records) {
    const key = record.event_id ?? '';
    let group = groups.get(key);
    if (!group) {
      group = {
        event_id: record.event_id,
        event_name: record.event_name,
        current: record.event_id !== null && record.event_id === currentEventId,
        records: [],
      };
      groups.set(key, group);
    }
    group.records.push(record);
  }
  return [...groups.values()].sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      (a.event_name ?? '￿').localeCompare(b.event_name ?? '￿'),
  );
}

// The open-conflict count lives in cache.ts (task 1.44): the shell's nav reads it on every
// screen, and this module is the Sync page's, a lazy chunk.
export { openConflictCount } from './cache';

/** "11:47" today, "Sat 15:02" this week, "07/10/2026 15:02" before that (SPEC-FINAL 17.8). */
export function savedLabel(iso: string, now: Date = new Date()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '—';
  if (formatDate(iso) === formatDate(now.toISOString())) return formatTime(iso);
  if (now.getTime() - at < 6 * 24 * 60 * 60 * 1000) return formatWeekdayTime(iso);
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

/** "11:40" today, "14/11/2026 09:31" on any other day (SPEC-FINAL 17.8). */
export function lastSyncLabel(iso: string, now: Date = new Date()): string {
  return formatDate(iso) === formatDate(now.toISOString())
    ? formatTime(iso)
    : `${formatDate(iso)} ${formatTime(iso)}`;
}

const sentence = (line: string) => {
  const trimmed = line.trim();
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
};

/**
 * The server's detail as a sentence (17-sync final). The edit window's line is the client's
 * own, the same as on Entries (SPEC-FINAL 7.6, v1.44), so a record refused before the
 * rewording still reads "Changed after the 5-minute edit window. A lead can save it for you."
 */
export function notSentLine(rejection: PushRejection): string {
  return sentence(
    (rejection.code !== 'edit-window-expired' && rejection.message.trim()) ||
      rejectionMessage(rejection),
  );
}

/**
 * Why it was refused, in plain words, by reason (17-sync final, Problems). None for the edit
 * window: its one line already says why (SPEC-FINAL 7.6, v1.44).
 */
const REASON_WORDS: Partial<Record<RejectionReason, string>> = {
  forbidden: 'The account that saved it isn’t allowed to make this change.',
  invalid: 'Something in it didn’t pass the server’s checks.',
  'parent-deleted': 'Something it belongs to was deleted.',
};

export function reasonInWords(code: RejectionReason): string | undefined {
  return REASON_WORDS[code];
}
