import type { CyclePath, FormFieldDefinition, MirrorAxis, Point } from '@frc/shared';
import { PHASE_TAB } from '../phases';

/*
 * What the two map fields (position, cycle path; task 1.35) read from a definition and a value.
 * Pure: the inputs draw, this only reads.
 */

const AXES: readonly MirrorAxis[] = ['none', 'horizontal', 'vertical', 'both'];

/** The field's `mirror_axis` (SPEC-FINAL 5.6), `none` when it is missing or unknown. */
export function axisOf(field: FormFieldDefinition): MirrorAxis {
  const axis = field.config.mirror_axis;
  return AXES.includes(axis as MirrorAxis) ? (axis as MirrorAxis) : 'none';
}

const isPoint = (p: unknown): p is Point =>
  typeof p === 'object' &&
  p !== null &&
  typeof (p as Point).x === 'number' &&
  typeof (p as Point).y === 'number';

/** A position's stored points as a list: one point, a list of them, or none. */
export function pointsOf(value: unknown): Point[] {
  if (Array.isArray(value)) return value.filter(isPoint);
  return isPoint(value) ? [value] : [];
}

/**
 * A cycle path's stored cycles: a list of point lists. A cycle that is already clean is kept as
 * the same array, so `useUndoable` sees a value handed back as the one it set, not a new one.
 */
export function cyclesOf(value: unknown): CyclePath[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(Array.isArray)
    .map((cycle: unknown[]) =>
      cycle.every(isPoint) ? (cycle as CyclePath) : cycle.filter(isPoint),
    );
}

/** The cap on points per cycle: `max_points_per_cycle`, 6 when it is not set (SPEC-FINAL 5.3). */
export function capOf(field: FormFieldDefinition): number {
  const cap = field.config.max_points_per_cycle;
  return typeof cap === 'number' && Number.isInteger(cap) && cap > 0 ? cap : 6;
}

/** The map's sub-line: "Q39 · 1690 · Auto" on the entry page, "Try it · Auto" in the builder. */
export function mapSubtitle(
  caption: string | null | undefined,
  field: FormFieldDefinition,
): string {
  return [caption, field.phase ? PHASE_TAB[field.phase] : null].filter(Boolean).join(' · ');
}

/** "1 spot", "3 spots". */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
