import {
  FORM_DELETION_ENTITIES,
  isAck,
  MAX_OPERATIONS_PER_PUSH,
  PULL_ENTITY_KEYS,
  type DeletedFormRows,
  type PullEntityKey,
} from '@frc/shared';
import { session } from '@/auth/session';
import { cachedRows } from './cache';
import { notifyChanged } from './changes';
import { db, getMeta, setMeta, WATERMARK_KEY, WIPED_AT_KEY } from './db';
import type { SyncProgress } from './connection';
import { ackResults, matchIdsNeededByOutbox, pending } from './outbox';
import { call } from './rpc';
import { clearSyncFailure, recordSyncFailure } from './syncFailure';
import type { Api } from './api';

export type SyncDeps = {
  api: Api;
  eventId: string;
  deviceId: string;
  /** Guard against an endless cursor loop; the real cap is the server's page size. */
  maxPages?: number;
  /**
   * The push's progress, for the Sync page's "Sent · 2 of 5" (SPEC-FINAL 9.10): called once
   * before the first batch and after each batch is acked. Records only — a bare match is never
   * counted (9.10) — and only those the push may send (a parked record is not sent).
   */
  onProgress?: (progress: SyncProgress) => void;
};

export type SyncOutcome =
  | { status: 'ok'; pushed: number; pulled: number }
  | { status: 'offline'; reason: string }
  /** The server refused the token (401). The session is already expired; nothing was lost. */
  | { status: 'unauthenticated' }
  | { status: 'event-gone' };

const WATERMARK = WATERMARK_KEY;
const HYDRATED = 'sync.hydrated_event_id';

function isEventGone(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'not-found';
}

function isUnauthenticated(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { status?: number }).status === 401;
}

/**
 * Ops acked by an earlier batch of this same sync stay acked (ackResults commits each
 * batch); everything unacked stays queued. A 401 simply stops the sync. Why it failed is
 * kept for the sync line (UF.13) until a sync succeeds.
 */
async function failure(e: unknown, fallback: string): Promise<SyncOutcome> {
  await recordSyncFailure(e);
  if (isUnauthenticated(e)) return { status: 'unauthenticated' };
  return { status: 'offline', reason: e instanceof Error ? e.message : fallback };
}

