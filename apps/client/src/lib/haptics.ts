import { vibrateOnTap } from './devicePrefs';

type MaybeVibrate = { vibrate?: (pattern: number | number[]) => boolean };

/** True where the phone can vibrate. iOS Safari has no `navigator.vibrate`. */
export function canVibrate(): boolean {
  return typeof (navigator as MaybeVibrate).vibrate === 'function';
}

/**
 * A short buzz on a tap (SPEC-FINAL 8.6; task 1.38): the scout feels the counter count in a
 * loud arena. Only while "Vibrate on taps" is on; a silent no-op where the phone cannot vibrate
 * or the browser refuses. It never throws: a tap must always count.
 */
export const haptics = {
  tap(): void {
    try {
      if (!vibrateOnTap.get()) return;
      (navigator as MaybeVibrate).vibrate?.(10);
    } catch {
      // A refusing browser changes nothing about the tap itself.
    }
  },
};
