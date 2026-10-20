import type { CyclePath, EventLogTap, FormFieldDefinition, MirrorAxis, Point } from '@frc/shared';
import { PHASE_TAB } from '../phases';

/*
 * What the map fields (position, cycle path; task 1.35; and an event log's places, 1.34) read from
 * a definition and a value. Pure: the inputs draw, this only reads. In the initial bundle: the
 * confirmation summary (UF.24) words a map field with `mapCount`.
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

/** An event log's taps as a list, whatever was handed in (anything without a type and a time is dropped). */
export function tapsOf(value: unknown): EventLogTap[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (tap): tap is EventLogTap =>
      typeof tap === 'object' &&
      tap !== null &&
      typeof (tap as EventLogTap).type === 'string' &&
      typeof (tap as EventLogTap).t === 'number',
  );
}

/** A tap that was given a place on the map ("where?"), not skipped. */
export const isPlaced = (tap: EventLogTap): tap is EventLogTap & Point =>
  typeof tap.x === 'number' && typeof tap.y === 'number';

/**
 * A field drawn on the map: a position, a cycle path, or an event log that asks where (SPEC-FINAL
 * 8.2). The confirmation (UF.24) opens these view only.
 */
export function opensMap(field: FormFieldDefinition): boolean {
  return (
    field.type === 'position' ||
    field.type === 'cycle_path' ||
    (field.type === 'event_log' && field.config.ask_position === true)
  );
}

/**
 * What a map field holds, in the map button's words: "1 spot", "3 spots"; "2 paths · 9 spots";
 * "5 events · 4 on the map" ("5 events" for a log that never asks where). Null when it holds
 * nothing (the form shows "Mark on the map", the confirmation "—") and for any other type. One
 * wording for the form's map button and the confirmation (UF.24).
 */
export function mapCount(field: FormFieldDefinition, value: unknown): string | null {
  if (field.type === 'position') {
    const n = pointsOf(value).length;
    return n > 0 ? plural(n, 'spot', 'spots') : null;
  }
  if (field.type === 'cycle_path') {
    const paths = cyclesOf(value).filter((path) => path.length > 0);
    if (paths.length === 0) return null;
    const spots = paths.reduce((sum, path) => sum + path.length, 0);
    return `${plural(paths.length, 'path', 'paths')} · ${plural(spots, 'spot', 'spots')}`;
  }
  if (field.type === 'event_log') {
    const taps = tapsOf(value);
    if (taps.length === 0) return null;
    const events = plural(taps.length, 'event', 'events');
    return field.config.ask_position === true
      ? `${events} · ${taps.filter(isPlaced).length} on the map`
      : events;
  }
  return null;
}
