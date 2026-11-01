import { LinkCard } from '@/components/ui/link-row';
import { ErrorLine } from '@/components/ui/notice';
import { RobotStatusTag, SuperTag, WarningFlag } from '@/components/ui/tag';
import { entryPreviewPath } from '@/lib/paths';
import { entryLinkLabel, PointsText, refusedText, WaitingMark } from './EntryParts';
import type { EntryRow } from './useEntriesView';

/**
 * Phone: one card per entry (05 + 26-entry-search final), the whole card a link to the entry's
 * preview with a faint › (THEME "Table row as a link", its card twin). Top line: the match (the
 * SUPER tag for a super entry), the team number and name; at the right the points over "pts"
 * ("—" for a no-show or disabled robot; "whole event" for a super entry). Under it the status,
 * the scouter's name — whole, wrapping, never cut (UF.8) — and the time. No station tag.
 */
export function EntryCard({ row }: { row: EntryRow }) {
  const isSuper = row.kind === 'super';
  return (
    <li>
      <LinkCard to={entryPreviewPath(row.id)} label={entryLinkLabel(row)}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5">
          <div className="flex min-w-0 items-baseline gap-2">
            {isSuper ? (
              <span className="self-center">
                <SuperTag compact />
              </span>
            ) : (
              <span className="num text-[0.8125rem] font-semibold text-muted">
                {row.matchLabel}
              </span>
            )}
            <span className="num text-[1.0625rem] font-semibold">{row.teamNumber}</span>
            <span dir="auto" className="min-w-0 truncate text-sm text-ink-2">
              {row.teamName}
            </span>
          </div>
          <div className="row-span-2 flex flex-col items-end text-end">
            {isSuper ? (
              <span className="text-[0.71875rem] font-semibold text-muted">whole event</span>
            ) : (
              <>
                <PointsText points={row.points} className="text-[1.375rem] leading-none" />
                <span className="mt-[3px] text-[0.6875rem] font-semibold text-muted">pts</span>
              </>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.78125rem] text-muted">
            {row.status ? <RobotStatusTag status={row.status} /> : null}
            {/* The full name, wrapping when long: never cut (UF.8). */}
            <span dir="auto" className="min-w-0 break-words">
              {row.scouter} · <span className="num whitespace-nowrap">{row.time}</span>
            </span>
            {row.waiting ? <WaitingMark /> : null}
          </div>
          {row.notInLineup ? (
            <div className="col-span-2">
              <WarningFlag>Not in line-up</WarningFlag>
            </div>
          ) : null}
          {row.refused ? (
            <ErrorLine announce={false} className="col-span-2 text-[0.78125rem] font-normal">
              {refusedText(row.refused)}
            </ErrorLine>
          ) : null}
        </div>
      </LinkCard>
    </li>
  );
}
