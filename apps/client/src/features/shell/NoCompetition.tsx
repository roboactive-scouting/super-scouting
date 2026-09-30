import { CalendarX2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { ShellState } from './ShellState';

/**
 * The shell's gate when the server says no competition is set up (task 1.17b): the
 * `app_settings` singleton names no event. It is not an offline state and never says
 * anything about a connection — the device got its answer.
 *
 * `canSetUp` is `canManageEvents(user)` on the signed-in user (task 1.20): only an admin
 * gets the way out of this screen, to `/admin/manage` (marked `handle: NO_HYDRATION`, so
 * it is reachable from here).
 */
export function NoCompetition({ canSetUp }: { canSetUp: boolean }) {
  return (
    <ShellState glyph={CalendarX2} title="No competition is set up yet">
      <p className="mt-2 text-sm text-text-muted" dir="auto">
        An admin sets up the season and competition. This device loads it the next time it is
        online.
      </p>
      {canSetUp && (
        <Link to="/admin/manage" className={`${buttonVariants({ variant: 'primary' })} mt-6`}>
          Set up a competition
        </Link>
      )}
    </ShellState>
  );
}
