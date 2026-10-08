import { useCallback, useState } from 'react';
import type { Alliance, MatchRow, MatchSlot, MatchType, RosterRow } from '@frc/shared';
import type { Rpc } from '@/data/rpc';
import { panelErrorLine, unreachable } from './adminMessages';
import {
  bulkResultLine,
  checkCreateField as check,
  loadAllMatches,
  sortMatches,
  toggled,
  withSlot,
  type Station,
} from './matchOps';
import type { MatchSaves } from './useMatchSaves';

export type MatchEditingProps = {
  rpc: Rpc;
  eventId: string;
  roster: RosterRow[];
  matches: MatchRow[];
  onMatchesChange: (matches: MatchRow[]) => void;
  onRosterChange: (roster: RosterRow[]) => void;
  /** The page's queues, busy and "Not saved" marks: they outlive a tab change. */
  saves: MatchSaves;
};

type Patch = { match_type?: MatchType; number?: number };
type CreateOut = { created?: number; items?: MatchRow[] } | undefined;

/**
 * Every server call of the Matches tab and the phone matches view (SPEC-FINAL 6.4). The
 * page owns the lists; each change is applied in place and reported through the callbacks.
 *
 * A line-up save is applied at once and sent in order, one request at a time per match,
 * each carrying the match's whole slot set as it stands when it is sent — so typing on
 * into the next cell never sends a stale set (task 1.21 branch review, finding 3).
 *
 * Admin calls are online-only: a save the server could not be reached for keeps what was
 * typed and marks that match "Not saved" (`unsaved`) until the person presses Try again
 * (`retryUnsaved`) — nothing is re-sent by itself. A save the server refused re-reads that
 * match and shows the server's sentence.
 *
 * The queues and marks are the page's (`saves`, RB.17 fix 3), and every answer is applied
 * only while the page still shows the event it was sent for (`saves.eventNow`).
 */
