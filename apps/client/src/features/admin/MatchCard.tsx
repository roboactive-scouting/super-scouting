import type { MatchRow } from '@frc/shared';
import { ChevronRight } from 'lucide-react';
import { matchLabel } from '@/lib/matchLabel';
import { cn } from '@/lib/utils';
import { emptyCount, slotTeam, STATIONS } from './matchOps';
import type { TeamLookup } from './useOffRosterTeams';

/**
 * One match on the phone list (README "Match list"): its red row and blue row of team
 * numbers; an empty slot is dashed and an off-roster team warn-outlined, with "N empty" or
 * "off roster" under the match number ("Not saved" first, when its last save could not
 * reach the server). Tapping it opens the edit sheet.
 */
export function MatchCard({
  match,
  teams,
  rosterIds,
  unsaved = false,
  onOpen,
}: {
  match: MatchRow;
  teams: TeamLookup;
  rosterIds: ReadonlySet<string>;
  unsaved?: boolean;
  onOpen: () => void;
}) {
  const empty = emptyCount(match);
  const off = match.slots.some((s) => !rosterIds.has(s.team_id));
  const note = unsaved ? 'Not saved' : empty > 0 ? `${empty} empty` : off ? 'off roster' : null;
  const row = (alliance: 'red' | 'blue') => (
    <span className="grid grid-cols-3 gap-1">
      {STATIONS.filter((s) => s.alliance === alliance).map(({ station, label }) => {
        const teamId = slotTeam(match, alliance, station);
        const number = teamId ? teams.get(teamId)?.number : undefined;
        return (
          <span
            key={label}
            className={cn(
              'num grid h-6 place-items-center rounded-[5px] text-[12.5px] font-semibold',
              !teamId
                ? 'border border-dashed border-control-border bg-bg text-muted'
                : !rosterIds.has(teamId)
                  ? 'bg-warn-tint text-warn shadow-[inset_0_0_0_1.5px_var(--warn)]'
                  : alliance === 'red'
                    ? 'bg-alliance-red-tint text-alliance-red'
                    : 'bg-alliance-blue-tint text-alliance-blue',
            )}
          >
            {teamId ? (number ?? '…') : '—'}
          </span>
        );
      })}
    </span>
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      className="state-layer grid w-full grid-cols-[2.75rem_1fr_1rem] items-center gap-2 rounded-card border border-line bg-surface px-2.5 py-2.5 text-start"
    >
      <span className="num text-[15px] font-semibold">
        {matchLabel(match)}
        {note && (
          <small className="mt-0.5 block font-ui text-[10.5px] leading-tight font-bold text-warn">
            {note}
          </small>
        )}
      </span>
      <span className="flex flex-col gap-1">
        {row('red')}
        {row('blue')}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 text-muted" />
    </button>
  );
}
