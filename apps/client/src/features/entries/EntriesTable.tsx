import { ArrowDown, ArrowUp } from 'lucide-react';
import { Fragment } from 'react';
import { NO_VALUE } from '@frc/shared';
import { LinkTableRow } from '@/components/ui/link-row';
import { ErrorLine } from '@/components/ui/notice';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RobotStatusTag, SuperTag, WarningFlag } from '@/components/ui/tag';
import { entryPreviewPath } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { entryLinkLabel, PointsText, refusedText, WaitingMark } from './EntryParts';
import type { EntryRow } from './useEntriesView';

/**
 * Desktop: THEME "Data table" over the entries, newest first, match and super (26-entry-search
 * final). Every row is a link to its preview (THEME "Table row as a link"): hover or focus tints
 * it, with a 3 px accent edge and the › in `--accent`. The Team cell is the number and the name
 * only (no station tag), plus the "Not in line-up" flag. A refused entry keeps its own line under
 * its row. A super entry: Match "—", the dark SUPER tag, no points.
 */
export function EntriesTable({ rows }: { rows: EntryRow[] }) {
  return (
    <>
      <Table containerClassName="rounded-card border border-line bg-surface">
        <TableHeader>
          <TableRow>
            <TableHead className="w-28 ps-5 text-ink">
              <span className="inline-flex items-center gap-1">
                Match
                <ArrowDown aria-hidden="true" className="size-3.5" />
              </span>
            </TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Scouter</TableHead>
            <TableHead>Time</TableHead>
            <TableHead numeric>Points</TableHead>
            <TableHead className="w-10 pe-5">
              <span className="sr-only">Open</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <LinkTableRow
                to={entryPreviewPath(row.id)}
                label={entryLinkLabel(row)}
                className={cn(row.refused && 'border-b-0')}
              >
                <TableCell className="num ps-5 font-semibold">
                  {row.kind === 'super' ? NO_VALUE : row.matchLabel}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="num font-semibold">{row.teamNumber}</span>
                    <span dir="auto" className="text-ink-2">
                      {row.teamName}
                    </span>
                    {row.notInLineup ? <WarningFlag>Not in line-up</WarningFlag> : null}
                  </div>
                </TableCell>
                <TableCell>
                  {row.kind === 'super' ? (
                    <SuperTag />
                  ) : row.status ? (
                    <RobotStatusTag status={row.status} />
                  ) : null}
                </TableCell>
                <TableCell dir="auto">{row.scouter}</TableCell>
                <TableCell className="num text-[0.8125rem] text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    {row.time}
                    {row.waiting ? <WaitingMark /> : null}
                  </span>
                </TableCell>
                <TableCell numeric className="pe-0">
                  {row.kind === 'super' ? null : <PointsText points={row.points} />}
                </TableCell>
              </LinkTableRow>
              {row.refused ? (
                <TableRow readOnly>
                  <TableCell colSpan={7} className="h-auto px-5 pb-2.5 pt-0">
                    <ErrorLine announce={false} className="text-[0.8125rem] font-normal">
                      {refusedText(row.refused)}
                    </ErrorLine>
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          ))}
        </TableBody>
      </Table>
      <p className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.78125rem] text-muted">
        <span className="inline-flex items-center gap-1">
          <ArrowUp aria-hidden="true" className="size-3.5 text-warn" strokeWidth={2.6} />
          waiting to send
        </span>
        <span>— no points: didn’t play or disabled</span>
        <span>a super entry has no score</span>
      </p>
    </>
  );
}
