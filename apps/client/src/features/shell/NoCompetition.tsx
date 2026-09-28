import { Link } from 'react-router-dom';
import { PRIMARY_BUTTON } from '@/components/buttonStyles';

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
    <div className="p-8 text-center">
      <h1 className="text-lg font-semibold" dir="auto">
        No competition is set up yet
      </h1>
      <p className="text-[var(--text-muted)]" dir="auto">
        An admin sets up the season and competition. This device loads it the next time it is
        online.
      </p>
      {canSetUp && (
        <p className="mt-4">
          <Link to="/admin/manage" className={PRIMARY_BUTTON}>
            Set up a competition
          </Link>
        </p>
      )}
    </div>
  );
}
