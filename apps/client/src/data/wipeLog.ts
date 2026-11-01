import type { Operation, SyncEntity } from '@frc/shared';
import { matchLabel } from '@/lib/matchLabel';
import { db, type DiscardedRecord, type DiscardedSummary } from './db';
import { describeEntry, UNKNOWN_EVENT, UNKNOWN_SCOUTER, WIPE_REASON } from './discarded';

type Raw = Record<string, unknown>;
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** What a lost record other than an entry was, as the log names it (Wipe anyway). */
const OTHER_WHAT: Record<Exclude<SyncEntity, 'scouting_entry'>, string> = {
  match: 'Match',
  pick_list: 'Pick list',
  pick_list_entry: 'Pick list change',
  do_not_pick: 'Do-not-pick change',
  alliance_slot: 'Alliance selection change',
  alliance_decline: 'Alliance selection change',
};

/** The cached row's pull key, back to the operation's entity (a pending row with no operation). */
const ENTITY_OF: Partial<Record<string, SyncEntity>> = {
  scouting_entries: 'scouting_entry',
  matches: 'match',
  pick_lists: 'pick_list',
  pick_list_entries: 'pick_list_entry',
  do_not_pick: 'do_not_pick',
  alliance_slots: 'alliance_slot',
  alliance_declines: 'alliance_decline',
};

/**
 * One record that is not an entry (a bare match, a pick-list change): what it was, its match
 * when it is one, its competition. Labels only, never a value.
 */
async function describeOther(
  entity: Exclude<SyncEntity, 'scouting_entry'>,
  src: Raw,
  author: string | null,
  savedAt: string,
): Promise<{ summary: DiscardedSummary; event_id: string | null; event_name: string | null }> {
  const eventId = text(src.event_id);
  const [event, user] = await Promise.all([
    eventId ? db.rows.get(['events', eventId]) : undefined,
    author ? db.rows.get(['users', author]) : undefined,
  ]);
  const isMatch = entity === 'match' && typeof src.number === 'number' && text(src.match_type);
  return {
    summary: {
      form_kind: null,
      match: isMatch
        ? matchLabel({ match_type: String(src.match_type), number: Number(src.number) })
        : null,
      match_type: isMatch ? String(src.match_type) : null,
      match_number: isMatch ? Number(src.number) : null,
      alliance: null,
      station: null,
      team: '',
      team_number: null,
      team_name: null,
      robot_status: null,
      scouter: text(user?.full_name) ?? UNKNOWN_SCOUTER,
      scouter_id: author,
      client_updated_at: savedAt,
      what: OTHER_WHAT[entity],
    },
    event_id: eventId,
    event_name: text(event?.name),
  };
}

/**
 * **Wipe anyway** (SPEC-FINAL 9.9, v1.39; Phase 1 H side task 2): every record the wipe is about
 * to destroy without a cloud ack goes to the log first, one row per record — each row in the
 * outbox (its latest operation), each pending row with no operation left (a parked or received
 * copy), then each unfinished entry — with `WIPE_REASON`. Exactly `heldCount(readWipeHold())`
 * rows, so the count the lead typed is the count the log gains. Summary only, as 9.7: never an
 * entered value. Written already dismissed: the lead saw the loss and confirmed it, and the
 * notice must not greet the next person to sign in; the log still lists every row.
 *
 * Call it inside the wipe's transaction (outbox, syncState, rows, drafts, meta, discarded),
 * before anything is cleared: it resolves names from the cache.
 */
export async function recordWiped(at: string = new Date().toISOString()): Promise<number> {
  const latest = new Map<string, Operation>();
  await db.outbox.each((op) => {
    const prev = latest.get(op.row_id);
    if (!prev || op.seq > prev.seq) latest.set(op.row_id, op);
  });
  const pending = await db.syncState.where('sync_state').equals('pending').primaryKeys();
  const signedIn = (await db.meta.get('auth.session'))?.value as { user?: { id?: unknown } } | null;
  const author = text(signedIn?.user?.id);

  const records: DiscardedRecord[] = [];
  const add = (
    id: string,
    rowId: string,
    d: { summary: DiscardedSummary; event_id: string | null; event_name: string | null },
  ) =>
    records.push({
      id,
      discarded_at: at,
      reason: WIPE_REASON,
      row_id: rowId,
      event_id: d.event_id,
      event_name: d.event_name ?? UNKNOWN_EVENT,
      summary: d.summary,
      dismissed_at: at,
    });

  for (const [rowId, op] of latest) {
    const d =
      op.entity === 'scouting_entry'
        ? await describeEntry(op, await db.rows.get(['scouting_entries', rowId]))
        : await describeOther(
            op.entity,
            { ...((await db.rows.where('id').equals(rowId).first()) ?? {}), ...op.payload },
            text(op.author_user_id),
            op.client_updated_at,
          );
    add(`wiped:${at}:${rowId}`, rowId, d);
  }

  for (const rowId of pending) {
    if (latest.has(rowId)) continue;
    const row = await db.rows.where('id').equals(rowId).first();
    const entity = ENTITY_OF[String(row?.entity)] ?? 'scouting_entry';
    const savedAt =
      text(row?.client_updated_at) ?? text(row?.updated_at) ?? text(row?.created_at) ?? at;
    const author = text(row?.scouter_id) ?? text(row?.created_by);
    const d =
      entity === 'scouting_entry'
        ? await describeEntry(
            { payload: {}, author_user_id: author ?? '', client_updated_at: savedAt },
            row,
          )
        : await describeOther(entity, row ?? {}, author, savedAt);
    add(`wiped:${at}:${rowId}`, rowId, d);
  }

  for (const draft of await db.drafts.toArray()) {
    // A draft's key is `<form version>:<match id | super>:<team id>` (useDraft, DraftRecovery).
    const [, middle = '', last = ''] = draft.key.split(':');
    const kind = middle === 'super' ? 'super' : 'match';
    const src: Raw = {
      ...draft.payload,
      form_kind: kind,
      team_id: text(draft.payload.team_id) ?? last,
      ...(kind === 'match' ? { match_id: middle } : {}),
    };
    const d = await describeEntry(
      { payload: src, author_user_id: author ?? '', client_updated_at: draft.updated_at },
      undefined,
    );
    d.summary.what = kind === 'super' ? 'Unfinished super entry' : 'Unfinished match entry';
    add(`wiped:${at}:draft:${draft.key}`, draft.row_id, d);
  }

  await db.discarded.bulkPut(records);
  return records.length;
}
