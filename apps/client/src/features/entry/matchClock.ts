/** Where `t = 0` is: the epoch millisecond it fell on, and whether Start match set it. */
export type ClockOrigin = { at: number; timed: boolean };

let origin: ClockOrigin | null = null;
const listeners = new Set<() => void>();

function set(next: ClockOrigin | null): void {
  origin = next;
  for (const listener of listeners) listener();
}

/**
 * The single source of `t = 0` for an entry (SPEC-FINAL 5.5, 8.4).
 *
 * - **Timed:** `t = 0` is the moment the sticky timer's **Start match** was pressed.
 * - **Un-timed:** the timer was never started, and `t = 0` is the **first event-log tap of the
 *   entry**, in whichever field it was made; every later tap, in every field, is seconds from
 *   it. That is why there is no first cycle from match start and no final open cycle then.
 *
 * One module-level origin for the entry on screen: `EntryPage` resets it as an entry opens and
 * as it closes, so one entry's origin never leaks into the next. Every time is read from
 * `Date.now()` against the stored origin, never by counting interval ticks, so a re-render or a
 * tab put to sleep never loses time. `subscribe` lets the sticky bar re-render when the origin
 * moves without every component polling.
 */
export const matchClock = {
  start(): void {
    set({ at: Date.now(), timed: true });
  },
  reset(): void {
    if (origin !== null) set(null);
  },
  isRunning(): boolean {
    return origin?.timed === true;
  },
  wasTimed(): boolean {
    return origin?.timed === true;
  },
  elapsed(): number | null {
    return origin === null ? null : (Date.now() - origin.at) / 1000;
  },
  /** Returns the t to store for a tap, establishing the un-timed origin if needed. */
  tapTime(_fieldKey: string): number {
    if (origin === null) {
      set({ at: Date.now(), timed: false });
      return 0;
    }
    return (Date.now() - origin.at) / 1000;
  },
  /** The origin as it stands, for an undo to hand back to `restore`. */
  snapshot(): ClockOrigin | null {
    return origin === null ? null : { ...origin };
  },
  /** Puts back an origin taken with `snapshot` (the timer reset's Undo). */
  restore(saved: ClockOrigin | null): void {
    set(saved === null ? null : { ...saved });
  },
  /** Calls `listener` whenever the origin changes; returns the unsubscribe. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** A draft's saved match clock, read defensively: a draft from before task 1.37 has none. */
export function asClockOrigin(value: unknown): ClockOrigin | null {
  if (typeof value !== 'object' || value === null) return null;
  const { at, timed } = value as Record<string, unknown>;
  return typeof at === 'number' && typeof timed === 'boolean' ? { at, timed } : null;
}
