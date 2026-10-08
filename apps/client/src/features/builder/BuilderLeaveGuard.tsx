import { useEffect, type RefObject } from 'react';
import { useBlocker } from 'react-router-dom';
import { DestructiveConfirm } from '@/components/ui/destructive-confirm';

/**
 * Leaving the builder — another page, or another version of this form — with unsaved changes
 * asks first; a reload or a closed tab gets the browser's own "Leave site?". The same pattern
 * as Manage's LeaveGuard (RB.17), which names line-ups and so does not fit a form. `skip` is set
 * by the builder itself before it moves on purpose (a save that started a new draft).
 */
export function BuilderLeaveGuard({
  holding,
  name,
  skip,
}: {
  holding: boolean;
  /** The form and version, named in the dialog: "Match form 2026 · draft v4". */
  name: string;
  skip: RefObject<boolean>;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      holding &&
      !skip.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
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
    <DestructiveConfirm
      open={blocker.state === 'blocked'}
      title="Leave without saving?"
      objectName={name}
      body="Your changes to this form are not saved. Leaving drops them."
      confirmLabel="Leave anyway"
      cancelLabel="Stay"
      icon={null}
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    />
  );
}