/** SPEC-FINAL 9.3, 9.4: push first so nothing local is overwritten by a stale pull. */
export async function syncNow(deps: SyncDeps): Promise<SyncOutcome> {
  let pushed = 0;
  try {
    // Each operation is sent at most once per sync: a transient failure waits for the
    // next sync instead of looping, and parked operations are never in `pending`.
    const sent = new Set<string>();
    const report = deps.onProgress;
    const total = report
      ? (await pending(Number.MAX_SAFE_INTEGER)).filter((op) => op.entity !== 'match').length
      : 0;
    const acked: string[] = [];
    if (report && total > 0) report({ sent: 0, total, acked: [] });
    for (;;) {
      const batch = await pending(MAX_OPERATIONS_PER_PUSH, sent);
      if (batch.length === 0) break;
      for (const op of batch) sent.add(op.op_id);
      const response = await deps.api.push({ device_id: deps.deviceId, operations: batch });
      await ackResults(response.results);
      pushed += response.results.length;
      if (report && total > 0) {
        const records = new Map(
          batch.filter((op) => op.entity !== 'match').map((op) => [op.op_id, op.row_id]),
        );
        for (const result of response.results) {
          const rowId = records.get(result.op_id);
          if (rowId !== undefined && isAck(result.status)) acked.push(rowId);
        }
        report({ sent: Math.min(acked.length, total), total, acked: [...acked] });
      }
    }
  } catch (e) {
    if (isEventGone(e)) return wipeEvent(deps.eventId);
    return failure(e, 'push failed');
  }

  let pulled = 0;
  try {
    // The watermark is one device-wide value, and it belongs to the event whose pull last
    // completed (task 1.22). Another event's watermark would make this a delta of rows
    // updated since that pull — skipping every older match, roster row and form of an
    // event this device has never loaded, while still marking it hydrated. So a pull for
    // any other event starts from scratch.
    const wipedAt = await getMeta<string | null>(WIPED_AT_KEY, null);
    const hydratedFor = await getMeta<string | null>(HYDRATED, null);
    const stored = await getMeta<string | null>(WATERMARK, null);
    const since = hydratedFor === deps.eventId ? stored : null;
    let cursor: string | undefined;
    let bestWatermark = since;
    let complete = false;
    const maxPages = deps.maxPages ?? 50;

    for (let page = 0; page < maxPages; page += 1) {
      const response = await deps.api.pull({
        event_id: deps.eventId,
        ...(since ? { since } : {}),
        ...(cursor ? { cursor } : {}),
      });
      const applied = await upsertEntities(response.entities);
      const pruned = await pruneDeletedMatches(
        response.deleted_matches ?? [],
        response.entities.matches ?? [],
      );
      const prunedForms = await pruneDeletedFormRows(
        response.deleted_form_rows ?? NO_FORM_DELETIONS,
        response.entities,
      );
      pulled += applied;
      if (applied > 0 || pruned > 0 || prunedForms > 0) notifyChanged('rows');
      if (bestWatermark === null || response.watermark > bestWatermark)
        bestWatermark = response.watermark;
      if (response.complete) {
        complete = true;
        break;
      }
      cursor = response.next_cursor ?? undefined;
      if (cursor === undefined) {
        complete = true;
        break;
      }
    }

    // A device wipe while this pull ran (task 1.49) emptied what the earlier pages wrote: the
    // device is not hydrated, and the next sync pulls from scratch. Read and written in one
    // transaction with the wipe's own, so the two cannot interleave.
    const marked =
      complete &&
      bestWatermark !== null &&
      (await db.transaction('rw', db.meta, async () => {
        if ((await getMeta<string | null>(WIPED_AT_KEY, null)) !== wipedAt) return false;
        // "Discard received QR data" cleared the watermark while this pull ran: rows it removed
        // may sit behind this pull's pages. Not marking leaves it cleared, so the next sync
        // pulls in full and they come back.
        if (stored !== null && (await getMeta<string | null>(WATERMARK, null)) === null) {
          return false;
        }
        await setMeta(WATERMARK, bestWatermark);
        await setMeta(HYDRATED, deps.eventId);
        await setMeta('sync.last_success_at', new Date().toISOString());
        return true;
      }));
    if (marked) {
      notifyChanged('meta');
      // Spec 7.5 item 3: the active-competition-only bound (SPEC-FINAL 7.3). The event this
      // sync worked on and the admin default the pull just cached are kept.
      const keep = [deps.eventId, await cachedDefaultEventId()].filter(
        (id): id is string => typeof id === 'string',
      );
      if ((await evictLeftEvents(keep)) > 0) notifyChanged('rows');
    }
    // SPEC-FINAL 7.5: the database is authoritative for role, on the client too.
    await session.refreshFromCache();
  } catch (e) {
    if (isEventGone(e)) return wipeEvent(deps.eventId);
    return failure(e, 'pull failed');
  }

  await clearSyncFailure();
  return { status: 'ok', pushed, pulled };
}

async function upsertEntities(
  entities: Record<PullEntityKey, Record<string, unknown>[]>,
): Promise<number> {
  let count = 0;
  await db.transaction('rw', db.rows, async () => {
    for (const key of PULL_ENTITY_KEYS) {
      const rows = entities[key] ?? [];
      if (rows.length === 0) continue;
      // Idempotent upsert: an overlapping row that arrives twice simply overwrites itself.
      await db.rows.bulkPut(rows.map((row) => ({ ...row, entity: key, id: String(row.id) })));
      count += rows.length;
    }
  });
  return count;
}

/**
 * SPEC-FINAL 9.3 (amended v1.18): a hard-deleted match leaves this device's cache, with its
 * lineup slots (match_teams cascade on the server). Kept: a match the same response
 * delivered as a row (created again since), a match the outbox still needs — a queued entry
 * recorded against it, or its own bare-match create — and a match an entry draft on this
 * device is open on, because the rebuild of SPEC-FINAL 9.7 works from the cached row and an
 * entry submitted from that draft would otherwise be stranded. Returns how many were dropped.
 */
