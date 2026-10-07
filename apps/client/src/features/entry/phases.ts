import {
  NO_VALUE,
  selectOptions,
  type FieldPhase,
  type FormFieldDefinition,
  type RobotStatus,
} from '@frc/shared';

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

/** The form's phases in match order, each with its fields; a field without a phase is a note. */
export function phasesOf(fields: readonly FormFieldDefinition[]): Phase[] {
  return PHASE_ORDER.map((key) => ({
    key,
    fields: fields.filter((f) => (f.phase ?? 'post_match') === key),
  })).filter((p) => p.fields.length > 0);
}

/** A field is filled once it holds anything: a 0 the scout chose counts, an empty text does not. */
export function isFilled(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

export function filledCount(phase: Phase, data: Record<string, unknown>): number {
  return phase.fields.filter((f) => isFilled(data[f.key])).length;
}

/** The phases with at least one field set: each tab shows a ✓. */
export function donePhases(
  phases: readonly Phase[],
  data: Record<string, unknown>,
): Set<FieldPhase> {
  return new Set(phases.filter((p) => filledCount(p, data) > 0).map((p) => p.key));
}

/** A swipe's minimum sideways travel in px. */
export const SWIPE_PX = 60;

/**
 * Which way a finished gesture moves through the phases: +1 (swiped left: next), -1 (swiped
 * right: previous) or 0 (too short, or more up-and-down than sideways: a scroll).
 */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * How a field's value reads in the confirm list: what its control shows. An untouched counter
 * reads 0 and an untouched switch "No" (they are not "filled" for the ✓ and the counts, but
 * the scout saw 0 / off, so that is what the confirm prints); text and choices read "—".
 */
export function displayValue(field: FormFieldDefinition, value: unknown): string {
  if (!isFilled(value)) {
    if (field.type === 'counter') return '0';
    if (field.type === 'toggle') return 'No';
    return NO_VALUE;
  }
  if (field.type === 'toggle') return value === true ? 'Yes' : 'No';
  if (field.type === 'single_select')
    return selectOptions(field).find((o) => o.value === value)?.label ?? String(value);
  return String(value);
}
