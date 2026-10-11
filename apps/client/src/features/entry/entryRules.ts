import { isVisible, type FieldPhase, type FormFieldDefinition } from '@frc/shared';
import { previewData } from './entryValues';
import { isFilled, type Phase } from './phases';

/*
 * The entry form's rules (SPEC-FINAL 5.8, 8.2, 15.1; task 1.36): what is shown, what is saved,
 * and what blocks Review entry. Pure: the page holds the state, this only reads it.
 */

/** Why Review entry is held: a value out of range, a required field unanswered, a running stopwatch, or a Broke down with no time. */
export type ProblemKind = 'range' | 'required' | 'running' | 'breakdown';

export type Problem = {
  /** The field's key; `breakdown_seconds` for the robot status's breakdown time. */
  key: string;
  label: string;
  /** The phase tab the field is in; null for the robot status block above the tabs. */
  phase: FieldPhase | null;
  kind: ProblemKind;
  /** The problems list's reason, after the phase: "140 is over the most, 60". */
  reason: string;
  /** The line under the field itself: "Most is 60 seconds — check this number". */
  line: string;
};

/** The key the breakdown time's problem carries (it is a column, not a field of the form). */
export const BREAKDOWN_KEY = 'breakdown_seconds';

/**
 * What the form shows and what it saves, from the values as the controls hold them (the form's
 * starting values under the scout's own). `saved` is the shared definition of an entry's data
 * (`previewData`: a hidden field records no value, a computed field is worked out, SPEC-FINAL
 * 5.7–5.8), kept to the fields `shown`; `shown` is every field whose condition holds on it.
 */
export function entryView(
  fields: readonly FormFieldDefinition[],
  values: Record<string, unknown>,
): { shown: FormFieldDefinition[]; saved: Record<string, unknown> } {
  const previewed = previewData(fields, values);
  const shown = fields.filter((field) => isVisible(field, previewed));
  const keys = new Set(shown.map((field) => field.key));
  const saved = Object.fromEntries(Object.entries(previewed).filter(([key]) => keys.has(key)));
  return { shown, saved };
}

/** The unit as a word after a number, where it reads as one ("60 seconds"; a count is bare). */
const UNIT_WORD: Partial<Record<string, string>> = { seconds: 'seconds', points: 'points' };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * A number or counter outside its limits (SPEC-FINAL 15.1): the input's own `config` min / max
 * first, then the `expected_range` — the order `validateEntryData` checks them in. Null when the
 * value is inside both, or not a number.
 */
export function rangeProblem(
  field: FormFieldDefinition,
  value: unknown,
): { reason: string; line: string } | null {
  if (field.type !== 'number' && field.type !== 'counter') return null;
  const v = num(value);
  if (v === undefined) return null;
  const unit = field.unit ? UNIT_WORD[field.unit] : undefined;
  const word = (n: number) => (unit ? `${n} ${unit}` : String(n));
  const bounds: [number | undefined, number | undefined][] = [
    [num(field.config.min), num(field.config.max)],
    [field.expected_range?.min, field.expected_range?.max],
  ];
  for (const [lo, hi] of bounds) {
    if (hi !== undefined && v > hi)
      return {
        reason: `${v} is over the most, ${hi}`,
        line: `Most is ${word(hi)} — check this number`,
      };
    if (lo !== undefined && v < lo)
      return {
        reason: `${v} is under the least, ${lo}`,
        line: `Least is ${word(lo)} — check this number`,
      };
  }
  return null;
}

/** What a missed required field says under itself, by what answering it takes. */
export function requiredLine(field: FormFieldDefinition): string {
  switch (field.type) {
    case 'single_select':
    case 'rating':
      return 'Required — pick one';
    case 'multi_select':
      return 'Required — pick at least one';
    case 'timer':
      return 'Required — time it, or switch on Unsure';
    case 'event_log':
    case 'position':
    case 'cycle_path':
      return 'Required — mark at least one';
    default:
      return 'Required — fill it in';
  }
}

/**
 * Answered: anything held. A Timer's null is "unsure — no time", the scout's deliberate
 * answer (SPEC-FINAL 5.2), so it answers a required Timer; never touched is absent.
 */
export function isAnswered(field: FormFieldDefinition, value: unknown): boolean {
  if (field.type === 'timer' && value === null) return true;
  return isFilled(value);
}

/**
 * Everything that holds Review entry, in the order the scout meets it: the breakdown time,
 * then each shown phase's fields in form order. Every problem, never just the first (§8.2).
 * A dead robot has none — the caller skips this for No show and Disabled (§8.2).
 */
export function entryProblems({
  phases,
  values,
  breakdownMissing,
  running,
}: {
  /** The shown phases (`phasesOf(entryView(...).shown)`). */
  phases: readonly Phase[];
  values: Record<string, unknown>;
  /** Broke down with no breakdown time (SPEC-FINAL 3.5). */
  breakdownMissing: boolean;
  /** Whether a Timer field's stopwatch is still running. */
  running: (key: string) => boolean;
}): Problem[] {
  const problems: Problem[] = [];
  if (breakdownMissing) {
    problems.push({
      key: BREAKDOWN_KEY,
      label: 'Breakdown time',
      phase: null,
      kind: 'breakdown',
      reason: 'Broke down needs the time it stopped',
      line: 'Required — seconds from match start',
    });
  }
  for (const phase of phases) {
    for (const field of phase.fields) {
      if (field.type === 'section' || field.type === 'computed') continue;
      const value = values[field.key];
      const base = { key: field.key, label: field.label, phase: phase.key };
      if (field.type === 'timer' && running(field.key)) {
        problems.push({
          ...base,
          kind: 'running',
          reason: 'still running — stop it',
          line: 'Still running — stop it',
        });
        continue;
      }
      if (!isAnswered(field, value)) {
        if (field.required)
          problems.push({
            ...base,
            kind: 'required',
            reason: 'required, not answered',
            line: requiredLine(field),
          });
        continue;
      }
      const range = rangeProblem(field, value);
      if (range) problems.push({ ...base, kind: 'range', ...range });
    }
  }
  return problems;
}