export async function pruneDeletedMatches(
  deletedIds: string[],
  deliveredMatches: Record<string, unknown>[],
): Promise<number> {
  if (deletedIds.length === 0) return 0;
  const delivered = new Set(deliveredMatches.map((row) => String(row.id)));
  return db.transaction('rw', db.rows, db.outbox, db.drafts, async () => {
    const needed = await matchIdsNeededByOutbox();
    // EntryPage keys a draft `${formVersionId}:${matchId}:${teamId}`; uuids hold no colon.
    for (const key of await db.drafts.toCollection().primaryKeys()) {
      const matchId = String(key).split(':')[1];
      if (matchId) needed.add(matchId);
    }
    const drop = deletedIds.filter((id) => !delivered.has(id) && !needed.has(id));
    if (drop.length === 0) return 0;
    await db.rows
      .where('match_id')
      .anyOf(drop)
      .filter((row) => row.entity === 'match_teams')
      .delete();
    return db.rows
      .where('id')
      .anyOf(drop)
      .filter((row) => row.entity === 'matches')
      .delete();
  });
}

const NO_FORM_DELETIONS: DeletedFormRows = {
  forms: [],
  form_versions: [],
  form_fields: [],
  scoring_rules: [],
};

type Raw = Record<string, unknown>;

/** Deletes cached rows by their `[entity+id]` key; answers how many there were. */
async function removeRows(keys: [PullEntityKey, string][]): Promise<number> {
  if (keys.length === 0) return 0;
  return db.rows.where('[entity+id]').anyOf(keys).delete();
}

/** True when the device must keep this row: the outbox has it, or its last push is unsettled. */
async function heldRowIds(): Promise<Set<string>> {
  const held = new Set<string>();
  await db.outbox.each((op) => held.add(op.row_id));
  await db.syncState.each((s) => {
    if (s.sync_state === 'pending' || s.rejection != null) held.add(s.row_id);
  });
  return held;
}

/**
 * Spec 7.5 item 5 (device side): the form rows an admin hard-deleted leave this device. The
 * pull names what was deleted by id; a row that went by cascade is not named, so a deleted
 * form takes its versions and scoring rules (by `form_id`), and every removed version takes
 * its fields (by `form_version_id`). Like pruneDeletedMatches, it runs after the page's rows
 * are upserted, and a NAMED id the same response delivered as a row is kept (it was written
 * again since).
 *
 * The cached entries bound to a removed version follow the eviction rule: one the server
 * already took (not in the outbox, no pending or refused sync state) leaves the cache — the
 * server hard-deleted it with its form, so this is not a discard and is not logged. One the
 * outbox still holds stays: its next push is refused `parent-deleted` and SPEC-FINAL 9.7
 * applies (outbox.ts). Drafts are never touched. Returns how many rows went.
 */
export async function pruneDeletedFormRows(
  deleted: DeletedFormRows,
  delivered: Partial<Record<PullEntityKey, Raw[]>> = {},
): Promise<number> {
  if (FORM_DELETION_ENTITIES.every((key) => (deleted[key] ?? []).length === 0)) return 0;
  const named = (key: (typeof FORM_DELETION_ENTITIES)[number]) => {
    const again = new Set((delivered[key] ?? []).map((row) => String(row.id)));
    return new Set((deleted[key] ?? []).filter((id) => !again.has(id)));
  };
  return db.transaction('rw', db.rows, db.outbox, db.syncState, async () => {
    const forms = named('forms');
    const versions = named('form_versions');
    const fields = named('form_fields');
    const rules = named('scoring_rules');
    const cached = async (entity: PullEntityKey) =>
      db.rows.where('entity').equals(entity).toArray();

    for (const row of await cached('form_versions')) {
      if (forms.has(String(row.form_id))) versions.add(row.id);
    }
    for (const row of await cached('scoring_rules')) {
      if (forms.has(String(row.form_id))) rules.add(row.id);
    }
    for (const row of await cached('form_fields')) {
      if (versions.has(String(row.form_version_id))) fields.add(row.id);
    }
    const held = await heldRowIds();
    const entries = (await cached('scouting_entries'))
      .filter((row) => versions.has(String(row.form_version_id)) && !held.has(row.id))
      .map((row) => row.id);

    const keys: [PullEntityKey, string][] = [
      ...[...forms].map((id): [PullEntityKey, string] => ['forms', id]),
      ...[...versions].map((id): [PullEntityKey, string] => ['form_versions', id]),
      ...[...fields].map((id): [PullEntityKey, string] => ['form_fields', id]),
      ...[...rules].map((id): [PullEntityKey, string] => ['scoring_rules', id]),
      ...entries.map((id): [PullEntityKey, string] => ['scouting_entries', id]),
    ];
    return removeRows(keys);
  });
}

