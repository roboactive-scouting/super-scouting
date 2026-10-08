import { ArrowDown, ArrowUp } from 'lucide-react';
import { Fragment } from 'react';
import { ErrorLine } from '@/components/ui/notice';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RobotStatusTag, WarningFlag } from '@/components/ui/tag';
import { cn } from '@/lib/utils';
import { EntryStation, refusedText, WaitingMark } from './EntryParts';
import type { EntryRow } from './useEntriesView';

/**
 * Rows open nothing until the entry preview exists (SPEC-FINAL 13.4), so they drop the data
 * table's hover tint: nothing here looks tappable (UF.8).
 */
const STATIC_ROW = 'hover:bg-transparent';

/**
 * Desktop: THEME "Data table" over the entries, newest first. No Points column until the
 * metric engine (task 1.54). A refused entry keeps its own line under its row.
 */
export function EntriesTable({ rows }: { rows: EntryRow[] }) {
  return (
    <>
      <Table containerClassName="rounded-card border border-line bg-surface">
        <TableHeader>
          <TableRow className={STATIC_ROW}>
            <TableHead className="w-28 ps-5 text-ink">
              <span className="inline-flex items-center gap-1">
                Match
                <ArrowDown aria-hidden="true" className="size-3.5" />
              </span>
            </TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Scouter</TableHead>
            <TableHead className="pe-5">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <TableRow className={cn(STATIC_ROW, row.refused && 'border-b-0')}>
                <TableCell className="num ps-5 font-semibold">{row.matchLabel}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <EntryStation row={row} />
                    <span className="num font-semibold">{row.teamNumber}</span>
                    <span dir="auto" className="text-ink-2">
                      {row.teamName}
                    </span>
                    {row.notInLineup ? <WarningFlag>Not in line-up</WarningFlag> : null}
                  </div>
                </TableCell>
                <TableCell>{row.status ? <RobotStatusTag status={row.status} /> : null}</TableCell>
                <TableCell dir="auto">{row.scouter}</TableCell>
                <TableCell className="num pe-5 text-[0.8125rem] text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    {row.time}
                    {row.waiting ? <WaitingMark /> : null}
                  </span>
                </TableCell>
              </TableRow>
              {row.refused ? (
                <TableRow className={STATIC_ROW}>
                  <TableCell colSpan={5} className="h-auto px-5 pb-2.5 pt-0">
                    <ErrorLine className="text-[0.8125rem] font-normal">
                      {refusedText(row.refused)}
                    </ErrorLine>
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          ))}
        </TableBody>
      </Table>
      <p className="mt-2.5 flex items-center gap-1 text-[0.78125rem] text-muted">
        <ArrowUp aria-hidden="true" className="size-3.5 text-warn" strokeWidth={2.6} />
        waiting to send
      </p>
    </>
  );
}
