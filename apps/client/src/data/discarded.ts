import { formatCount, type Operation } from '@frc/shared';
import { matchLabel } from '@/lib/matchLabel';
import { liveSlots } from './cache';
import { notifyChanged } from './changes';
import { db, type DiscardedRecord, type DiscardedSummary } from './db';

/**
 * The cause, in general words (19-discarded README): `parent-deleted` says which parent went
 * only in its detail, and the log speaks for every record the same way.
 */
export const DISCARD_REASON = 'An admin deleted the competition, season or form it belonged to.';
/** The competition's name when the device no longer holds its `events` row. */
export const UNKNOWN_EVENT = 'an earlier competition';
export const UNKNOWN_SCOUTER = 'unknown scouter';

type Raw = Record<string, unknown>;
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const STATIONS = ['R1', 'R2', 'R3', 'B1', 'B2', 'B3'] as const;

/**
 * Writes what is about to be discarded to the log (SPEC-FINAL 9.7), resolved from the cache
 * BEFORE anything is deleted: the competition's name, the match, the station, the team, the
 * robot status, the form kind, the scouter and when it was saved. The operation's payload is
 * the latest content (an update carries the whole row); the cached row fills in what a delete
 * or an older payload lacks. **No entered value is kept** (no `data`, no `breakdown_seconds`).
 * Runs inside the caller's transaction when there is one (it needs `rows` and `discarded`).
 */
export async function recordDiscarded(
  op: Operation,
  row: Raw | undefined,
  at: string = new Date().toISOString(),
): Promise<DiscardedRecord> {
  const { summary, event_id: eventId, event_name } = await describeEntry(op, row);
  const record: DiscardedRecord = {
    id: op.op_id,
    discarded_at: at,
    reason: DISCARD_REASON,
    row_id: op.row_id,
    event_id: eventId,
    event_name: event_name ?? UNKNOWN_EVENT,
    summary,
    dismissed_at: null,
  };
  await db.discarded.put(record);
  return record;
}

/**
 * An entry operation the way a person recognises it (SPEC-FINAL 9.7, 9.10), resolved from the
 * cache: its competition (`event_name` null when the device holds no `events` row for it), the
 * match, the station, the team, the robot status, the form kind, the scouter and when it was
 * saved. The payload is the latest content; the cached row fills in what a delete or an older
 * payload lacks. Reads only — the discarded log and the Sync page both use it. Never an entered
 * value (`data`, `breakdown_seconds`).
 */
export async function describeEntry(
  op: Pick<Operation, 'payload' | 'author_user_id' | 'client_updated_at'>,
  row: Raw | undefined,
): Promise<{ summary: DiscardedSummary; event_id: string | null; event_name: string | null }> {
  const src: Raw = { ...(row ?? {}), ...op.payload };
  const eventId = text(src.event_id);
  const matchId = text(src.match_id);
  const teamId = text(src.team_id);
  const scouterId = text(src.scouter_id) ?? text(op.author_user_id);

  const [event, match, team, user, slots] = await Promise.all([
    eventId ? db.rows.get(['events', eventId]) : undefined,
    matchId ? db.rows.get(['matches', matchId]) : undefined,
    teamId ? db.rows.get(['teams', teamId]) : undefined,
    scouterId ? db.rows.get(['users', scouterId]) : undefined,
    matchId ? db.rows.where('match_id').equals(matchId).toArray() : [],
  ]);

  const slot = liveSlots(
    slots.filter((s) => s.entity === 'match_teams') as (Raw & { deleted_at?: string | null })[],
  ).find((s) => s.team_id === teamId);
  const station = slot ? `${slot.alliance === 'blue' ? 'B' : 'R'}${String(slot.station)}` : null;

  const formKind = src.form_kind === 'super' || src.form_kind === 'match' ? src.form_kind : null;
  const teamNumber = typeof team?.number === 'number' ? team.number : null;
  const teamName = text(team?.name);
  const summary: DiscardedSummary = {
    form_kind: formKind,
    match:
      match && formKind !== 'super'
        ? matchLabel({ match_type: String(match.match_type), number: Number(match.number) })
        : null,
    match_type: match ? String(match.match_type) : null,
    match_number: match ? Number(match.number) : null,
    alliance: src.alliance === 'red' || src.alliance === 'blue' ? src.alliance : null,
    station: STATIONS.find((s) => s === station) ?? null,
    team:
      teamNumber !== null
        ? [formatCount(teamNumber), teamName].filter(Boolean).join(' ')
        : (teamId ?? 'unknown team'),
    team_number: teamNumber,
    team_name: teamName,
    robot_status: text(src.robot_status),
    scouter: text(user?.full_name) ?? UNKNOWN_SCOUTER,
    scouter_id: scouterId,
    client_updated_at: op.client_updated_at,
  };
  return { summary, event_id: eventId, event_name: text(event?.name) };
}

/**
 * SPEC-FINAL 9.7: an entry whose parent an admin hard-deleted (and whose match cannot be
 * rebuilt) leaves the device — the only path in the product that destroys data a scouter
 * typed. The log record is written FIRST, then the operation, the cached row and its sync
 * state go. Call it inside a transaction over outbox, syncState, rows and discarded, so a
 * failure part-way leaves everything as it was.
 */
export async function discardEntry(op: Operation, at?: string): Promise<DiscardedRecord> {
  const row = await db.rows.get(['scouting_entries', op.row_id]);
  const record = await recordDiscarded(op, row, at);
  await db.outbox.delete(op.op_id);
  await db.rows.where('[entity+id]').equals(['scouting_entries', op.row_id]).delete();
  await db.syncState.delete(op.row_id);
  return record;
}

/** The whole log, newest removal first. Never pruned: it lives as long as the install. */
export async function listDiscarded(): Promise<DiscardedRecord[]> {
  const all = await db.discarded.orderBy('discarded_at').reverse().toArray();
  // Within one removal: by competition, then in the order the records were saved.
  return all.sort(
    (a, b) =>
      b.discarded_at.localeCompare(a.discarded_at) ||
      a.event_name.localeCompare(b.event_name) ||
      a.summary.client_updated_at.localeCompare(b.summary.client_updated_at),
  );
}

/** What the Sync page's notice lists: the records nobody has dismissed yet. */
export async function undismissedDiscarded(): Promise<DiscardedRecord[]> {
  return (await listDiscarded()).filter((r) => r.dismissed_at == null);
}

/**
 * Dismiss: the notice stops listing these records (all undismissed ones when no ids are
 * given). The log still shows them.
 */
export async function dismissDiscarded(ids?: readonly string[]): Promise<void> {
  const at = new Date().toISOString();
  await db.transaction('rw', db.discarded, async () => {
    const targets = ids
      ? await db.discarded.bulkGet([...ids])
      : await db.discarded.filter((r) => r.dismissed_at == null).toArray();
    for (const r of targets) {
      if (r && r.dismissed_at == null) await db.discarded.put({ ...r, dismissed_at: at });
    }
  });
  notifyChanged('discarded');
}

/** Groups the log by removal, newest first, each with its competition (19-discarded). */
export type DiscardedGroup = {
  discarded_at: string;
  event_name: string;
  records: DiscardedRecord[];
};

export function groupDiscarded(records: readonly DiscardedRecord[]): DiscardedGroup[] {
  const groups: DiscardedGroup[] = [];
  for (const r of records) {
    const last = groups.at(-1);
    if (last && last.discarded_at === r.discarded_at && last.event_name === r.event_name) {
      last.records.push(r);
    } else {
      groups.push({ discarded_at: r.discarded_at, event_name: r.event_name, records: [r] });
    }
  }
  return groups;
}
