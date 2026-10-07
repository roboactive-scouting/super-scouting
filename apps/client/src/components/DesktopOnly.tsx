import { Monitor } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PATHS } from '@/lib/paths';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { buttonVariants } from './ui/button';
import { EmptyState } from './ui/empty-state';

/**
 * SPEC-FINAL 17.2: builders unlock at 1024 px; anything narrower gets one clear panel.
 * The width decides, never the user agent (17.3). Device gating is not a permission
 * (7.4): the page inside still checks the role, and the server checks it again.
 *
 * THEME "Desktop-only gate": the empty-state card with a monitor icon, "This needs a
 * computer", the explanation and a secondary "Back to scouting" (no dead ends, 17.8).
 *
 * `what` is written as it reads mid-sentence, e.g. "the form builder".
 */
export function DesktopOnly({ what, children }: { what: string; children: ReactNode }) {
  const wide = useMediaQuery(DESKTOP_QUERY, true);
  if (wide) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md px-4 pt-9 pb-6">
      <EmptyState
        icon={Monitor}
        headingLevel={1}
        title="This needs a computer"
        detail={`Open ${what} on a screen at least 1024 pixels wide. It is pre-competition work, done sitting down. Phones do the competition job — entering, browsing and reading — and this is not one of those.`}
        action={
          <Link to={PATHS.scout} className={buttonVariants({ variant: 'secondary' })}>
            Back to scouting
          </Link>
        }
      />
    </div>
  );
}
