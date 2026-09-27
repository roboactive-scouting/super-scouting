import { MAX_OPERATIONS_PER_PUSH, PULL_ENTITY_KEYS, type PullEntityKey } from '@frc/shared';
import { session } from '@/auth/session';
import { cachedRows } from './cache';
import { db, getMeta, setMeta } from './db';
import { ackResults, pending } from './outbox';
import { call } from './rpc';
import type { Api } from './api';

export type SyncDeps = {
  api: Api;
  eventId: string;
  deviceId: string;
  /** Guard against an endless cursor loop; the real cap is the server's page size. */
  maxPages?: number;
};

export type SyncOutcome =
  | { status: 'ok'; pushed: number; pulled: number }
  | { status: 'offline'; reason: string }
  /** The server refused the token (401). The session is already expired; nothing was lost. */
  | { status: 'unauthenticated' }
  | { status: 'event-gone' };

const WATERMARK = 'sync.watermark';
const HYDRATED = 'sync.hydrated_event_id';

function isEventGone(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'not-found';
}

function isUnauthenticated(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { status?: number }).status === 401;
}

/**
 * Ops acked by an earlier batch of this same sync stay acked (ackResults commits each
 * batch); everything unacked stays queued. A 401 simply stops the sync.
 */
function failure(e: unknown, fallback: string): SyncOutcome {
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
    for (;;) {
      const batch = await pending(MAX_OPERATIONS_PER_PUSH, sent);
      if (batch.length === 0) break;
      for (const op of batch) sent.add(op.op_id);
      const response = await deps.api.push({ device_id: deps.deviceId, operations: batch });
      await ackResults(response.results);
      pushed += response.results.length;
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
    const hydratedFor = await getMeta<string | null>(HYDRATED, null);
    const since =
      hydratedFor === deps.eventId ? await getMeta<string | null>(WATERMARK, null) : null;
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
      pulled += await upsertEntities(response.entities);
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

    if (complete && bestWatermark !== null) {
      await setMeta(WATERMARK, bestWatermark);
      await setMeta(HYDRATED, deps.eventId);
      await setMeta('sync.last_success_at', new Date().toISOString());
    }
    // SPEC-FINAL 7.5: the database is authoritative for role, on the client too.
    await session.refreshFromCache();
  } catch (e) {
    if (isEventGone(e)) return wipeEvent(deps.eventId);
    return failure(e, 'pull failed');
  }

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

async function wipeEvent(eventId: string): Promise<SyncOutcome> {
  await db.rows.where('event_id').equals(eventId).delete();
  await setMeta(WATERMARK, null);
  await setMeta(HYDRATED, null);
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
