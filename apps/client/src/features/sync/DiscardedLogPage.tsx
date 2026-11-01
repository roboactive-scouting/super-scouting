import { Archive, ChevronLeft } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { formatDayTime } from '@frc/shared';
import { Skeleton } from '@/components/Skeleton';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Note } from '@/components/ui/notice';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DiscardedRecord } from '@/data/db';
import {
  DISCARD_REASON,
  groupDiscarded,
  listDiscarded,
  WIPE_REASON,
  type DiscardedGroup,
} from '@/data/discarded';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { PATHS } from '@/lib/paths';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { DiscardedStation, DiscardedStatus, DiscardedTeam, kindLabel } from './DiscardedParts';

/**
 * `/sync/discarded` (19-discarded final, SPEC-FINAL 9.7): the read-only log of the entries this
 * device removed because an admin deleted what they belonged to. Opened from Sync only (the
 * notice's "See the log", More → Discarded records); never a nav row. Grouped by when the
 * records were removed, newest first, each group naming its competition. **No entered value is
 * shown** (user, 2026-10-12) — the device does not even keep them. No actions.
 */
export function DiscardedLogPage() {
  const desktop = useIsDesktop();
  const records = useDeviceQuery(listDiscarded, [], ['discarded']);
  const device = desktop ? 'this device' : 'this phone';

  return (
    <main className="flex w-full max-w-[71.25rem] flex-col gap-3.5 px-4 pt-3.5 pb-8 lg:px-8 lg:pt-6">
      <Link
        to={PATHS.sync}
        // Its 48 px hit area is taller than the drawn link: pulled into the page's top padding.
        className="hover-veil tap-target -mt-3 -mb-3 inline-flex w-fit items-center gap-1 rounded-control pe-2 text-[0.84375rem] font-[650] text-accent-ink"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Sync
      </Link>
      <header>
        <h1 className="text-[1.375rem] font-bold tracking-tight lg:text-[1.625rem]">
          Discarded records
        </h1>
        <p className="mt-0.5 text-[0.8125rem] text-muted lg:text-[0.875rem]">
          {records?.some((r) => r.reason === WIPE_REASON)
            ? `Records removed from ${device} before they reached the cloud.`
            : `Entries removed from ${device} because an admin deleted what they belonged to.`}{' '}
          Kept here for as long as the app is installed.
        </p>
      </header>

      {records === undefined ? (
        <Skeleton rows={4} label="Loading the discarded records" />
      ) : records.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="Nothing has been discarded"
          detail="An entry is only removed when an admin deletes the competition, season or form it belonged to. If that happens, it is listed here."
          action={
            <Link to={PATHS.sync} className={buttonVariants({ variant: 'secondary' })}>
              Back to Sync
            </Link>
          }
          className="lg:max-w-md"
        />
      ) : (
        <>
          {reasonsOf(records).map((reason) => (
            <Note key={reason} icon="info">
              {reason}
            </Note>
          ))}
          {desktop ? (
            <DiscardedTable groups={groupDiscarded(records)} />
          ) : (
            groupDiscarded(records).map((group) => (
              <DiscardedCards key={group.discarded_at + group.event_name} group={group} />
            ))
          )}
        </>
      )}
    </main>
  );
}

/**
 * The causes the log holds, each said once: an admin's delete (9.7) and, since v1.39, Wipe
 * anyway (9.9). A record from before reasons varied reads as the admin's delete.
 */
function reasonsOf(records: readonly DiscardedRecord[]): string[] {
  const reasons = new Set<string>(
    records.map((r) => (r.reason === WIPE_REASON ? WIPE_REASON : DISCARD_REASON)),
  );
  return [DISCARD_REASON, WIPE_REASON].filter((r) => reasons.has(r));
}

/** "Removed Sun 12 Oct, 08:02". */
const removedLabel = (group: DiscardedGroup) => `Removed ${formatDayTime(group.discarded_at)}`;

/** Phone: a group label with its competition at the right, then one card of records. */
function DiscardedCards({ group }: { group: DiscardedGroup }) {
  return (
    <section aria-label={`${removedLabel(group)} · ${group.event_name}`} className="grid gap-2">
      <h2 className="flex gap-2 px-0.5 pt-1 text-xs font-bold uppercase tracking-[0.05em] text-muted">
        {removedLabel(group)}
        <span dir="auto" className="ms-auto font-semibold normal-case tracking-normal">
          {group.event_name}
        </span>
      </h2>
      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {group.records.map((record) => (
          <DiscardedCard key={record.id} record={record} />
        ))}
      </ul>
    </section>
  );
}

function DiscardedCard({ record }: { record: DiscardedRecord }) {
  const s = record.summary;
  return (
    <li className="grid gap-1.5 border-b border-line-2 px-3 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {s.match ? (
          <span className="num text-[0.8125rem] font-semibold text-muted">{s.match}</span>
        ) : null}
        <DiscardedStation summary={s} />
        <DiscardedTeam summary={s} big />
        <span className="ms-auto flex shrink-0 items-center">
          <DiscardedStatus summary={s} />
        </span>
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[0.78125rem] text-muted">
        <span dir="auto">
          {kindLabel(s)} · {s.scouter}
        </span>
        <span>
          saved <span className="num">{formatDayTime(s.client_updated_at)}</span>
        </span>
      </div>
    </li>
  );
}

/** Computer: THEME "Data table", a `--bg` row heading each removal. Read only. */
function DiscardedTable({ groups }: { groups: DiscardedGroup[] }) {
  return (
    <Table readOnly containerClassName="rounded-card border border-line bg-surface">
      <TableHeader>
        <TableRow>
          <TableHead className="w-28 ps-4">Match</TableHead>
          <TableHead>Team</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Scouter</TableHead>
          <TableHead className="pe-4">Saved</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <Fragment key={group.discarded_at + group.event_name}>
            <TableRow className="bg-bg">
              <TableCell colSpan={5} className="h-8 px-4 text-xs font-bold text-muted">
                <span className="flex gap-2">
                  {removedLabel(group)}
                  <span dir="auto" className="ms-auto font-semibold">
                    {group.event_name}
                  </span>
                </span>
              </TableCell>
            </TableRow>
            {group.records.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="num ps-4 font-semibold">{record.summary.match}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <DiscardedStation summary={record.summary} />
                    <DiscardedTeam summary={record.summary} />
                  </div>
                </TableCell>
                <TableCell>
                  <DiscardedStatus summary={record.summary} />
                </TableCell>
                <TableCell dir="auto">{record.summary.scouter}</TableCell>
                <TableCell className="num pe-4 text-muted">
                  {formatDayTime(record.summary.client_updated_at)}
                </TableCell>
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
