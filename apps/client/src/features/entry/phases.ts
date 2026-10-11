import {
  NO_VALUE,
  selectOptions,
  type FieldPhase,
  type FormFieldDefinition,
  type RobotStatus,
} from '@frc/shared';
import { shouldDismiss } from '@/components/ui/drag-dismiss';
import { computedText } from './inputs/ComputedValue';
import { STAR_WORDS } from './inputs/RatingInput';

/** The order a match is played in; a phase with no fields gets no tab (Entry README). */
export const PHASE_ORDER: readonly FieldPhase[] = ['auto', 'teleop', 'endgame', 'post_match'];

/** The tab's word. `post_match` is "Notes" in the design (DEVIATIONS RB.8). */
export const PHASE_TAB: Record<FieldPhase, string> = {
  auto: 'Auto',
  teleop: 'Teleop',
  endgame: 'Endgame',
  post_match: 'Notes',
};

/** The phase's full name: the pane header, the summary panel and the confirm groups. */
export const PHASE_NAME: Record<FieldPhase, string> = {
  auto: 'Autonomous',
  teleop: 'Teleop',
  endgame: 'Endgame',
  post_match: 'Notes',
};

export const STATUS_LABEL: Record<RobotStatus, string> = {
  played: 'Played',
  broke_down: 'Broke down',
  disabled: 'Disabled',
  no_show: 'No show',
};

/** Robot status in the order the segmented control shows it. */
export const STATUS_ORDER: readonly RobotStatus[] = ['played', 'broke_down', 'disabled', 'no_show'];

export type Phase = { key: FieldPhase; fields: FormFieldDefinition[] };

/**
 * The phase a field is drawn in. A data field: its `phase` (none → Notes). A section heading
 * holds no metadata (SPEC-FINAL 5.4), so it sits with the data field after it, else the one
 * before it — where the builder puts it (`phaseOfIndex`). A phase of headings alone gets no tab.
 */
function phaseAt(fields: readonly FormFieldDefinition[], index: number): FieldPhase {
  const own = fields[index]!;
  if (own.type !== 'section') return own.phase ?? 'post_match';
  const after = fields.slice(index + 1).find((f) => f.type !== 'section');
  const before = fields
    .slice(0, index)
    .reverse()
    .find((f) => f.type !== 'section');
  return (after ?? before)?.phase ?? 'post_match';
}

/** The form's phases in match order, each with its fields; a field without a phase is a note. */
export function phasesOf(fields: readonly FormFieldDefinition[]): Phase[] {
  const at = fields.map((_, i) => phaseAt(fields, i));
  return PHASE_ORDER.map((key) => ({
    key,
    fields: fields.filter((_, i) => at[i] === key),
  })).filter((p) => p.fields.some((f) => f.type !== 'section'));
}

/** The fields a scout fills: not a section (no value) nor a computed one (worked out). */
export function scoutedFields(phase: Phase): FormFieldDefinition[] {
  return phase.fields.filter((f) => f.type !== 'section' && f.type !== 'computed');
}

/**
 * A field is filled once it holds anything: a 0 the scout chose counts, an empty text or an
 * empty multi-select (every option taken back) does not.
 */
export function isFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '';
}

export function filledCount(phase: Phase, data: Record<string, unknown>): number {
  // A Timer's null is "unsure — no time": answered (SPEC-FINAL 5.2), so it counts as filled.
  return scoutedFields(phase).filter(
    (f) => isFilled(data[f.key]) || (f.type === 'timer' && data[f.key] === null),
  ).length;
}

/** The phases with at least one field set: each tab shows a ✓. */
export function donePhases(
  phases: readonly Phase[],
  data: Record<string, unknown>,
): Set<FieldPhase> {
  return new Set(phases.filter((p) => filledCount(p, data) > 0).map((p) => p.key));
}

/**
 * Which way a finished sideways drag moves through the phases: +1 (swiped left: next), -1
 * (swiped right: previous) or 0 (springs back). It takes the distance or flick a sheet's
 * dismiss takes (drag-dismiss): 30 % of the pane's `width`, at most 120 px, or 0.5 px/ms.
 * `velocity` is the drag's speed along x (px per ms, negative to the left).
 */
export function swipeStep(dx: number, velocity: number, width: number): -1 | 0 | 1 {
  if (!shouldDismiss(Math.abs(dx), Math.sign(dx) * velocity, width)) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * How a field's value reads in the confirm list: what its control shows. An untouched counter
 * reads 0 and an untouched switch "No" (they are not "filled" for the ✓ and the counts, but
 * the scout saw 0 / off, so that is what the confirm prints); text and choices read "—".
 */
export function displayValue(field: FormFieldDefinition, value: unknown): string {
  // A computed value reads as its row on the form does: a whole number bare, else 2 places.
  if (field.type === 'computed')
    return computedText(typeof value === 'number' || typeof value === 'string' ? value : null);
  // A Timer's null is its "unsure — no time" answer (SPEC-FINAL 5.2).
  if (field.type === 'timer' && value === null) return 'Unsure';
  if (!isFilled(value)) {
    if (field.type === 'counter') return '0';
    if (field.type === 'toggle') return 'No';
    return NO_VALUE;
  }
  if (field.type === 'toggle') return value === true ? 'Yes' : 'No';
  // A five-step rating reads as its word, as the stars say it ("Good"); any other, "4 of 7".
  if (field.type === 'rating' && typeof value === 'number') {
    const max = typeof field.config.max === 'number' ? field.config.max : 5;
    return max === 5 ? (STAR_WORDS[value - 1] ?? String(value)) : `${value} of ${max}`;
  }
  if (field.type === 'single_select')
    return selectOptions(field).find((o) => o.value === value)?.label ?? String(value);
  if (field.type === 'multi_select' && Array.isArray(value)) {
    const options = selectOptions(field);
    return value.map((v) => options.find((o) => o.value === v)?.label ?? String(v)).join(', ');
  }
  return String(value);
}
