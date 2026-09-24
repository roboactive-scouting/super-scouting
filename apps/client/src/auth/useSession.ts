import { useEffect, useState } from 'react';
import { session, type Session } from './session';

/**
 * The current session, live. `undefined` while IndexedDB is being read (a few ms on
 * start), then `null` (no one signed in) or the session.
 */
export function useSession(): Session | null | undefined {
  const [current, setCurrent] = useState<Session | null | undefined>(undefined);
  useEffect(() => session.subscribe(setCurrent), []);
  return current;
}
