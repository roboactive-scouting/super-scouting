import { CalendarCog, ClipboardPen, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/Skeleton';
import { buttonVariants } from '@/components/ui/button';
import { canManageEvents } from '@/features/admin/AdminOnly';
import { useSessionOverride } from '@/features/context/sessionOverride';
import { useEventName } from '@/features/context/useEventName';
import { useShellContext } from '@/features/shell/shellContext';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';

/** What the top of Home says before the event is on the device (task 1.17b's states). */
const NOT_READY = {
  loading: {
    title: 'Loading the competition onto this device',
    detail: 'This happens once, and takes a few seconds.',
  },
  blocked: {
    title: 'This device has not loaded the competition yet',
    detail: 'It needs a connection once. After that it works with no network at all.',
  },
  'no-event': {
    title: 'No competition yet',
    detail:
      'An admin sets up the season and competition. This device loads it the next time it is online.',
  },
} as const;

const ACTION = 'lg' as const;

/**
 * The top of Home: which competition this device works on, and the one thing to do next
 * (SPEC-FINAL 17.9: one job, a calm document). Scout is the primary action; under a session
 * override it is withheld, because no new entry may be made then (6.3).
 */
export function HomeSummary() {
  const { user, eventId, gate } = useShellContext();
  const override = useSessionOverride();
  const eventName = useEventName(eventId, gate);
  const admin = canManageEvents(user);

  if (gate === 'resolving') {
    return <Skeleton rows={2} rowHeight="2.5rem" label="Checking the competition" />;
  }

  if (gate === 'loading' || gate === 'blocked' || gate === 'no-event') {
    const copy = NOT_READY[gate];
    return (
      <section aria-labelledby="home-title" className="enter-rise border-b border-border pb-8">
        <h1 id="home-title" className="text-2xl font-semibold tracking-tight">
          {copy.title}
        </h1>
        <p className="mt-2 max-w-prose text-text-muted">{copy.detail}</p>
        {gate === 'no-event' && admin && (
          <Link
            to={PATHS.manage}
            className={cn(buttonVariants({ variant: 'primary', size: ACTION }), 'mt-6')}
          >
            <CalendarCog aria-hidden="true" />
            Set up a competition
          </Link>
        )}
      </section>
    );
  }

  const name = eventName ?? 'this competition';
  return (
    <section aria-labelledby="home-title" className="enter-rise border-b border-border pb-8">
      <p className="text-sm font-medium text-text-muted">
        {override ? 'For this session, you are looking at' : 'This device is working on'}
      </p>
      <h1 id="home-title" dir="auto" className="mt-1 text-3xl font-semibold tracking-tight">
        {override ? (override.eventName ?? 'another competition') : name}
      </h1>
      <p className="mt-2 max-w-prose text-text-muted" dir="auto">
        {override
          ? `New entries are paused while you look at another competition. They can only be made in ${name}.`
          : 'Everything you enter is saved on this device first, and sent when there is a connection.'}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {!override && (
          <Link to={PATHS.scout} className={buttonVariants({ variant: 'primary', size: ACTION })}>
            <ClipboardPen aria-hidden="true" />
            Scout a match
          </Link>
        )}
        <Link to={PATHS.entries} className={buttonVariants({ variant: 'secondary', size: ACTION })}>
          <ListChecks aria-hidden="true" />
          Review entries
        </Link>
        {admin && (
          <Link to={PATHS.manage} className={buttonVariants({ variant: 'ghost', size: ACTION })}>
            <CalendarCog aria-hidden="true" />
            Manage competitions
          </Link>
        )}
      </div>
    </section>
  );
}
