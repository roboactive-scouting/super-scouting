import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RankRow } from '@frc/shared';
import { notifyChanged } from '@/data/changes';
import { db, setMeta } from '@/data/db';
import type { Rpc } from '@/data/rpc';
import { HOME_EVENT, rankingRows } from '@/test/homeRanking';
import { EVENT_ID, TEAM_ROWS } from '@/test/teamPageFixtures';
import { useRanking, useRankingBefore, type Ranking } from './useRanking';

/*
 * `useRanking`'s refresh rules (review of PR #42, Minors 1–3 and 9): a server answer is stamped
 * when it was ASKED, so a sync that ends after the ask (answered, under way or failed) asks again;
 * a failed read is retried after a later sync; back online, an answer held from before is not
 * shown again until it is re-asked (the device's table stands in meanwhile); and the device's
 * table of another event is never returned as this one's. `useRankingBefore` follows `now`.
 */

vi.mock('@/config', () => ({
  clientConfig: () => ({
    apiBaseUrl: 'https://api.test',
    deviceWipeCode: 'w',
    appVersion: '1.4.0',
  }),
}));

const online = vi.spyOn(navigator, 'onLine', 'get');

/** Answer A: 2096 third. Answer B: 2096 fifth. */
const A = rankingRows({ usRank: 3 });
const B = rankingRows({ usRank: 5 });
const rankOf2096 = (rows: RankRow[]) => rows.find((r) => r.number === 2096)?.rank;

type Pending = {
  input: unknown;
  resolve: (rows: RankRow[]) => void;
  reject: (e: Error) => void;
};

/** `rankTeams` whose every call waits until the test settles it (`calls[i]`). */
function heldRpc() {
  const calls: Pending[] = [];
  const rpc = {
    call: vi.fn(
      (_name: string, input?: unknown) =>
        new Promise((resolve, reject) => {
          calls.push({
            input,
            resolve: (rows) => resolve({ event: { id: HOME_EVENT, name: 'District #3' }, rows }),
            reject,
          });
        }),
    ),
  } satisfies Rpc;
  return { rpc, calls };
}

/** A sync that ends now (the meta write and its notice, as `sync.ts` does). */
async function syncEnds() {
  // A clock tick past the last ask, so the sync really ends after it.
  await new Promise((r) => setTimeout(r, 5));
  await act(async () => {
    await setMeta('sync.last_success_at', new Date().toISOString());
    notifyChanged('meta');
  });
}

async function setOnline(value: boolean) {
  online.mockReturnValue(value);
  await act(async () => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
}

const ready = (r: Ranking) => (r.status === 'ready' ? r : null);

beforeEach(async () => {
  await db.delete();
  await db.open();
  online.mockReturnValue(true);
});

describe('useRanking — refresh after a sync (review Minors 1–3)', () => {
  it('a sync that lands after an answer asks again and shows the new rows', async () => {
    const { rpc, calls } = heldRpc();
    const { result } = renderHook(() => useRanking(EVENT_ID, rpc));
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => calls[0]!.resolve(A));
    await waitFor(() => expect(ready(result.current)?.source.kind).toBe('server'));
    expect(rankOf2096(ready(result.current)!.rows)).toBe(3);
    const firstAsOf = (ready(result.current)!.source as { asOf: string }).asOf;

    await syncEnds();
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => calls[1]!.resolve(B));
    await waitFor(() => expect(rankOf2096(ready(result.current)!.rows)).toBe(5));
    const source = ready(result.current)!.source;
    expect(source.kind).toBe('server');
    expect((source as { asOf: string }).asOf > firstAsOf).toBe(true);
  });

  it('stamps the answer with the time it was asked: a sync ending while the read is under way makes it stale', async () => {
    const { rpc, calls } = heldRpc();
    const { result } = renderHook(() => useRanking(EVENT_ID, rpc));
    await waitFor(() => expect(calls).toHaveLength(1));
    const before = new Date().toISOString();
    // The server read may predate this sync's push: the answer to come cannot count as fresh.
    await syncEnds();
    await waitFor(() => expect(calls).toHaveLength(2));
    // The overtaken read answers (without the pushed entries): it is never shown.
    await act(async () => calls[0]!.resolve(A));
    expect(ready(result.current)?.source.kind).not.toBe('server');
    await act(async () => calls[1]!.resolve(B));
    await waitFor(() => expect(ready(result.current)?.source.kind).toBe('server'));
    expect(rankOf2096(ready(result.current)!.rows)).toBe(5);
    // "as of" is when the read was asked: after the sync, never earlier than the first ask.
    expect((ready(result.current)!.source as { asOf: string }).asOf > before).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('a failed read is retried after a later sync, while the device’s table stands in', async () => {
    await db.rows.bulkPut(TEAM_ROWS);
    const { rpc, calls } = heldRpc();
    const { result } = renderHook(() => useRanking(EVENT_ID, rpc));
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => calls[0]!.reject(new Error('venue Wi-Fi')));
    await waitFor(() => expect(ready(result.current)?.source.kind).toBe('device'));
    // Nothing asks again on its own…
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(1);
    // …until a sync succeeds: the server is reachable again.
    await syncEnds();
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => calls[1]!.resolve(A));
    await waitFor(() => expect(ready(result.current)?.source.kind).toBe('server'));
    expect(rankOf2096(ready(result.current)!.rows)).toBe(3);
  });

  it('offline → online: the held answer is not shown again; the device’s table stands in until the re-ask lands', async () => {
    await db.rows.bulkPut(TEAM_ROWS);
    const { rpc, calls } = heldRpc();
    const { result } = renderHook(() => useRanking(EVENT_ID, rpc));
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => calls[0]!.resolve(A));
    await waitFor(() => expect(ready(result.current)?.source.kind).toBe('server'));

    await setOnline(false);
    await waitFor(() => expect(ready(result.current)?.source.kind).toBe('device'));
    expect(calls).toHaveLength(1);

    await setOnline(true);
    await waitFor(() => expect(calls).toHaveLength(2));
    // The answer from before the outage is not back: the device's table, which may hold entries
    // recorded offline, shows until the server answers again.
    expect(ready(result.current)?.source.kind).toBe('device');
    await act(async () => calls[1]!.resolve(B));
    await waitFor(() => expect(ready(result.current)?.source.kind).toBe('server'));
    expect(rankOf2096(ready(result.current)!.rows)).toBe(5);
  });
});

