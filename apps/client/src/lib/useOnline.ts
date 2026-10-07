import { useEffect, useState } from 'react';

/**
 * `navigator.onLine`, re-read when the browser says it changed. Moved out of AppShell
 * (task 1.20) so the admin management panels can disable an active-season/active-event
 * switch while offline (common.md: any action that switches the active context is
 * disabled while `!navigator.onLine`), without a second private copy of this hook.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    // A change between the first render and this subscription fires no event we hear.
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
