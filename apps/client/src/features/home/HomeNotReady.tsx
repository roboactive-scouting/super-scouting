import { CalendarCog } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SERVER_UNREACHABLE_LINE } from '@/auth/messages';
import { Skeleton } from '@/components/Skeleton';
import { buttonVariants } from '@/components/ui/button';
import type { GateState } from '@/features/shell/shellContext';
import { PATHS } from '@/lib/paths';
import { useOnline } from '@/lib/useOnline';

/** What Home says before the event is on the device (task 1.17b's states). */
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

/** Home while the shell resolves, loads or has no competition (README "No competition"). */
export function HomeNotReady({
  gate,
  admin,
}: {
  gate: 'resolving' | keyof typeof NOT_READY;
  admin: boolean;
}) {
  const online = useOnline();
  if (gate === 'resolving') {
    return <Skeleton rows={2} rowHeight="2.5rem" label="Checking the competition" />;
  }
  const copy = NOT_READY[gate];
  return (
    <section aria-labelledby="home-title" className="enter-rise">
      <h1
        id="home-title"
        className="text-[1.375rem] font-[750] tracking-[-0.02em] lg:text-[1.75rem]"
      >
        {copy.title}
      </h1>
      <p className="mt-2 max-w-prose text-muted">
        {/* An online device that got no answer is told the server did not answer, so nobody
            hunts for Wi-Fi that will not help (task 1.17b). */}
        {gate === 'blocked' && online ? SERVER_UNREACHABLE_LINE : copy.detail}
      </p>
      {gate === 'no-event' && admin && (
        <Link
          to={PATHS.manage}
          className={buttonVariants({ variant: 'primary', size: 'lg', className: 'mt-6' })}
        >
          <CalendarCog aria-hidden="true" />
          Set up a competition
        </Link>
      )}
    </section>
  );
}

/** True for the gate states HomeNotReady covers. */
export function notReady(gate: GateState): gate is 'resolving' | keyof typeof NOT_READY {
  return gate === 'resolving' || gate === 'loading' || gate === 'blocked' || gate === 'no-event';
}
