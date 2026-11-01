import type { FormFieldDefinition, RobotStatus } from '@frc/shared';
import {
  BREAKDOWN_KEY,
  entryProblems,
  entryView,
  rangeBreach,
  type ProblemKind,
} from './entryRules';
import { seedValues } from './entryValues';
import { phasesOf } from './phases';

/*
 * No edit after 5 minutes (SPEC-FINAL 7.6 v1.45; Phase 1 H side task 5). A scouter's own match
 * entry left open runs down with its window (the countdown: `EditCountdown`), and at the mark the
 * form saves what can be saved and locks. Pure: the page holds the state and the clock. Only the
 * mark needs it, so it is in the timed parts' chunk (`timedParts.ts`), off the initial bundle.
 */

/** What the form holds: the robot status, the breakdown time and the scout's values. */
export type EntryState = {
  status: RobotStatus | null;
  breakdownSeconds: number | null;
  data: Record<string, unknown>;
};

export type Settled = EntryState & {
  /** The data the save sends: computed fields worked out, hidden fields left out; {} when dead. */
  saved: Record<string, unknown>;
  /** One "Not kept: …" line per change put back to its last saved value, in form order. */
  notKept: string[];
  /**
   * Still refused with every refused change put back: the saved entry itself fails a check now
   * (a field made required in place since). Nothing can be saved.
   */
  refused: boolean;
};

const dead = (status: RobotStatus | null) => status === 'no_show' || status === 'disabled';

/** "Not kept: High goal 40 is over 20." — the field, what was typed and why it cannot be saved. */
export function notKeptLine(field: FormFieldDefinition, kind: ProblemKind, value: unknown): string {
  if (kind === 'range') {
    const breach = rangeBreach(field, value);
    if (breach) {
      return `Not kept: ${field.label} ${breach.value} is ${breach.over ? 'over' : 'under'} ${breach.limit}.`;
    }
  }
  if (kind === 'running') return `Not kept: ${field.label} was still running.`;
  return `Not kept: ${field.label} is required and was left empty.`;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * At the 5-minute mark: what the form saves. Every change the save would refuse — the same checks
 * Review entry holds on (`entryProblems`: out of range, a required field emptied, a stopwatch still
 * running, Broke down with no time) — goes back to its last saved value and is named in a line;
 * everything else typed is kept. Putting a value back can show or hide another field, so the
 * checks run again until nothing is refused, or until only values that were never changed are.
 */
export function keepSavable({
  fields,
  last,
  typed,
  running,
}: {
  fields: readonly FormFieldDefinition[];
  /** The entry as last saved. */
  last: EntryState;
  /** The form as it stands at the mark. */
  typed: EntryState;
  /** Whether a Timer field's stopwatch is still running. */
  running: (key: string) => boolean;
}): Settled {
  const notKept: string[] = [];
  let status = typed.status;
  let breakdownSeconds = typed.breakdownSeconds;
  if (status === null || (status === 'broke_down' && breakdownSeconds === null)) {
    if (status !== null) notKept.push('Not kept: Broke down needs the time it stopped.');
    status = last.status;
    breakdownSeconds = last.breakdownSeconds;
  }
  const data = { ...typed.data };
  const refusedShape = status === null || (status === 'broke_down' && breakdownSeconds === null);
  if (refusedShape || dead(status)) {
    return { status, breakdownSeconds, data, saved: {}, notKept, refused: refusedShape };
  }

  const seeds = seedValues(fields);
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const putBack = new Set<string>();
  for (;;) {
    const values = { ...seeds, ...data };
    const view = entryView(fields, values);
    const problems = entryProblems({
      phases: phasesOf(view.shown),
      values,
      breakdownMissing: false,
      // A value put back is the saved one: its stopwatch no longer decides it.
      running: (key) => !putBack.has(key) && running(key),
    }).filter((p) => p.key !== BREAKDOWN_KEY);
    if (problems.length === 0) {
      return { status, breakdownSeconds, data, saved: view.saved, notKept, refused: false };
    }
    const fresh = problems.filter((p) => !putBack.has(p.key));
    if (fresh.length === 0) {
      return { status, breakdownSeconds, data, saved: view.saved, notKept, refused: true };
    }
    for (const p of fresh) {
      putBack.add(p.key);
      const field = byKey.get(p.key);
      const before = { ...seeds, ...last.data }[p.key];
      // A running stopwatch's time is not in its value yet: it is always named.
      if (field && (p.kind === 'running' || !same(values[p.key], before))) {
        notKept.push(notKeptLine(field, p.kind, values[p.key]));
      }
      if (Object.hasOwn(last.data, p.key)) data[p.key] = last.data[p.key];
      else delete data[p.key];
    }
  }
}
