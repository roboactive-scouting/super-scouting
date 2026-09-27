import { useEffect, useState } from 'react';
import { cachedEventName } from '@/data/cache';

/**
 * The cached name of `eventId`, or null while it is read or when the device holds no row
 * for it. `refresh` re-reads it: the shell passes its gate, so a name that arrives with a
 * pull shows without a remount.
 */
export function useEventName(eventId: string | null, refresh?: unknown): string | null {
  const [name, setName] = useState<{ eventId: string; name: string | null } | null>(null);
  useEffect(() => {
    if (eventId === null) return;
    let live = true;
    void cachedEventName(eventId).then((found) => {
      if (live) setName({ eventId, name: found });
    });
    return () => {
      live = false;
    };
  }, [eventId, refresh]);
  // Never the previous event's name for a new id while the new one is read.
  return name !== null && name.eventId === eventId ? name.name : null;
}