/** The event-scoped pull entities that carry their event's id (PULL_SCOPES, kind `event`). */
const BY_EVENT_ID: readonly PullEntityKey[] = [
  'event_teams',
  'matches',
  'scouting_entries',
  'sync_conflicts',
  'pick_lists',
  'do_not_pick',
  'alliances',
];
/** The event-scoped entities reached through a parent of the event: child → [parent, column]. */
const BY_PARENT: readonly [PullEntityKey, PullEntityKey, string][] = [
  ['match_teams', 'matches', 'match_id'],
  ['pick_list_entries', 'pick_lists', 'pick_list_id'],
  ['alliance_slots', 'alliances', 'alliance_id'],
  ['alliance_declines', 'alliances', 'alliance_id'],
];

/**
 * Spec 7.5 item 3: the cached rows of an event this device has left are evicted, so local
 * storage holds the active competition only (SPEC-FINAL 7.3). Runs after a completed sync.
 * For every event the cache holds rows of, other than those in `keep`: when nothing on the
 * device still needs it, its event-scoped rows go (BY_EVENT_ID, BY_PARENT) and its `events`
 * row. Season-scoped rows (forms, versions, fields, rules, metrics, dashboards, presets) and
 * global rows (teams, users, app_settings, seasons) stay.
 *
 * An event stays WHOLE while anything references it: an outbox operation (an entry of it, a
 * bare match of it; an operation whose event cannot be told holds every event), a row whose
 * sync state is pending or refused, or a draft open on one of its matches. Drafts and the
 * discarded log are never touched. Returns how many rows went.
 */
export async function evictLeftEvents(keep: readonly string[]): Promise<number> {
  return db.transaction(
    'rw',
    [db.rows, db.outbox, db.syncState, db.drafts, db.practiceDrafts],
    async () => {
      const eventOfMatch = new Map<string, string>();
      for (const m of await db.rows.where('entity').equals('matches').toArray()) {
        if (typeof m.event_id === 'string') eventOfMatch.set(m.id, m.event_id);
      }
      const eventOfRow = async (id: string): Promise<string | null> => {
        for (const row of await db.rows.where('id').equals(id).toArray()) {
          if (typeof row.event_id === 'string') return row.event_id;
          if (typeof row.match_id === 'string') return eventOfMatch.get(row.match_id) ?? null;
        }
        return null;
      };

      const candidates = new Set<string>();
      for (const e of await db.rows.where('entity').equals('events').toArray()) {
        candidates.add(e.id);
      }
      for (const entity of BY_EVENT_ID) {
        for (const row of await db.rows.where('entity').equals(entity).toArray()) {
          if (typeof row.event_id === 'string') candidates.add(row.event_id);
        }
      }
      for (const id of keep) candidates.delete(id);
      if (candidates.size === 0) return 0;

      const held = new Set<string>();
      let unknownOp = false;
      for (const op of await db.outbox.toArray()) {
        const named = op.payload.event_id;
        const eventId =
          typeof named === 'string'
            ? named
            : op.entity === 'scouting_entry'
              ? await eventOfRow(op.row_id)
              : null;
        if (eventId === null) {
          // A delete carries no payload; an entry no longer cached has nothing to evict.
          if (op.entity !== 'scouting_entry') unknownOp = true;
          continue;
        }
        held.add(eventId);
      }
      if (unknownOp) return 0;
      for (const state of await db.syncState.toArray()) {
        if (state.sync_state !== 'pending' && state.rejection == null) continue;
        const eventId = await eventOfRow(state.row_id);
        if (eventId !== null) held.add(eventId);
      }
      for (const table of [db.drafts, db.practiceDrafts]) {
        for (const key of await table.toCollection().primaryKeys()) {
          // EntryPage keys a draft `${formVersionId}:${matchId}:${teamId}`; uuids hold no colon.
          const eventId = eventOfMatch.get(String(key).split(':')[1] ?? '');
          if (eventId) held.add(eventId);
        }
      }

      const evict = [...candidates].filter((id) => !held.has(id));
      if (evict.length === 0) return 0;
      const gone = new Set(evict);
      const parents = new Map<PullEntityKey, Set<string>>();
      let count = 0;
      for (const entity of BY_EVENT_ID) {
        const rows = (await db.rows.where('entity').equals(entity).toArray()).filter((row) =>
          gone.has(String(row.event_id)),
        );
        parents.set(entity, new Set(rows.map((row) => row.id)));
        count += await removeRows(rows.map((row): [PullEntityKey, string] => [entity, row.id]));
      }
      for (const [child, parent, column] of BY_PARENT) {
        const ids = parents.get(parent) ?? new Set<string>();
        const rows = (await db.rows.where('entity').equals(child).toArray()).filter((row) =>
          ids.has(String(row[column])),
        );
        count += await removeRows(rows.map((row): [PullEntityKey, string] => [child, row.id]));
      }
      count += await removeRows(evict.map((id): [PullEntityKey, string] => ['events', id]));
      return count;
    },
  );
}