describe('useRanking — the device table belongs to the requested event (review Minor 9)', () => {
  it('never returns the previous event’s table after the event changes, not even for one render', async () => {
    online.mockReturnValue(false);
    await db.rows.bulkPut(TEAM_ROWS);
    const seen: { asked: string; result: Ranking }[] = [];
    const rpc = heldRpc().rpc;
    const { rerender } = renderHook(
      ({ id }: { id: string }) => {
        const result = useRanking(id, rpc);
        seen.push({ asked: id, result });
        return result;
      },
      { initialProps: { id: EVENT_ID } },
    );
    await waitFor(() => expect(ready(seen.at(-1)!.result)?.event.id).toBe(EVENT_ID));
    rerender({ id: 'ev-other' });
    await waitFor(() => expect(seen.at(-1)!.result.status).toBe('unknown'));
    const wrong = seen.filter(
      ({ asked, result }) => asked === 'ev-other' && ready(result)?.event.id === EVENT_ID,
    );
    expect(wrong).toEqual([]);
  });
});

describe('useRankingBefore follows now’s reads (review Minor 2)', () => {
  it('is asked again with now after a sync, so the two never stand on different reads', async () => {
    const { rpc, calls } = heldRpc();
    const { result } = renderHook(() => {
      const now = useRanking(EVENT_ID, rpc);
      return { now, before: useRankingBefore(now, 36, rpc) };
    });
    const answer = async (rows: RankRow[], beforeRows: RankRow[]) => {
      const n = calls.length;
      await waitFor(() => expect(calls.length).toBe(n + 1));
      await act(async () => calls.at(-1)!.resolve(rows));
      await waitFor(() => expect(calls.length).toBe(n + 2));
      expect(calls.at(-1)!.input).toEqual({ event_id: HOME_EVENT, before_match_number: 36 });
      await act(async () => calls.at(-1)!.resolve(beforeRows));
    };
    await answer(A, B);
    await waitFor(() => expect(result.current.before).not.toBeNull());
    expect(rankOf2096(result.current.before!)).toBe(5);

    await syncEnds();
    await answer(B, A);
    await waitFor(() => expect(rankOf2096(result.current.before ?? [])).toBe(3));
    expect(rankOf2096(ready(result.current.now)!.rows)).toBe(5);
    expect(calls.map((c) => c.input)).toEqual([
      { event_id: HOME_EVENT },
      { event_id: HOME_EVENT, before_match_number: 36 },
      { event_id: HOME_EVENT },
      { event_id: HOME_EVENT, before_match_number: 36 },
    ]);
  });
});
