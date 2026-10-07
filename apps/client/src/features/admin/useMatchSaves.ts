import { useCallback, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { MatchRow } from '@frc/shared';
import { toggled } from './matchOps';

export type IdSet = ReadonlySet<string>;
type SetIds = (update: (prev: IdSet) => IdSet) => void;

const NONE: IdSet = new Set();

/**
 * The page's side of the line-up saves (RB.17 fix 3): one per page, not per Matches panel,
 * so a save outlives a tab change and every save of a match goes through one queue.
 */
export type MatchSaves = {
  /** The page's matches as of the latest change (a publish sets it before React renders). */
  latest: MutableRefObject<MatchRow[]>;
  /** The event the page shows now: an answer for any other event is dropped. */
  eventNow: MutableRefObject<string | null>;
  /**
   * Queues `send` behind the match's earlier saves (one request at a time per match) and
   * marks the match busy until its queue is empty.
   */
  enqueue: (matchId: string, send: (matchId: string) => Promise<void>) => Promise<void>;
  /** No newer save of this match is queued: an answer may replace what is shown. */
  isLast: (matchId: string) => boolean;
  /** Matches with a save queued or out. */
  busy: IdSet;
  /** Matches whose last save could not reach the server ("Not saved"). */
  unsaved: IdSet;
  setUnsaved: SetIds;
  /** This event's matches that are not saved or still being sent: what leaving drops. */
  held: IdSet;
};

/** Ids of `set` that name one of `matches` (a late answer about another event never counts). */
const within = (matches: readonly MatchRow[], set: IdSet) =>
  new Set(matches.filter((m) => set.has(m.id)).map((m) => m.id));

export function useMatchSaves(eventId: string | null, matches: MatchRow[]): MatchSaves {
  const latest = useRef(matches);
  latest.current = matches;
  const eventNow = useRef(eventId);
  eventNow.current = eventId;
  const [queues] = useState(() => new Map<string, Promise<void>>());
  const [pending] = useState(() => new Map<string, number>());
  const [busyIds, setBusy] = useState<IdSet>(NONE);
  const [unsavedIds, setUnsaved] = useState<IdSet>(NONE);

  const enqueue = useCallback(
    (matchId: string, send: (matchId: string) => Promise<void>) => {
      pending.set(matchId, (pending.get(matchId) ?? 0) + 1);
      setBusy((prev) => toggled(prev, matchId, true));
      // An earlier save's failure is its own caller's to handle: it must not skip this one.
      const go = () => send(matchId);
      const run = (queues.get(matchId) ?? Promise.resolve()).then(go, go).finally(() => {
        const left = (pending.get(matchId) ?? 1) - 1;
        pending.set(matchId, left);
        if (left === 0) setBusy((prev) => toggled(prev, matchId, false));
      });
      queues.set(matchId, run);
      return run;
    },
    [queues, pending],
  );
  const isLast = useCallback((matchId: string) => (pending.get(matchId) ?? 0) <= 1, [pending]);

  return useMemo(() => {
    const unsaved = within(matches, unsavedIds);
    const held = within(matches, new Set([...unsavedIds, ...busyIds]));
    return {
      latest,
      eventNow,
      enqueue,
      isLast,
      busy: busyIds,
      unsaved,
      setUnsaved,
      held,
    };
  }, [matches, busyIds, unsavedIds, enqueue, isLast]);
}