async function wipeEvent(eventId: string): Promise<SyncOutcome> {
  await db.rows.where('event_id').equals(eventId).delete();
  await setMeta(WATERMARK, null);
  await setMeta(HYDRATED, null);
  notifyChanged('rows');
  return { status: 'event-gone' };
}

export type HydrationState = 'fresh' | 'cached' | 'blocked';

/**
 * SPEC-FINAL 9.3: the three hydration outcomes, exactly.
 *
 * `cached` requires a COMPLETED first pull for this event, not merely some rows. A
 * first pull that reached page 1 of 3 and then lost the network leaves the device with
 * a partial form definition, and rendering an entry form from that would be worse than
 * refusing — which is why the test is the HYDRATED watermark, not `rows.count() > 0`.
 */
export async function hydrate(deps: SyncDeps): Promise<HydrationState> {
  const outcome = await syncNow(deps);
  if (outcome.status === 'ok') return 'fresh';
  return cachedHydration(deps.eventId);
}

/**
 * The hydration state without contacting the server — for a session that holds no token
 * (expired, or an offline sign-in in task 1.16), where a pull could only answer 401.
 */
export async function cachedHydration(eventId: string): Promise<'cached' | 'blocked'> {
  return (await lastHydratedEventId()) === eventId ? 'cached' : 'blocked';
}

/** The event whose pull last completed on this device, or null when none has. */
export async function lastHydratedEventId(): Promise<string | null> {
  return getMeta<string | null>(HYDRATED, null);
}

/**
 * Which event the device should be working on, as the server sees it (task 1.17b).
 *
 * `no-event` is the server's own answer: no competition is set up (the `app_settings`
 * singleton's `active_event_id` is null, or names an event that no longer exists).
 * `unreachable` is every other outcome — no connection, a deadline, a portal's page, an
 * error — where the device learned nothing and must not claim there is no competition.
 */
export type ActiveEvent =
  { status: 'event'; eventId: string } | { status: 'no-event' } | { status: 'unreachable' };

/**
 * A dying venue connection hangs rather than fails. The shell waits on this call before it
 * can show anything but its header, so it is abandoned (and read as no answer) after this.
 */
export const ACTIVE_CONTEXT_TIMEOUT_MS = 10_000;

/**
 * The chicken-and-egg breaker: the pull that carries `app_settings` needs an event id, so
 * a device that holds none asks `getActiveContext` first.
 */
export async function activeEvent(): Promise<ActiveEvent> {
  try {
    const context = await call('getActiveContext', {}, { timeoutMs: ACTIVE_CONTEXT_TIMEOUT_MS });
    return context.active_event_id
      ? { status: 'event', eventId: context.active_event_id }
      : { status: 'no-event' };
  } catch {
    return { status: 'unreachable' };
  }
}

/** The active event the last completed pull cached, or null on a device that has none. */
export async function cachedActiveEventId(): Promise<string | null> {
  const rows = await cachedRows<{ active_event_id?: string | null }>('app_settings');
  return rows[0]?.active_event_id ?? null;
}

/**
 * The admin default as the last pull cached it (task 1.22) — `undefined` when the device
 * holds no `app_settings` row at all, which is not the admin setting no event (`null`).
 * The shell compares this after every sync to notice a changed default.
 */
export async function cachedDefaultEventId(): Promise<string | null | undefined> {
  const rows = await cachedRows<{ active_event_id?: string | null }>('app_settings');
  if (rows.length === 0) return undefined;
  return rows[0]?.active_event_id ?? null;
}
