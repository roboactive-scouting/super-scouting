import { Archive, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatWeekdayTime } from '@frc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import type { DiscardedRecord } from '@/data/db';
import { dismissDiscarded, undismissedDiscarded, UNKNOWN_SCOUTER } from '@/data/discarded';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { PATHS } from '@/lib/paths';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';

/** THEME "Discarded notice": its two 32 px secondary buttons. */
const MINI = 'min-h-8 gap-1.5 px-2.5 text-[0.78125rem] font-[650] [&_svg]:size-3.5';

/** "Q12 · 3075 Ha-Dream Team · Noa · Fri 14:20" — what went, without anything entered. */
export function discardedLine(record: DiscardedRecord): string {
  const s = record.summary;
  const scouter =
    s.scouter === UNKNOWN_SCOUTER ? s.scouter : (s.scouter.split(' ')[0] ?? s.scouter);
  return [
    s.form_kind === 'super' ? 'Super' : (s.match ?? 'Match'),
    s.team,
    scouter,
    formatWeekdayTime(s.client_updated_at),
  ].join(' · ');
}

/**
 * SPEC-FINAL 9.7: the dismissible notice that says, out loud, which entries this device removed
 * because an admin deleted what they belonged to (17-sync final, image 3; THEME "Discarded
 * notice"). It lists the records nobody has dismissed yet and renders nothing when there are
 * none. **Dismiss** hides them from the notice only — the log (`/sync/discarded`, **See the
 * log**) keeps them for the life of the install. Task 1.43 places it on Sync's Problems tab.
 */
export function DiscardedNotice({
  deviceNoun,
  className,
}: {
  /** "this phone" on a phone, "this device" on a computer, unless the page says otherwise. */
  deviceNoun?: string;
  className?: string;
}) {
  const desktop = useIsDesktop();
  const records = useDeviceQuery(undismissedDiscarded, [], ['discarded']);
  if (!records || records.length === 0) return null;
  const device = deviceNoun ?? (desktop ? 'this device' : 'this phone');
  const one = records.length === 1;

  return (
    <section
      aria-label="Discarded entries"
      className={cn(
        'flex items-start gap-2.5 rounded-card border border-warn/25 bg-warn-tint px-3 py-2.5 text-[0.8125rem] leading-[1.4] text-ink',
        className,
      )}
    >
      <TriangleAlert aria-hidden="true" className="mt-px size-[18px] shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p>
          <b className="font-bold">
            {one ? '1 entry was' : `${records.length} entries were`} removed from {device}.
          </b>{' '}
          An admin deleted the event {one ? 'it' : 'they'} belonged to, so {one ? 'it' : 'they'}{' '}
          can’t be sent.
        </p>
        <ul className="mt-1.5 list-disc ps-4 text-[0.78125rem] text-ink-2">
          {records.map((record) => (
            <li key={record.id} dir="auto">
              {discardedLine(record)}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            className={MINI}
            onClick={() => void dismissDiscarded(records.map((r) => r.id))}
          >
            Dismiss
          </Button>
          <Link
            to={PATHS.syncDiscarded}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), MINI)}
          >
            <Archive aria-hidden="true" />
            See the log
          </Link>
        </div>
      </div>
    </section>
  );
}
