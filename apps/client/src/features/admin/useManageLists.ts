import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ActiveContext,
  type EventRow,
  type MatchRow,
  type RosterRow,
  type SeasonRow,
  type TeamRow,
} from '@frc/shared';
import type { Rpc } from '@/data/rpc';
import { failureOf, type Failure } from './manageError';
import { loadAllMatches } from './matchOps';
import { loadAllTeams } from './teamsRegistry';
import { useMatchSaves } from './useMatchSaves';

/**
 * Every list the Manage page shows, fetched once per visit and then changed in place by
 * the tabs (Wave E rule): seasons + the active context, the chosen season's events, the
 * chosen event's roster and matches (so the tab counts are right before a tab is opened),
 * and the team registry. Nothing loads while `enabled` is false (not an admin, or offline);
 * a list that has not loaded yet starts by itself when it turns true.
 */

export const byNumber = <T extends { number: number }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => a.number - b.number);

const bySortOrder = (rows: readonly EventRow[]) =>
  [...rows].sort((a, b) => a.sort_order - b.sort_order);

const NO_CONTEXT: ActiveContext = { active_season_id: null, active_event_id: null };
const NONE: ReadonlySet<string> = new Set();
const clear = () => NONE;

export function useManageLists(rpc: Rpc, enabled: boolean) {
  const [seasons, setSeasons] = useState<SeasonRow[] | null>(null);
  const [seasonsFailure, setSeasonsFailure] = useState<Failure | null>(null);
  const [active, setActive] = useState<ActiveContext>(NO_CONTEXT);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [eventsFailure, setEventsFailure] = useState<Failure | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  /** The line-up saves' queues and marks ("Not saved", being sent): one set per page. */
  const saves = useMatchSaves(eventId, matches);
  const { setUnsaved } = saves;
  /** Which event `roster`/`matches` belong to, and whether they loaded. */
  const [eventData, setEventData] = useState<{ eventId: string; failure: Failure | null } | null>(
    null,
  );
  const [registry, setRegistry] = useState<TeamRow[] | null>(null);
  const [registryFailure, setRegistryFailure] = useState<Failure | null>(null);
  // The season and event as of the latest render: a change started for one must never land
  // once the admin has picked another.
  const seasonRef = useRef(seasonId);
  seasonRef.current = seasonId;
  const activeRef = useRef(active);
  activeRef.current = active;
  const eventRef = useRef(eventId);
  eventRef.current = eventId;

  const needSeasons = enabled && seasons === null && seasonsFailure === null;
  useEffect(() => {
    if (!needSeasons) return;
    let live = true;
    Promise.all([rpc.call('listSeasons', {}), rpc.call('getActiveContext', {})]).then(
      ([seasonsOut, contextOut]) => {
        if (!live) return;
        const sorted = [...(seasonsOut as { items: SeasonRow[] }).items].sort(
          (a, b) => b.year - a.year,
        );
        const context = contextOut as ActiveContext;
        setActive(context);
        setSeasons(sorted);
        setSeasonId((prev) => prev ?? context.active_season_id ?? sorted[0]?.id ?? null);
      },
      (e: unknown) => {
        if (live) setSeasonsFailure(failureOf(e));
      },
    );
    return () => {
      live = false;
    };
  }, [needSeasons, rpc]);

  const needEvents = enabled && seasonId !== null && events === null && eventsFailure === null;
  useEffect(() => {
    if (!needEvents || !seasonId) return;
    let live = true;
    rpc.call('listEvents', { season_id: seasonId }).then(
      (out) => {
        if (!live) return;
        const sorted = bySortOrder((out as { items: EventRow[] }).items);
        const activeEventId = activeRef.current.active_event_id;
        setEvents(sorted);
        setEventId((prev) => {
          if (prev && sorted.some((e) => e.id === prev)) return prev;
          return sorted.some((e) => e.id === activeEventId)
            ? activeEventId
            : (sorted[0]?.id ?? null);
        });
      },
      (e: unknown) => {
        if (live) setEventsFailure(failureOf(e));
      },
    );
    return () => {
      live = false;
    };
  }, [needEvents, seasonId, rpc]);

  const needEventData = enabled && eventId !== null && eventData?.eventId !== eventId;
  useEffect(() => {
    if (!needEventData || !eventId) return;
    let live = true;
    Promise.all([
      rpc.call('listEventRoster', { event_id: eventId }) as Promise<{ items?: RosterRow[] }>,
      loadAllMatches(rpc, eventId),
    ]).then(
      ([rosterOut, matchRows]) => {
        if (!live) return;
        setRoster(byNumber(rosterOut?.items ?? []));
        setMatches(matchRows); // loadAllMatches answers sorted
        setUnsaved(clear); // the server's line-ups replace what was typed
        setEventData({ eventId, failure: null });
      },
      (e: unknown) => {
        if (live) setEventData({ eventId, failure: failureOf(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [needEventData, eventId, rpc, setUnsaved]);

  const needRegistry = enabled && registry === null && registryFailure === null;
  useEffect(() => {
    if (!needRegistry) return;
    let live = true;
    loadAllTeams(rpc).then(
      (teams) => live && setRegistry(teams),
      (e: unknown) => live && setRegistryFailure(failureOf(e)),
    );
    return () => {
      live = false;
    };
  }, [needRegistry, rpc]);

  /**
   * Another event (or none): the old event's lists and "Not saved" marks go at once — what
   * the tabs no longer show is never asked about — and the new event's load from scratch.
   */
  const chooseEvent = useCallback(
    (id: string | null) => {
      if (id === eventRef.current) return;
      setEventId(id);
      setRoster([]);
      setMatches([]);
      setUnsaved(clear);
      setEventData(null);
    },
    [setUnsaved],
  );

  /** Another season's card and events; its events load from scratch. */
  const selectSeason = useCallback(
    (id: string) => {
      if (id === seasonRef.current) return;
      setSeasonId(id);
      setEvents(null);
      setEventsFailure(null);
      chooseEvent(null);
    },
    [chooseEvent],
  );

  /** A create or edit answered: put the row in place (newest year first) and show it. */
  const saveSeason = useCallback(
    (row: SeasonRow) => {
      setSeasons((prev) =>
        [...(prev ?? []).filter((s) => s.id !== row.id), row].sort((a, b) => b.year - a.year),
      );
      selectSeason(row.id);
    },
    [selectSeason],
  );

  /** Change the events of `forSeason` in place — dropped if another season is shown now. */
  const changeEvents = useCallback(
    (forSeason: string, update: (prev: EventRow[]) => EventRow[]) => {
      if (seasonRef.current !== forSeason) return;
      setEvents((prev) => (prev ? bySortOrder(update(prev)) : prev));
    },
    [],
  );

  const loaded = eventData !== null && eventData.eventId === eventId;
  return {
    seasons,
    seasonsFailure,
    retrySeasons: () => setSeasonsFailure(null),
    active,
    setActive,
    seasonId,
    selectSeason,
    saveSeason,
    events,
    eventsFailure,
    retryEvents: () => setEventsFailure(null),
    changeEvents,
    eventId,
    chooseEvent,
    roster,
    setRoster,
    matches,
    setMatches,
    saves,
    /** `roster`/`matches` are the chosen event's and loaded. */
    eventReady: loaded && eventData.failure === null,
    eventFailure: loaded ? eventData.failure : null,
    retryEvent: () => setEventData(null),
    registry,
    setRegistry,
    registryFailure,
    retryRegistry: () => setRegistryFailure(null),
  };
}
