import { useSyncExternalStore } from 'react';

/**
 * This device's own settings (SPEC-FINAL 8.6, 17.4; task 1.38): the theme, the text size, Keep
 * the screen on and Vibrate on taps. Nothing here goes to the server or to another device.
 *
 * Kept in `localStorage`, not IndexedDB: the theme and the text size are read synchronously in
 * `main.tsx` before the first paint, so the app never flashes in the wrong look. Storage may
 * refuse (private mode, blocked site data): the value then lives in memory for the session and
 * the default comes back next time. Every key starts with `device.`, so the device wipe (task
 * 1.49) can clear them with `clearDevicePrefs()`.
 */
const PREFIX = 'device.';

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

export function readPref(name: string): string | null {
  try {
    const stored = window.localStorage.getItem(PREFIX + name);
    if (stored !== null) return stored;
  } catch {
    // Storage refused: fall back to what this session set.
  }
  return memory.get(name) ?? null;
}

export function writePref(name: string, value: string): void {
  memory.set(name, value);
  try {
    window.localStorage.setItem(PREFIX + name, value);
  } catch {
    // Private mode or blocked storage: remembered for this session only.
  }
  notify();
}

/** Calls `listener` whenever a setting changes, here or in another tab; returns the unsubscribe. */
export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(PREFIX)) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Removes every device setting (the device wipe, task 1.49; tests). */
export function clearDevicePrefs(): void {
  memory.clear();
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Nothing stored to clear.
  }
  notify();
}

/** An on / off device setting with its default. */
export type BoolPref = {
  get: () => boolean;
  set: (on: boolean) => void;
};

function boolPref(name: string, fallback: boolean): BoolPref {
  return {
    get: () => {
      const stored = readPref(name);
      return stored === null ? fallback : stored === 'true';
    },
    set: (on) => writePref(name, String(on)),
  };
}

/** Keep the screen on while an entry is open (SPEC-FINAL 8.6). On by default. */
export const keepScreenOn = boolPref('keepScreenOn', true);

/** Vibrate on taps (SPEC-FINAL 8.6). On by default; only felt where the phone can vibrate. */
export const vibrateOnTap = boolPref('vibrateOnTap', true);

/**
 * The QR receiver's beep when a batch is complete (21-qr-receive final, SPEC-FINAL 9.8; task
 * 1.48): its head's "Sound on". On by default.
 */
export const qrSound = boolPref('qrSound', true);

/** A device setting, kept current. */
export function useBoolPref(pref: BoolPref): boolean {
  return useSyncExternalStore(subscribePrefs, pref.get, pref.get);
}
