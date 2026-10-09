import { timerConfig, type TimerConfig } from '../api/forms';

/**
 * SPEC-FINAL 8.4: the match timer of a form, `{"phases": [{"phase": "auto", "seconds": 15}, …]}`.
 * The same schema `updateForm` checks (`api/forms.ts`), not a second definition: each phase from
 * the field-phase vocabulary and named once, whole seconds from 1 to 3600, at most 8 phases. An
 * empty list means the form has no timer.
 */
export const timerConfigSchema = timerConfig;

/** One phase of the timer: the field-metadata phase it counts down. */
export type TimerPhaseName = TimerConfig['phases'][number]['phase'];

/** t_end is the sum of the phase durations; null means this form has no timer. */
export function matchEndSeconds(config: TimerConfig): number | null {
  if (config.phases.length === 0) return null;
  return config.phases.reduce((total, phase) => total + phase.seconds, 0);
}

/**
 * The phase the moment `t` (seconds from Start match) falls in: phases run consecutively in
 * list order, each from its start up to (not including) its end. Null at or after match end,
 * and always null with no timer.
 */
export function phaseAt(config: TimerConfig, t: number): TimerPhaseName | null {
  let elapsed = 0;
  for (const phase of config.phases) {
    if (t < elapsed + phase.seconds) return phase.phase;
    elapsed += phase.seconds;
  }
  return null;
}

/** A length in seconds as m:ss ("2:15"; 3600 is "60:00"). */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
