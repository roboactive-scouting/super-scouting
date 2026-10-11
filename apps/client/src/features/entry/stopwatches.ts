/** One Timer field's stopwatch: the seconds banked before this run, and when this run began. */
export type StopwatchRun = { base: number; startedAt: number | null };

const runs = new Map<string, StopwatchRun>();

/**
 * The running state of the entry's Timer fields (SPEC-FINAL 5.2), by field key. It lives outside
 * the component so a stopwatch keeps going while its phase is off screen (the entry draws one
 * phase at a time). Every reading is `base` plus `Date.now()` minus the run's start — never a
 * sum of interval ticks — so a re-render or a sleeping tab never loses time. `EntryPage` clears
 * it as an entry opens and closes, with the match clock.
 */
export const stopwatches = {
  get(key: string): StopwatchRun | undefined {
    return runs.get(key);
  },
  running(key: string): boolean {
    return runs.get(key)?.startedAt != null;
  },
  /** Starts (or resumes) counting up from `base` seconds. */
  start(key: string, base: number): void {
    runs.set(key, { base, startedAt: Date.now() });
  },
  /** Stops the run and banks it; returns the seconds banked. */
  pause(key: string): number {
    const seconds = stopwatches.seconds(key) ?? 0;
    runs.set(key, { base: seconds, startedAt: null });
    return seconds;
  },
  /** Sets the banked seconds of a stopped stopwatch (✎ corrects a late stop). */
  bank(key: string, seconds: number): void {
    runs.set(key, { base: seconds, startedAt: null });
  },
  /** The seconds so far, or null for a stopwatch never started. */
  seconds(key: string, now: number = Date.now()): number | null {
    const run = runs.get(key);
    if (!run) return null;
    return run.base + (run.startedAt === null ? 0 : (now - run.startedAt) / 1000);
  },
  clear(key: string): void {
    runs.delete(key);
  },
  resetAll(): void {
    runs.clear();
  },
};
