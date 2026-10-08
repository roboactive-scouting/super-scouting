import { useEffect } from 'react';
import type { MatchRow } from '@frc/shared';
import { useBlocker } from 'react-router-dom';
import { UnsavedConfirm } from './UnsavedConfirm';

/**
 * Leaving Manage for another page while line-ups are "Not saved" or still being sent asks
 * first (RB.17 fixes 2–3). A reload or a closed tab gets the browser's own "Leave site?"
 * (`beforeunload`, held only while there is something to lose).
 */
export function LeaveGuard({
  matches,
  unsaved,
}: {
  matches: readonly MatchRow[];
  unsaved: ReadonlySet<string>;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      unsaved.size > 0 && currentLocation.pathname !== nextLocation.pathname,
  );
  const holding = unsaved.size > 0;
  useEffect(() => {
    if (!holding) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = true; // browsers before Chrome 119 ask only when this is set
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [holding]);
  return (
    <UnsavedConfirm
      open={blocker.state === 'blocked'}
      action="leave"
      matches={matches}
      unsaved={unsaved}
      onStay={() => blocker.reset?.()}
      onGo={() => blocker.proceed?.()}
    />
  );
}
