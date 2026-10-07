import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchRow, RosterRow, TeamRow } from '@frc/shared';
import type { Rpc } from '@/data/rpc';
import { useOnline } from '@/lib/useOnline';
import { offRosterTeamIds } from './matchOps';
import { loadAllTeams } from './teamsRegistry';

/**
 * A team that has left the roster keeps its match slots (task 1.21 addendum), and the
 * slot only carries its id: its number and name come from the registry, read only when
 * such a slot names a team not known yet. A read that failed (or did not name it) is
 * tried again on the next successful save (`retryKey` changes) or when the connection
 * returns.
 */
export function useOffRosterTeams(
  rpc: Rpc,
  matches: readonly MatchRow[],
  roster: RosterRow[],
  retryKey = 0,
) {
  const online = useOnline();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const rosterIds = useMemo(() => new Set(roster.map((r) => r.team_id)), [roster]);
  const offIds = offRosterTeamIds(matches, rosterIds);
  const [registry, setRegistry] = useState<TeamRow[] | null>(null);

  const byId = useMemo(() => {
    const map = new Map<string, { number: number; name: string }>();
    for (const t of registry ?? []) map.set(t.id, t);
    for (const r of roster) map.set(r.team_id, r);
    return map;
  }, [registry, roster]);
  const missing = offIds.some((id) => !byId.has(id));

  useEffect(() => {
    if (!missing || !online) return;
    let live = true;
    loadAllTeams(rpcRef.current).then(
      (teams) => {
        if (live) setRegistry(teams);
      },
      () => {
        // Unreachable: the slot still shows, flagged, without its number.
      },
    );
    return () => {
      live = false;
    };
  }, [missing, online, retryKey]);

  return { rosterIds, offIds, byId };
}

export type TeamLookup = ReadonlyMap<string, { number: number; name: string }>;
