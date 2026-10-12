import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StateMessage } from '@/components/StateMessage';
import { cachedLiveSlots, cachedRows } from '@/data/cache';
import { getStation } from '@/data/station';
import type { LineupSlot } from '@/lib/derive/entries';
import { entryPath, PATHS } from '@/lib/paths';
import { localEntries } from './localEntries';
import { practiceMode } from './practice';
import { practiceTarget, type PracticeTarget } from './practiceTarget';

type MatchRow = { id: string; event_id: string; match_type: string; number: number };

/** What the Scout card and Practice another match hand over through router state. */
export type PracticeStartState = { prefer?: PracticeTarget; after?: string };

/**
 * `/practice`, the way into practice mode (SPEC-FINAL 8.5; task 1.37). It picks a match and robot
 * the device holds (`practiceTarget`), turns practice on and replaces itself with that entry, so
 * Back from the form returns to where practice was started from. With no match on the device to
 * practise with, it says so and stays out of practice.
 */
export function PracticeStart({ eventId }: { eventId: string }) {
  const navigate = useNavigate();
  const state = (useLocation().state as PracticeStartState | null) ?? {};
  const [none, setNone] = useState(false);
  const preferKey = state.prefer
    ? `${state.prefer.matchId}:${state.prefer.teamId}:${state.prefer.alliance}`
    : '';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [matches, slots, station, entries] = await Promise.all([
        cachedRows<MatchRow>('matches'),
        cachedLiveSlots<LineupSlot>(),
        getStation(),
        localEntries(eventId),
      ]);
      if (cancelled) return;
      const target = practiceTarget({
        matches: matches.filter((m) => m.event_id === eventId),
        slots,
        station,
        scoutedMatchIds: new Set(
          entries.filter((e) => e.form_kind === 'match' && e.match_id).map((e) => e.match_id!),
        ),
        prefer: state.prefer ?? null,
        after: state.after ?? null,
      });
      if (!target) {
        setNone(true);
        return;
      }
      practiceMode.enter();
      navigate(entryPath(target.matchId, target.teamId, target.alliance), { replace: true });
    })();
    return () => {
      cancelled = true;
    };
    // The state is read once per arrival; `preferKey` and `after` name it.
  }, [eventId, preferKey, state.after, navigate]);

  if (!none) return null;
  return (
    <StateMessage
      variant="no-results"
      headingLevel={1}
      title="No match on this device to practise with"
      detail="Practice uses a match with a line-up on this device. Once the schedule has synced, try again."
      action={{ label: 'Back to scouting', to: PATHS.scout }}
    />
  );
}
