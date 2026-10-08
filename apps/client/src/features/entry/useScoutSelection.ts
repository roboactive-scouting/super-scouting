import { useState } from 'react';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { cachedRows } from '@/data/cache';
import { getStation, type Station } from '@/data/station';
import { stationOf, type LineupSlot } from '@/lib/derive/entries';
import { lineupTiles, type Tile } from './LineupTiles';
import {
  canSelfEdit,
  editableUntil,
  editsAnyTime,
  localEntries,
  type Editor,
} from './localEntries';
import { rosterItems } from './RosterList';
import {
  allianceFor,
  flaggedNotInLineup,
  hhmm,
  resolveChoice,
  sideOf,
  type Side,
  type TeamLite,
} from './scoutChoice';

type MatchRow = { id: string; event_id: string; match_type: string; number: number };
type RosterRow = { event_id: string; team_id: string; deleted_at: string | null };

/** Everything the page reads, in one pass from IndexedDB, so it is never half-loaded. */
async function loadScout(eventId: string) {
  const [matches, slots, teams, eventTeams, entries] = await Promise.all([
    cachedRows<MatchRow>('matches'),
    cachedRows<LineupSlot>('match_teams'),
    cachedRows<TeamLite>('teams'),
    cachedRows<RosterRow>('event_teams'),
    localEntries(eventId),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const live = eventTeams.filter((r) => r.event_id === eventId && r.deleted_at == null);
  return {
    matches: matches.filter((m) => m.event_id === eventId),
    slots,
    teamById,
    roster: live.map((r) => teamById.get(r.team_id)).filter((t): t is TeamLite => Boolean(t)),
    entries: entries.filter((e) => e.form_kind === 'match'),
  };
}
const EMPTY: Awaited<ReturnType<typeof loadScout>> = {
  matches: [],
  slots: [],
  teamById: new Map(),
  roster: [],
  entries: [],
};

/**
 * What the Scout page shows for the typed match, read from the device, and the scout's
 * picks on top of it. Every pick belongs to one typed match (and the alliance and tile
 * picks to one station too): a new type, number or station starts clean.
 */
export function useScoutSelection(
  eventId: string,
  author: Editor,
  matchType: string,
  number: string,
) {
  const data = useDeviceQuery(() => loadScout(eventId), [eventId], ['rows']) ?? EMPTY;
  // The station is device meta (Scout README 1): read apart, so a sync never re-reads rows.
  const station = useDeviceQuery(getStation, [], ['meta']);
  const [alliancePick, setAlliancePick] = useState<{ key: string; side: Side } | null>(null);
  const [tilePick, setTilePick] = useState<{ key: string; station: Station } | null>(null);
  const [teamPick, setTeamPick] = useState<{ key: string; teamId: string } | null>(null);
  const [notHereKey, setNotHereKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Tile | null>(null);
  const [search, setSearch] = useState<{ key: string; text: string } | null>(null);

  const parsed = Number(number);
  const valid = Number.isInteger(parsed) && parsed > 0;
  const key = `${matchType}:${parsed}`;
  const stationKey = `${key}:${station ?? ''}`;
  const existing = valid
    ? data.matches.find((m) => m.match_type === matchType && m.number === parsed)
    : undefined;

  // A robot this device already holds an entry for, in this match, is never offered for a
  // second one (SPEC-FINAL 8.1): it opens the existing entry while the self-edit window
  // (7.6) is open, and is shown locked after it. Cross-device duplicates stay with 9.5.
  const now = new Date();
  const scouted = new Map(
    existing
      ? data.entries.filter((e) => e.match_id === existing.id).map((e) => [e.team_id, e])
      : [],
  );
  const doneOf = (teamId: string): Tile['done'] => {
    const entry = scouted.get(teamId);
    if (!entry) return null;
    if (!canSelfEdit(entry, author, now)) return { locked: true, until: null };
    return { locked: false, until: editsAnyTime(author) ? null : hhmm(editableUntil(entry)) };
  };

  const tiles = lineupTiles(data.slots, existing?.id, data.teamById, doneOf);
  const notHere = tiles.length > 0 && notHereKey === key;
  const showLineup = tiles.length > 0 && !notHere;
  const alliance = allianceFor(alliancePick, stationKey, station);
  const { chosen, selected } = resolveChoice({
    key,
    tileKey: stationKey,
    valid,
    showLineup,
    tiles,
    station,
    tilePick,
    teamPick,
    alliance,
    roster: data.roster,
    scouted,
    isLocked: (teamId) => doneOf(teamId)?.locked === true,
  });
  const flagged = flaggedNotInLineup(notHere, chosen, data.slots, existing?.id);

  function pickTeam(teamId: string) {
    setTeamPick({ key, teamId });
    // A line-up robot keeps its own alliance.
    const at = existing ? stationOf(data.slots, existing.id, teamId) : null;
    if (at) setAlliancePick({ key: stationKey, side: sideOf(at) });
  }

  function pickTile(tile: Tile) {
    // Asks only when moving away from the robot already lit (Scout README 4).
    if (station && tile.station !== station && tile.station !== selected) setConfirming(tile);
    else setTilePick({ key: stationKey, station: tile.station });
  }

  return {
    station,
    parsed,
    valid,
    existing,
    tiles,
    notHere,
    showLineup,
    alliance,
    chosen,
    selected,
    flagged,
    confirming,
    roster: rosterItems(data.roster, data.slots, existing?.id, doneOf),
    rosterValue: teamPick?.key === key ? teamPick.teamId : null,
    query: search?.key === key ? search.text : '',
    onQuery: (text: string) => setSearch({ key, text }),
    onAlliance: (side: Side) => setAlliancePick({ key: stationKey, side }),
    pickTeam,
    pickTile,
    openNotHere: () => setNotHereKey(key),
    closeNotHere: () => setNotHereKey(null),
    keepStation: () => setConfirming(null),
    scoutOther: (tile: Tile) => {
      setTilePick({ key: stationKey, station: tile.station });
      setConfirming(null);
    },
  };
}
