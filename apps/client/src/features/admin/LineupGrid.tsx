import { useRef } from 'react';
import type { Alliance, MatchRow, RosterRow } from '@frc/shared';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { matchLabel } from '@/lib/matchLabel';
import { cn } from '@/lib/utils';
import { slotTeam, STATIONS, type Station, type Typed } from './matchOps';
import { TeamField } from './TeamField';
import type { TeamLookup } from './useOffRosterTeams';

const COLUMNS = 'grid grid-cols-[3.5rem_repeat(6,minmax(0,1fr))_6.5rem] items-center gap-1';

/**
 * The line-up grid (README "The grid"): one row per match, alliance-tinted RED 1 … BLUE 3
 * headers, six typed cells, then ✎ and 🗑. Enter moves to the next cell (Tab already does).
 * Every cell's commit goes to `onSlot`; the panel saves it. A match whose last save could
 * not reach the server reads "Not saved" under its number (`aria-invalid` on the row).
 */
export function LineupGrid({
  matches,
  roster,
  teams,
  rosterIds,
  busyIds,
  unsavedIds,
  onSlot,
  onEdit,
  onDelete,
}: {
  matches: readonly MatchRow[];
  roster: readonly RosterRow[];
  teams: TeamLookup;
  rosterIds: ReadonlySet<string>;
  busyIds: ReadonlySet<string>;
  unsavedIds: ReadonlySet<string>;
  onSlot: (match: MatchRow, alliance: Alliance, station: Station, typed: Typed) => void;
  onEdit: (match: MatchRow) => void;
  onDelete: (match: MatchRow) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);

  function moveOn() {
    const cells = [...(grid.current?.querySelectorAll<HTMLElement>('[role="combobox"]') ?? [])];
    const at = cells.indexOf(document.activeElement as HTMLElement);
    cells[at + 1]?.focus();
  }

  return (
    <div ref={grid} className="px-3 py-2.5">
      <div aria-hidden="true" className={cn(COLUMNS, 'mb-1')}>
        <span />
        {STATIONS.map(({ alliance, label }) => (
          <span
            key={label}
            className={cn(
              'rounded-[6px] px-2 py-1.5 text-[0.71875rem] font-[750] tracking-[0.04em] uppercase',
              alliance === 'red'
                ? 'bg-alliance-red-tint text-alliance-red'
                : 'bg-alliance-blue-tint text-alliance-blue',
            )}
          >
            {label}
          </span>
        ))}
        <span />
      </div>
      <div className="flex flex-col gap-1">
        {matches.map((match) => {
          const label = matchLabel(match);
          const name = `match ${match.number} (${match.match_type})`;
          const unsaved = unsavedIds.has(match.id);
          return (
            <div
              key={match.id}
              role="group"
              aria-label={label}
              aria-busy={busyIds.has(match.id) || undefined}
              aria-invalid={unsaved || undefined}
              className={COLUMNS}
            >
              <span className="num ps-1.5 font-semibold">
                {label}
                {unsaved && (
                  <small className="block font-ui text-[0.65625rem] leading-tight font-bold text-warn">
                    Not saved
                  </small>
                )}
              </span>
              {STATIONS.map(({ alliance, station, label: where }) => {
                const teamId = slotTeam(match, alliance, station);
                return (
                  <TeamField
                    key={where}
                    label={`${label} ${where}`}
                    hideLabel
                    teamId={teamId}
                    teams={teams}
                    roster={roster}
                    offRoster={teamId !== null && !rosterIds.has(teamId)}
                    countLine={(n) => `${n} ${n === 1 ? 'match' : 'matches'}`}
                    onCommit={(typed) => onSlot(match, alliance, station, typed)}
                    onEnter={moveOn}
                  />
                );
              })}
              <span className="flex justify-end gap-1">
                <Button
                  size="icon"
                  aria-label={`Edit ${name}`}
                  title={`Edit ${name}`}
                  onClick={() => onEdit(match)}
                >
                  <Pencil aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  aria-label={`Delete ${name}`}
                  title={`Delete ${name}`}
                  onClick={() => onDelete(match)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
