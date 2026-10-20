import { useEffect, useState } from 'react';

/**
 * The wall clock, re-read every `everyMs` while `active`: it only re-renders a ticking display.
 * What is shown is always computed from timestamps, so a dropped tick (a sleeping tab) costs a
 * stale frame, never time.
 */
export function useNow(active: boolean, everyMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs]);
  return active ? Date.now() : now;
}
