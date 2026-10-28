import { useEffect, useRef, useState } from 'react';
import { rankTeamsOutput, type RankRow } from '@frc/shared';
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
 *   that ends after the read was asked (answered, under way or failed) asks again.
 * - Offline (the normal mode at a venue): the very same `buildRankTable`, run on this device's
 *   entries (`deviceRanking.ts`), "Computed from the data on this device · Last synced 11:08 ·
 *   3 waiting to send". Back online, an answer held from before is not shown again: the device's
 *   table stands in until the server is asked again and answers.
 * - Under a session override (6.3) the device does not hold the event: the server only, held
 *   offline through `cross_event_view` (9.6), as the team page does.
 *
 * The rows come in the canonical order (Total, best first); a page re-sorts them itself.
 */

/**
 * Where the rows came from. `asOf` (when the server was asked, never when it answered) and
 * `lastSyncAt` are ISO instants.
 */
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

/**
 * A server answer. `at` is when it was ASKED (the server read its entries after that), so any sync
 * that ends after the request started marks it stale, and the "as of" shown never claims more
 * than the answer holds. `lapsed`: the device went offline since, so it is not shown as current
 * again until it is re-asked (the device's table, which may hold entries recorded offline, stands
 * in meanwhile).
 */
type Answer = { event: { id: string; name: string }; rows: RankRow[]; at: string; lapsed: boolean };
/**
 * The server side for one `key`: the read under way or done (`id`, asked at `askedAt`) and the
 * last answer held. `lapsed`: asked again when the device is back online.
 */
type Remote = {
  key: string;
  id: number;
  askedAt: string;
  status: 'loading' | 'ok' | 'failed';
  last: Answer | null;
  lapsed: boolean;
};

/** The device's table, from a chunk of its own (the engine stays out of the initial JS). */
const loadDevice = (eventId: string, beforeMatch?: number) =>
  import('./deviceRanking').then((m) => m.loadDeviceRanking(eventId, beforeMatch));

/**
 * The ranking of `eventId` (the shell's active event), or of a session override's event when one
 * is set. `rpc` is injectable for tests.
 */
