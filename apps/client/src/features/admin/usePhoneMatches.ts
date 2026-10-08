import { useCallback, useEffect, useRef, useState } from 'react';
import type { EventRow, MatchRow, RosterRow } from '@frc/shared';
import type { Rpc } from '@/data/rpc';
import { panelErrorLine, unreachable } from './adminMessages';
import { loadAllMatches } from './matchOps';
import { useMatchSaves } from './useMatchSaves';

export type PhoneLoad =
  | { status: 'loading' }
  | { status: 'no-event' }
  | { status: 'ready'; eventId: string; eventName: string }
  | { status: 'unreachable' }
  | { status: 'failed'; line: string };

/**
 * What the phone matches view works on (README "Phone"): the default event — the one every
 * device opens to — with its roster and matches, fetched once per visit. Phones have no
 * event picker; that is computer work.
 */
export function usePhoneMatches(rpc: Rpc, enabled: boolean) {
  const [load, setLoad] = useState<PhoneLoad>({ status: 'loading' });
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  /** The line-up saves' queues and marks ("Not saved", being sent): one set per page. */
  const saves = useMatchSaves(load.status === 'ready' ? load.eventId : null, matches);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // Loaded once per visit: a blink of the connection never re-reads over what was typed.
  const loaded = useRef(false);
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;

  useEffect(() => {
    if (!enabled || loaded.current) return;
    let live = true;
    const rpc = rpcRef.current;
    setLoad({ status: 'loading' });
    (async () => {
      const context = (await rpc.call('getActiveContext', {})) as {
        active_season_id: string | null;
        active_event_id: string | null;
      };
      const eventId = context.active_event_id;
      if (!eventId || !context.active_season_id) return { status: 'no-event' } as const;
      const [eventsOut, rosterOut, rows] = await Promise.all([
        rpc.call('listEvents', { season_id: context.active_season_id }) as Promise<{
          items?: EventRow[];
        }>,
        rpc.call('listEventRoster', { event_id: eventId }) as Promise<{ items?: RosterRow[] }>,
        loadAllMatches(rpc, eventId),
      ]);
      if (live) {
        setRoster(rosterOut?.items ?? []);
        setMatches(rows);
      }
      const name = eventsOut?.items?.find((e) => e.id === eventId)?.name ?? '';
      return { status: 'ready', eventId, eventName: name } as const;
    })().then(
      (next) => {
        if (!live) return;
        loaded.current = next.status === 'ready';
        setLoad(next);
      },
      (e: unknown) => {
        if (!live) return;
        setLoad(
          unreachable(e)
            ? { status: 'unreachable' }
            : { status: 'failed', line: panelErrorLine(e) },
        );
      },
    );
    return () => {
      live = false;
    };
  }, [enabled, attempt]);

  return { load, roster, setRoster, matches, setMatches, saves, retry };
}
