import { AllianceTag, RobotStatusTag, StationTag, SuperTag } from '@/components/ui/tag';
import type { DiscardedSummary } from '@/data/db';

type RobotStatus = Parameters<typeof RobotStatusTag>[0]['status'];
const STATUSES: readonly string[] = ['played', 'broke_down', 'disabled', 'no_show'];

/** "Red 2" from the line-up as it was cached; just "Red" when the team was not in it. */
export function DiscardedStation({ summary }: { summary: DiscardedSummary }) {
  if (summary.form_kind === 'super') return null;
  if (summary.station) return <StationTag station={summary.station} />;
  if (!summary.alliance) return null;
  return (
    <AllianceTag alliance={summary.alliance}>
      {summary.alliance === 'red' ? 'Red' : 'Blue'}
    </AllianceTag>
  );
}

/** The robot status tag, or SUPER for a super entry (19-discarded final). */
export function DiscardedStatus({ summary }: { summary: DiscardedSummary }) {
  if (summary.form_kind === 'super') return <SuperTag />;
  return summary.robot_status && STATUSES.includes(summary.robot_status) ? (
    <RobotStatusTag status={summary.robot_status as RobotStatus} />
  ) : null;
}

/** "Match entry" / "Super entry"; what a wiped record was when it was not an entry. */
export function kindLabel(summary: DiscardedSummary): string {
  if (summary.what) return summary.what;
  return summary.form_kind === 'super' ? 'Super entry' : 'Match entry';
}

/** The team as the log names it: number in mono, then the name; the id when not cached. */
export function DiscardedTeam({
  summary,
  big = false,
}: {
  summary: DiscardedSummary;
  big?: boolean;
}) {
  if (summary.team_number === null) {
    return (
      <span dir="auto" className="min-w-0 text-ink-2">
        {summary.team}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <span className={big ? 'num text-base font-semibold' : 'num font-semibold'}>
        {summary.team_number}
      </span>
      {summary.team_name ? (
        <span dir="auto" className="min-w-0 truncate text-ink-2">
          {summary.team_name}
        </span>
      ) : null}
    </span>
  );
}