export function useRanking(eventId: string | null, rpc: Rpc = { call: typedCall }): Ranking {
  const override = useSessionOverride();
  const target = override?.eventId ?? eventId;
  const online = useOnline();
  const crossEvent = useCapability('cross_event_view');
  // No event yet (Home before the shell has one, task 1.58b): nothing is read, from either side.
  const askServer = target !== null && (override ? crossEvent : online);
  const sync = useSyncStatus();

  const loaded = useDeviceQuery(
    () => (override || eventId === null ? Promise.resolve(null) : loadDevice(eventId)),
    [eventId, override?.eventId ?? null],
    ['rows'],
  );
  // `useDeviceQuery` resets only in its effect: the first render after the event changes still
  // holds the previous event's table, which is never shown as this one's.
  const device = loaded && loaded.event.id !== eventId ? undefined : loaded;

  const [retry, setRetry] = useState(0);
  const key = `${target}|${retry}`;
  const [remote, setRemote] = useState<Remote | null>(null);
  const asks = useRef(0);
  const mine = remote?.key === key ? remote : null;
  const answer = mine?.last ?? null;
  // A sync ended after the last read was asked (new entries may have reached the server): the
  // answer, a read still under way or a failed read is asked again.
  const stale = mine !== null && sync.lastSyncAt !== null && sync.lastSyncAt > mine.askedAt;
  useEffect(() => {
    if (!askServer || target === null) {
      // Offline: what is held has lapsed; it is asked again when the device is back online.
      setRemote((r) =>
        r && !r.lapsed ? { ...r, lapsed: true, last: r.last && { ...r.last, lapsed: true } } : r,
      );
      return;
    }
    // Held, under way, or failed since the last sync: nothing new to ask.
    if (mine && !stale && !mine.lapsed) return;
    const id = ++asks.current;
    const askedAt = new Date().toISOString();
    setRemote({ key, id, askedAt, status: 'loading', last: mine?.last ?? null, lapsed: false });
    // Only this read's own answer is kept: one overtaken by a newer read, or by another event, is
    // dropped.
    const settle = (next: (r: Remote) => Remote) =>
      setRemote((r) => (r?.key === key && r.id === id ? next(r) : r));
    // Through a promise and the wire schema, so a call that throws or answers something else is a
    // failed read, never a crash of the page holding the hook (Home, task 1.58b).
    Promise.resolve()
      .then(() => rpc.call('rankTeams', { event_id: target }))
      .then((out) => rankTeamsOutput.parse(out))
      .then(
        ({ event, rows }) =>
          settle((r) => ({
            ...r,
            status: 'ok',
            last: { event, rows, at: askedAt, lapsed: r.lapsed },
          })),
        () => settle((r) => ({ ...r, status: 'failed' })),
      );
    // `mine` is read for its state only; rpc is an injected dependency held stable by the caller.
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
  if (answer && !answer.lapsed && online) return fromServer(answer);
  if (device) {
    return {
      status: 'ready',
      event: device.event,
      rows: device.rows,
      source: { kind: 'device', lastSyncAt: sync.lastSyncAt, waiting: sync.waiting },
    };
  }
  // The device does not hold the event: the last answer stands in, with its own "as of".
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

/**
 * The ranking as it stood before qualification match `beforeMatch` (task 1.58b, Home's "places
 * moved since our last match"), read from the SAME source as `now` — never a server "now" against
 * a device "before":
 *
 * - `now` from the server: `rankTeams` with `before_match_number`, asked again whenever `now`
 *   is (its `asOf` moves: a sync after the ask, a failed read retried after a sync, the return
 *   online), so the two never stand on different reads; nothing from the device. While `now`'s
 *   answer has lapsed offline, `now` is the device's and so is this;
 * - `now` from the device: the very same `buildRankTable` on this device's entries with
 *   `before_match_number`, and no server call.
 *
 * `beforeMatch` comes from `now`'s own rows (a row's `last_counted_match`). Null while
 * `now` is not ready, while `beforeMatch` is null, while the read is under way, and when it
 * fails (the caller then leaves the move out). `rpc` is injectable for tests.
 */
export function useRankingBefore(
  now: Ranking,
  beforeMatch: number | null,
  rpc: Rpc = { call: typedCall },
): RankRow[] | null {
  const ready = now.status === 'ready' && beforeMatch !== null ? now : null;
  const kind = ready?.source.kind ?? null;
  const eventId = ready?.event.id ?? null;
  const asOf = ready?.source.kind === 'server' ? ready.source.asOf : null;

  const device = useDeviceQuery(
    () =>
      kind === 'device' && eventId !== null && beforeMatch !== null
        ? loadDevice(eventId, beforeMatch).then((held) =>
            held ? { eventId, beforeMatch, rows: held.rows } : null,
          )
        : Promise.resolve(null),
    [kind, eventId, beforeMatch],
    ['rows'],
  );

  const key = kind === 'server' ? `${eventId}|${beforeMatch}|${asOf}` : null;
  const [remote, setRemote] = useState<{ key: string; rows: RankRow[] | null } | null>(null);
  useEffect(() => {
    if (key === null || eventId === null || beforeMatch === null) return;
    let on = true;
    Promise.resolve()
      .then(() => rpc.call('rankTeams', { event_id: eventId, before_match_number: beforeMatch }))
      .then((out) => rankTeamsOutput.parse(out))
      .then(
        (out) => on && setRemote({ key, rows: out.rows }),
        () => on && setRemote({ key, rows: null }),
      );
    return () => {
      on = false;
    };
    // rpc is an injected dependency held stable by the caller; `key` names every input.
  }, [key]);

  if (kind === 'server') return remote?.key === key ? remote.rows : null;
  if (
    kind === 'device' &&
    device &&
    device.eventId === eventId &&
    device.beforeMatch === beforeMatch
  ) {
    return device.rows;
  }
  return null;
}
