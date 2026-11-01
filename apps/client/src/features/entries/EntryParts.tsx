import { ArrowUp } from 'lucide-react';
import { NO_VALUE } from '@frc/shared';
import { cn } from '@/lib/utils';
import type { EntryRow } from './useEntriesView';

/** The amber arrow beside the time of an entry still waiting to send. */
export function WaitingMark() {
  return (
    <span role="img" aria-label="waiting to send" className="inline-flex text-warn">
      <ArrowUp aria-hidden="true" className="size-3.5" strokeWidth={2.6} />
    </span>
  );
}

/** The "Not sent: …" line under a refused entry, labelled as on Sync (SPEC-FINAL 7.6, v1.44). */
export function refusedText(reason: string) {
  return (
    <>
      <b className="font-bold">Not sent:</b> {reason}
    </>
  );
}

/**
 * A match entry's scouted points, mono: a `--muted` "—" for a no-show or disabled robot (never a
 * zero, SPEC-FINAL 11.3) and when the device cannot score it.
 */
export function PointsText({ points, className }: { points: number | null; className?: string }) {
  return points === null ? (
    <span className={cn('num font-medium text-muted', className)}>{NO_VALUE}</span>
  ) : (
    <span className={cn('num font-semibold text-ink', className)}>{formatPoints(points)}</span>
  );
}

/** Whole points bare ("47"); a fractional total to one place ("12.5"). */
export function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

/**
 * What a row or card says it opens: "Q38 5951 Tiny Titans, Noa Levi, 11:41 — open the entry";
 * a super entry "Super 1690 Orbit, …".
 */
export function entryLinkLabel(row: EntryRow): string {
  const what = row.kind === 'super' ? 'Super' : row.matchLabel;
  return `${what} ${row.teamNumber ?? ''} ${row.teamName}, ${row.scouter}, ${row.time}: open the entry`
    .replace(/\s+/g, ' ')
    .trim();
}
