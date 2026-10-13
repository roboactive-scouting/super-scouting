import type { ReactNode } from 'react';
import type { Capability } from '@/data/offlineCapability';
import { useCapability } from '@/lib/useCapability';
import { cn } from '@/lib/utils';

/** The gate's line (task 1.45): it always says the data is safe on the device. */
export const OFFLINE_GATE_LINE =
  'This needs a connection. Everything you have entered is safe on this device and will sync when you are back online.';

/** The matrix as a hook (lib/useCapability.ts), offered beside the gate for its callers. */
export { useCapability };

/**
 * Wraps a server-only action (SPEC-FINAL 9.6, task 1.45). Online, `children(false)` renders as
 * it is. Offline, for a capability the matrix holds, `children(true)` renders — the caller
 * passes that to its `Button disabled` — with one muted status line beneath it that says the
 * data is safe on this device: the same compact notice Manage and the builder show, no button.
 * Without children it is that line on its own, placed where a screen keeps its one offline
 * message (the top of the page, as Manage's), for controls further down that read
 * `useCapability`. A screen that cannot show anything without the server keeps its full
 * `StateMessage variant="offline-needs-server"` instead.
 */
export function OfflineGate({
  capability,
  children,
  className,
}: {
  capability: Capability;
  children?: (held: boolean) => ReactNode;
  className?: string;
}) {
  const held = !useCapability(capability);
  return (
    <>
      {children?.(held)}
      {held && (
        <p role="status" className={cn('text-sm text-muted', className)}>
          {OFFLINE_GATE_LINE}
        </p>
      )}
    </>
  );
}
