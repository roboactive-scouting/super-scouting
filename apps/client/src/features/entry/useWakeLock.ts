import { useEffect, useState } from 'react';

type Sentinel = { released?: boolean; release: () => Promise<void> };
type MaybeWakeLock = { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } };

/**
 * No dimming mid-match (SPEC-FINAL 8.6; task 1.38): while `enabled`, holds a screen wake lock.
 * The browser drops the lock whenever the page is hidden, so it is asked for again each time
 * the page comes back. Released on unmount. Every call is guarded: Safari may lack the API or
 * refuse it (low battery, not allowed), and then the screen simply dims as it always did.
 * Returns whether a lock is held, so a page can say "Screen stays on" only when it is true
 * (the QR sender, task 1.47).
 */
export function useWakeLock(enabled: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let lock: Sentinel | null = null;

    const release = (sentinel: Sentinel | null) => {
      if (!sentinel || sentinel.released === true) return;
      try {
        void sentinel.release().catch(() => undefined);
      } catch {
        // Already gone.
      }
    };

    const request = async () => {
      try {
        const api = (navigator as MaybeWakeLock).wakeLock;
        if (!api || document.visibilityState !== 'visible') return;
        const next = await api.request('screen');
        if (!live) {
          release(next);
          return;
        }
        const previous = lock;
        lock = next;
        release(previous);
        setHeld(true);
      } catch {
        // Refused or unsupported: the screen dims as usual.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisibility);
      release(lock);
      lock = null;
      setHeld(false);
    };
  }, [enabled]);
  return enabled && held;
}