export function useMatchEditing({
  rpc,
  eventId,
  roster,
  onMatchesChange,
  onRosterChange,
  saves,
}: MatchEditingProps) {
  const { latest, isLast: last, enqueue: queue, unsaved } = saves;
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  /** Counts the line-up saves that went through: a cue to retry a failed registry read. */
  const [savedCount, setSavedCount] = useState(0);

  const publish = useCallback(
    (next: MatchRow[]) => {
      latest.current = next;
      onMatchesChange(next);
    },
    [onMatchesChange],
  );
  /** Puts the server's row in place; a match no longer in the list (deleted) stays gone. */
  const adopt = useCallback(
    (row: MatchRow) => {
      if (!latest.current.some((m) => m.id === row.id)) return;
      publish(sortMatches(latest.current.map((m) => (m.id === row.id ? row : m))));
    },
    [publish],
  );
  const markUnsaved = (id: string, on: boolean) =>
    saves.setUnsaved((prev) => toggled(prev, id, on));
  /** The page still shows the event this hook was given: an answer may be applied. */
  const here = () => saves.eventNow.current === eventId;

  const send = useCallback(
    async (matchId: string) => {
      const match = latest.current.find((m) => m.id === matchId);
      if (!match) return;
      try {
        const row = (await rpc.call('setMatchTeams', { match_id: matchId, slots: match.slots })) as
          MatchRow | undefined;
        if (!here()) return;
        markUnsaved(matchId, false);
        setSavedCount((n) => n + 1);
        if (row?.id === matchId && last(matchId)) adopt({ ...row, slots: row.slots ?? [] });
      } catch (e) {
        if (!here()) return;
        if (unreachable(e)) {
          // The panel's own line says so while any match is marked (`unsaved`).
          markUnsaved(matchId, true);
          return;
        }
        setError(panelErrorLine(e));
        markUnsaved(matchId, false);
        try {
          const fresh = (await loadAllMatches(rpc, eventId)).find((m) => m.id === matchId);
          if (fresh && last(matchId) && here()) adopt(fresh);
        } catch (again) {
          // What is shown is not the server's line-up and could not be re-read.
          if (unreachable(again) && here()) markUnsaved(matchId, true);
        }
      }
    },
    [rpc, eventId, adopt],
  );

  const enqueue = useCallback((matchId: string) => queue(matchId, send), [queue, send]);

  /** Applies a line-up at once and sends it; a no-op when nothing changed. */
  const saveSlots = useCallback(
    (matchId: string, slots: MatchSlot[]) => {
      const match = latest.current.find((m) => m.id === matchId);
      if (!match) return Promise.resolve();
      if (JSON.stringify(match.slots) === JSON.stringify(slots)) return Promise.resolve();
      setError(null);
      publish(latest.current.map((m) => (m.id === matchId ? { ...m, slots } : m)));
      return enqueue(matchId);
    },
    [publish, enqueue],
  );

  /** Try again: re-sends each "Not saved" match's current line-up, in match order. */
  function retryUnsaved() {
    const ids = latest.current.filter((m) => unsaved.has(m.id)).map((m) => m.id);
    return Promise.all(ids.map((id) => enqueue(id))).then(() => undefined);
  }

  /** Adds new matches to the list (the create answer's rows), or re-reads the list. */
  async function merge(out: CreateOut) {
    const rows = out?.items ? null : await loadAllMatches(rpc, eventId);
    if (!here()) return;
    publish(rows ?? sortMatches([...latest.current, ...(out?.items ?? [])]));
  }

  async function run<T>(work: () => Promise<T>): Promise<T | null> {
    setError(null);
    setStatus(null);
    try {
      return await work();
    } catch (e) {
      setError(panelErrorLine(e));
      return null;
    }
  }

  return {
    busyIds: saves.busy,
    unsaved,
    retryUnsaved,
    savedCount,
    error,
    setError,
    status,
    saveSlots,
    /** One station changed or cleared, on the match as it stands now. */
    saveSlot(matchId: string, alliance: Alliance, station: Station, teamId: string | null) {
      const match = latest.current.find((m) => m.id === matchId);
      if (!match) return Promise.resolve();
      return saveSlots(matchId, withSlot(match.slots, alliance, station, teamId));
    },
    /** Bulk create 1..count of a type. True when it went through. */
    async createMany(type: MatchType, countText: string) {
      const count = check('count', countText);
      if (typeof count === 'string') {
        setError(count);
        return false;
      }
      const out = await run(async () => {
        const answer = (await rpc.call('createMatch', {
          event_id: eventId,
          match_type: type,
          count,
        })) as CreateOut;
        await merge(answer);
        return answer ?? {};
      });
      if (out) setStatus(bulkResultLine(type, count, out.created ?? 0));
      return out !== null;
    },
    async createOne(type: MatchType, numberText: string) {
      const number = check('number', numberText);
      if (typeof number === 'string') {
        setError(number);
        return false;
      }
      const out = await run(async () => {
        await merge(
          (await rpc.call('createMatch', {
            event_id: eventId,
            match_type: type,
            number,
          })) as CreateOut,
        );
        return true;
      });
      return out !== null;
    },
    async update(match: MatchRow, patch: Patch) {
      const out = await run(async () => {
        const row = (await rpc.call('updateMatch', { match_id: match.id, ...patch })) as MatchRow;
        if (here()) adopt({ ...match, ...row, slots: row?.slots ?? match.slots });
        return true;
      });
      return out !== null;
    },
    /** Throws the person's line on refusal, for the confirm dialog to show. */
    async remove(match: MatchRow) {
      try {
        await rpc.call('deleteMatch', { match_id: match.id });
      } catch (e) {
        throw new Error(panelErrorLine(e), { cause: e });
      }
      if (!here()) return;
      publish(latest.current.filter((m) => m.id !== match.id));
      markUnsaved(match.id, false);
    },
    /** README "Add {n} to the roster": the whole roster plus that team (today's API). */
    async addToRoster(teamId: string) {
      await run(async () => {
        const out = (await rpc.call('setEventRoster', {
          event_id: eventId,
          team_ids: [...roster.map((r) => r.team_id), teamId],
        })) as { items?: RosterRow[] } | undefined;
        if (out?.items && here()) onRosterChange(out.items);
        return true;
      });
    },
  };
}

export type MatchEditing = ReturnType<typeof useMatchEditing>;
