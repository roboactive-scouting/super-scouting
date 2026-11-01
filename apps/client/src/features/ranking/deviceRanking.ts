import { buildRankTable, type RankRow, type RankTableInput } from '@frc/shared';
import { loadDeviceEventStats } from '@/features/teams/teamStats';

/*
 * The ranking computed ON THE DEVICE (SPEC-FINAL 9.6: rankings are viewable offline, computed from
 * raw entries; task 1.58): @frc/shared's `buildRankTable` — the very function the server's
 * `rankTeams` calls — fed by the team page's loader (`loadDeviceEventStats`, task 1.53), which
 * mirrors `apps/server/src/core/queries/stats.ts`: the event's live roster, every live entry of
 * the event and the match form's ACTIVE scoring. So the device's table equals the server's for
 * the same entries. A module of its own, loaded on demand by `useRanking`, so a page in the first
 * chunk (Home, task 1.58b) can use the hook without pulling the engine into the initial JS.
 */

/** What `buildRankTable` is given on this device; null when the device does not hold the event. */
export async function deviceRankInput(
  eventId: string,
): Promise<{ event: { id: string; name: string }; input: RankTableInput } | null> {
  const base = await loadDeviceEventStats(eventId);
  if (!base) return null;
  return {
    event: base.event,
    input: { teams: base.roster, entries: base.entries, scoring: base.scoring },
  };
}

/**
 * This device's ranking table of `eventId`, in the canonical order; null without the event.
 * `beforeMatch` (task 1.58b) is `buildRankTable`'s `before_match_number`: the table as it stood
 * before that qualification match, exactly as `rankTeams` answers it with the same number.
 */
export async function loadDeviceRanking(
  eventId: string,
  beforeMatch?: number,
): Promise<{ event: { id: string; name: string }; rows: RankRow[] } | null> {
  const held = await deviceRankInput(eventId);
  if (!held) return null;
  const input =
    beforeMatch === undefined ? held.input : { ...held.input, before_match_number: beforeMatch };
  return { event: held.event, rows: buildRankTable(input) };
}
