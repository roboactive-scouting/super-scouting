/** The three series SPEC-FINAL 5.5 derives per event type, for one entry's event-log field. */
export type CycleSeries = { count: number; durations: number[]; timeToFirst: number | null };

/** One tap as the engine reads it: `EventLogTap` (forms/types) satisfies it. */
export type CycleTap = { type: string; t: number };

/**
 * SPEC-FINAL 5.5. Timed and un-timed are genuinely different series, not a special case.
 * For one event type with taps at t₁ ≤ t₂ ≤ … ≤ tₙ:
 *
 * - **Timed:** cycle₁ = t₁ − 0, cycleₖ = tₖ − tₖ₋₁, and the final open cycle closes at match
 *   end, t_end − tₙ. With `tEnd` null (no timer config) there is no final open cycle, and a
 *   last tap after `tEnd` closes none either: a negative cycle is not a cycle.
 * - **Un-timed:** t₁ = 0 by definition, so there is no first cycle from match start and no
 *   final open cycle: cycleₖ = tₖ − tₖ₋₁ for k = 2…n. `timeToFirst` exists only when timed.
 *
 * Taps of other types are ignored entirely, and so is a tap whose `t` is not a finite number
 * of seconds, 0 or more (it has no place in the match: t = 0 is match start, or the first tap). No taps of the type: `{ count: 0, durations: [], timeToFirst:
 * null }`, so every aggregation of `durations` is null. A no-show or disabled robot holds no
 * taps at all: hand this only entries `applyFilters` kept, or its `count` of 0 becomes a zero.
 */
export function deriveCycles(
  taps: readonly CycleTap[],
  eventType: string,
  timed: boolean,
  tEnd: number | null,
): CycleSeries {
  const times = taps
    .filter((tap) => tap.type === eventType && Number.isFinite(tap.t) && tap.t >= 0)
    .map((tap) => tap.t)
    .sort((a, b) => a - b);
  if (times.length === 0) return { count: 0, durations: [], timeToFirst: null };

  const durations: number[] = [];
  const first = times[0]!;
  const last = times[times.length - 1]!;
  if (timed) durations.push(first); // cycle 1 from match start
  for (let i = 1; i < times.length; i += 1) durations.push(times[i]! - times[i - 1]!);
  if (timed && tEnd !== null && Number.isFinite(tEnd) && tEnd >= last) {
    durations.push(tEnd - last); // the final open cycle
  }

  return { count: times.length, durations, timeToFirst: timed ? first : null };
}
