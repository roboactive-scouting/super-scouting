import { MAX_OPERATIONS_PER_PUSH, PULL_ENTITY_KEYS, type PullEntityKey } from '@frc/shared';
import { db, getMeta, setMeta } from './db';
import { ackResults, pending } from './outbox';
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
  | { status: 'event-gone' };

const WATERMARK = 'sync.watermark';
const HYDRATED = 'sync.hydrated_event_id';

function isEventGone(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'not-found';
}

/** SPEC-FINAL 9.3, 9.4: push first so nothing local is overwritten by a stale pull. */
export async function syncNow(deps: SyncDeps): Promise<SyncOutcome> {
  let pushed = 0;
  try {
    for (;;) {
      const batch = await pending(MAX_OPERATIONS_PER_PUSH);
      if (batch.length === 0) break;
      const response = await deps.api.push({ device_id: deps.deviceId, operations: batch });
      await ackResults(response.results);
      pushed += response.results.length;
      const stillPending = await pending(MAX_OPERATIONS_PER_PUSH);
      if (stillPending.length === batch.length) break; // nothing was acked; stop retrying
    }
  } catch (e) {
    if (isEventGone(e)) return wipeEvent(deps.eventId);
    return { status: 'offline', reason: e instanceof Error ? e.message : 'push failed' };
  }

  let pulled = 0;
  try {
    const since = await getMeta<string | null>(WATERMARK, null);
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
  } catch (e) {
    if (isEventGone(e)) return wipeEvent(deps.eventId);
    return { status: 'offline', reason: e instanceof Error ? e.message : 'pull failed' };
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
  const hydratedEventId = await getMeta<string | null>(HYDRATED, null);
  return hydratedEventId === deps.eventId ? 'cached' : 'blocked';
}
