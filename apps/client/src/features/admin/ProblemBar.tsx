import type { MatchRow } from '@frc/shared';
import { TriangleAlert } from 'lucide-react';
import { matchLabel } from '@/lib/matchLabel';
import { missingLine, notOnRosterLine, offRosterTeamIds } from './matchOps';
import type { TeamLookup } from './useOffRosterTeams';

const NO_TEAMS: TeamLookup = new Map();

/**
 * The problem summary under the toolbar (README "Problem summary"), checked as you go:
 * the matches missing robots, each line-up team that is not on the roster with a link to
 * add it, and the grid's key. A team whose number is not known yet (the registry read is
 * pending or failed) is still named by its first match, without the link.
 */
export function ProblemBar({
  matches,
  rosterIds,
  teams = NO_TEAMS,
  onAddToRoster,
}: {
  matches: readonly MatchRow[];
  rosterIds: ReadonlySet<string>;
  /** Names a team that has left the roster (its slot carries only the id). */
  teams?: TeamLookup;
  onAddToRoster: (teamId: string) => void;
}) {
  const missing = missingLine(matches);
  const strangers = offRosterTeamIds(matches, rosterIds).map((id) => {
    const team = teams.get(id);
    if (team) return { id, number: team.number, line: notOnRosterLine(team.number) };
    const first = matches.find((m) => m.slots.some((s) => s.team_id === id));
    const where = first ? ` in ${matchLabel(first)}` : '';
    return { id, number: null, line: `A team${where} is not on this event's roster` };
  });
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line-2 bg-bg px-3.5 py-1 text-[13px]">
      {missing && <Issue>{missing}</Issue>}
      {strangers.map((t) => (
        <span key={t.id} className="inline-flex flex-wrap items-center gap-x-2.5">
          <Issue>{t.line}</Issue>
          {t.number !== null && (
            <button
              type="button"
              onClick={() => onAddToRoster(t.id)}
              className="tap-target state-layer rounded-control px-1 font-[650] text-accent-ink"
            >
              {`Add ${t.number} to the roster`}
            </button>
          )}
        </span>
      ))}
      <span className="ms-auto py-3 text-muted">Type a number · Tab moves on · saved per cell</span>
    </div>
  );
}

function Issue({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 py-3 font-[650] text-warn">
      <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}
