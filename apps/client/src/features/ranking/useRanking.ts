import { useEffect, useState } from 'react';
import type { RankRow, RankTeamsOutput } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { typedCall, type Rpc } from '@/data/rpc';
import { useSyncStatus } from '@/data/syncStatus';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { useSessionOverride } from '@/features/context/sessionOverride';
import { useCapability } from '@/lib/useCapability';
import { useOnline } from '@/lib/useOnline';

/*
 * The ranking's one data source (SPEC-FINAL 13.5, 9.6; task 1.58), for the ranking page and for
 * Home's rank card and top teams (task 1.58b), so the two can never disagree:
 *
 * - Online: the server's `rankTeams` (every roster team, the canonical order), "From the server ·
 *   as of 11:40". Until it answers, and whenever it fails, the device's own table shows. A sync
 *   that lands after the answer asks again.
 * - Offline (the normal mode at a venue): the very same `buildRankTable`, run on this device's
 *   entries (`deviceRanking.ts`), "Computed from the data on this device · Last synced 11:08 ·
 *   3 waiting to send".
 * - Under a session override (6.3) the device does not hold the event: the server only, held
 *   offline through `cross_event_view` (9.6), as the team page does.
 *
 * The rows come in the canonical order (Total, best first); a page re-sorts them itself.
 */

/** Where the rows came from. `asOf` and `lastSyncAt` are ISO instants. */
export type RankingSource =
  { kind: 'server'; asOf: string } | { kind: 'device'; lastSyncAt: string | null; waiting: number };

export type Ranking =
  | { status: 'loading' }
  /** The device does not hold the event, and no server answer stands in for it. */
  | { status: 'unknown' }
  /** A session override while offline: that event's ranking needs the server. */
  | { status: 'offline-needs-server' }
  /** A session override whose server read failed. */
  | { status: 'failed'; retry: () => void }
  | {
      status: 'ready';
      event: { id: string; name: string };
      rows: RankRow[];
      source: RankingSource;
    };

type Answer = { event: { id: string; name: string }; rows: RankRow[]; at: string };
type Remote =
  | { key: string; status: 'loading'; last: Answer | null }
  | { key: string; status: 'ok'; last: Answer }
  | { key: string; status: 'failed'; last: Answer | null };

/** The device's table, from a chunk of its own (the engine stays out of the initial JS). */
const loadDevice = (eventId: string) =>
  import('./deviceRanking').then((m) => m.loadDeviceRanking(eventId));

/**
 * The ranking of `eventId` (the shell's active event), or of a session override's event when one
 * is set. `rpc` is injectable for tests.
 */
export function useRanking(eventId: string, rpc: Rpc = { call: typedCall }): Ranking {
  const override = useSessionOverride();
  const target = override?.eventId ?? eventId;
  const online = useOnline();
  const crossEvent = useCapability('cross_event_view');
  const askServer = override ? crossEvent : online;
  const sync = useSyncStatus();

  const device = useDeviceQuery(
    () => (override ? Promise.resolve(null) : loadDevice(eventId)),
    [eventId, override?.eventId ?? null],
    ['rows'],
  );

  const [retry, setRetry] = useState(0);
  const key = `${target}|${retry}`;
  const [remote, setRemote] = useState<Remote | null>(null);
  const mine = remote?.key === key ? remote : null;
  const answer = mine?.last ?? null;
  // The answer predates the last sync (new entries reached the server): ask again.
  const stale = answer !== null && sync.lastSyncAt !== null && sync.lastSyncAt > answer.at;
  useEffect(() => {
    if (!askServer) return;
    if (mine?.status === 'ok' && !stale) return;
    let on = true;
    const last = mine?.last ?? null;
    setRemote({ key, status: 'loading', last });
    rpc.call('rankTeams', { event_id: target }).then(
      (out) => {
        if (!on) return;
        const { event, rows } = out as RankTeamsOutput;
        setRemote({ key, status: 'ok', last: { event, rows, at: new Date().toISOString() } });
      },
      () => on && setRemote({ key, status: 'failed', last }),
    );
    return () => {
      // A read cut short (offline, another event) is asked again when this runs next.
      if (on)
        setRemote((r) =>
          r?.key === key && r.status === 'loading' ? { ...r, status: 'failed' } : r,
        );
      on = false;
    };
    // `mine` is read for its status only; rpc is an injected dependency held stable by the caller.
  }, [key, askServer, stale]);

  const fromServer = (a: Answer): Ranking => ({
    status: 'ready',
    event: a.event,
    rows: a.rows,
    source: { kind: 'server', asOf: a.at },
  });

  if (override) {
    if (!crossEvent) return { status: 'offline-needs-server' };
    if (answer) return fromServer(answer);
    if (mine?.status === 'failed') {
      return { status: 'failed', retry: () => setRetry((n) => n + 1) };
    }
    return { status: 'loading' };
  }
  if (answer && online) return fromServer(answer);
  if (device) {
    return {
      status: 'ready',
      event: device.event,
      rows: device.rows,
      source: { kind: 'device', lastSyncAt: sync.lastSyncAt, waiting: sync.waiting },
    };
  }
  if (answer) return fromServer(answer);
  if (device === undefined) return { status: 'loading' };
  if (online && mine?.status !== 'failed') return { status: 'loading' };
  return { status: 'unknown' };
}

/**
 * The qualification matches the device holds for `eventId`, as "Q1–Q40" (the page's sub-line);
 * null when it holds none, undefined while it reads.
 */
export function useQualRange(eventId: string): string | null | undefined {
  return useDeviceQuery(
    async () => {
      const numbers = (await cachedRows<Record<string, unknown>>('matches'))
        .filter(
          (m) =>
            m.event_id === eventId &&
            m.match_type === 'qualification' &&
            m.deleted_at == null &&
            typeof m.number === 'number',
        )
        .map((m) => m.number as number);
      if (numbers.length === 0) return null;
      return `Q${Math.min(...numbers)}–Q${Math.max(...numbers)}`;
    },
    [eventId],
    ['rows'],
  );
}
