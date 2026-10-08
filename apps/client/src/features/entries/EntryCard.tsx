import { ErrorLine } from '@/components/ui/notice';
import { RobotStatusTag, WarningFlag } from '@/components/ui/tag';
import { EntryStation, refusedText, WaitingMark } from './EntryParts';
import type { EntryRow } from './useEntriesView';

/**
 * Phone: one card per entry. The points slot comes with the metric engine (task 1.54). The card
 * opens nothing until the entry preview exists (SPEC-FINAL 13.4), so it looks static: no
 * pointer, no press state.
 */
export function EntryCard({ row }: { row: EntryRow }) {
  return (
    <li className="grid gap-1.5 rounded-card border border-line bg-surface px-3 py-2.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="num text-[0.8125rem] font-semibold text-muted">{row.matchLabel}</span>
        <span className="num text-[1.0625rem] font-semibold">{row.teamNumber}</span>
        <span dir="auto" className="min-w-0 truncate text-sm text-ink-2">
          {row.teamName}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.78125rem] text-muted">
        <EntryStation row={row} compact />
        {row.status ? <RobotStatusTag status={row.status} /> : null}
        {/* The full name, wrapping when long: never cut (UF.8). */}
        <span dir="auto" className="min-w-0 break-words">
          {row.scouter} · <span className="num whitespace-nowrap">{row.time}</span>
        </span>
        {row.waiting ? <WaitingMark /> : null}
      </div>
      {row.notInLineup ? (
        <div>
          <WarningFlag>Not in line-up</WarningFlag>
        </div>
      ) : null}
      {row.refused ? (
        <ErrorLine className="text-[0.78125rem] font-normal">{refusedText(row.refused)}</ErrorLine>
      ) : null}
    </li>
  );
}
