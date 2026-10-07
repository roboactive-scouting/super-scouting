import { ArrowUp } from 'lucide-react';
import { AllianceTag, StationTag } from '@/components/ui/tag';
import type { EntryRow } from './useEntriesView';

/** "Blue 2" from the line-up; just "Blue" when the team is not in it (the entry knows its side only). */
export function EntryStation({ row }: { row: Pick<EntryRow, 'station' | 'alliance'> }) {
  return row.station ? (
    <StationTag station={row.station} />
  ) : (
    <AllianceTag alliance={row.alliance}>{row.alliance === 'red' ? 'Red' : 'Blue'}</AllianceTag>
  );
}

/** The amber arrow beside the time of an entry still waiting to send. */
export function WaitingMark() {
  return (
    <span role="img" aria-label="waiting to send" className="inline-flex text-warn">
      <ArrowUp aria-hidden="true" className="size-3.5" strokeWidth={2.6} />
    </span>
  );
}

/** The "Not synced: …" line under a refused entry. */
export function refusedText(reason: string) {
  return (
    <>
      <b className="font-bold">Not synced:</b> {reason}
    </>
  );
}
