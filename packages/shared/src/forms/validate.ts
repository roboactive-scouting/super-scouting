import type { CyclePath, EventLogTap, FormFieldDefinition, Point, RobotStatus } from './types';
import { selectOptions } from './types';
import { isVisible } from './visibility';

export type ValidationIssue = {
  field_key: string;
  code:
    | 'required'
    | 'wrong-type'
    | 'out-of-expected-range'
    | 'out-of-config-range'
    | 'not-an-option'
    | 'unknown-field'
    | 'dead-robot-has-data';
  message: string;
};

export type ValidationResult = { ok: true } | { ok: false; issues: ValidationIssue[] };

/**
 * `'submit'` (the default) is the entry-time check a scouter's submit gets: every rule of the
 * version's fields as they stand now. `'stored'` judges an entry already collected (a queued
 * push, an edit of an old entry) and skips exactly the rules an in-place edit of a published
 * version can move (SPEC-FINAL 5.1: a range change "never retroactively invalidates data";
 * 15.1: the range block is entry-time): config min/max, `expected_range`, `required`, the
 * rating's upper bound, `multi_point`'s one-point limit, the cycle cap and event-type
 * membership. Value types, select options (structural since v1.20), the unit square, tap
 * shape and time order, unknown keys and the dead-robot rule hold in both.
 */
export type ValidationMode = 'submit' | 'stored';

/** The list types whose `[]` holds nothing: at submit, it does not satisfy `required`. */
const LIST_TYPES: ReadonlySet<string> = new Set([
  'multi_select',
  'event_log',
  'position',
  'cycle_path',
]);

/** SPEC-FINAL 8.2: no_show and disabled record no field values at all. */
export function isDeadRobot(status: RobotStatus): boolean {
  return status === 'no_show' || status === 'disabled';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A normalised coordinate: a finite number in 0..1 (SPEC-FINAL 5.2, 5.6). */
const inUnit = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

const inUnitSquare = (p: unknown): p is Point => isRecord(p) && inUnit(p.x) && inUnit(p.y);

const TAP_KEYS = new Set(['type', 't', 'x', 'y']);

/**
 * One event-log tap: `{type, t}` or `{type, t, x, y}`. x and y come together or not at all.
 * A place is accepted whether or not the field's `ask_position` is on right now — an in-place
 * config edit must never make collected or queued data fail (SPEC-FINAL 5.1).
 */
function validTap(tap: unknown, allowed: Set<string> | null): tap is EventLogTap {
  if (!isRecord(tap)) return false;
  if (Object.keys(tap).some((k) => !TAP_KEYS.has(k))) return false;
  // `allowed` null ('stored' mode): any non-empty type, since a type may since have been removed.
  if (typeof tap.type !== 'string' || tap.type === '') return false;
  if (allowed !== null && !allowed.has(tap.type)) return false;
  if (typeof tap.t !== 'number' || !Number.isFinite(tap.t)) return false;
  const hasX = 'x' in tap;
  const hasY = 'y' in tap;
  if (hasX !== hasY) return false;
  return !hasX || (inUnit(tap.x) && inUnit(tap.y));
}

/**
 * Dynamic-form validation generated at runtime from the field definitions
 * (SPEC-FINAL 16.4). A new season's form needs no code change.
 */
export function validateEntryData(
  fields: FormFieldDefinition[],
  robotStatus: RobotStatus,
  data: Record<string, unknown>,
  options: { mode?: ValidationMode } = {},
): ValidationResult {
  const submit = (options.mode ?? 'submit') === 'submit';
  const issues: ValidationIssue[] = [];

  if (isDeadRobot(robotStatus)) {
    if (Object.keys(data).length > 0) {
      issues.push({
        field_key: '*',
        code: 'dead-robot-has-data',
        message: 'a no-show or disabled robot records no field values, never zeros',
      });
    }
    return issues.length === 0 ? { ok: true } : { ok: false, issues };
  }

  const live = fields.filter((f) => !f.deprecated);
  const known = new Set(live.map((f) => f.key));
  for (const key of Object.keys(data)) {
    if (!known.has(key)) {
      issues.push({ field_key: key, code: 'unknown-field', message: `no field with key '${key}'` });
    }
  }

  for (const field of live) {
    // A computed value is written by the engine at submit time and a section holds no data:
    // neither is ever required of the scouter, and neither is checked here.
    if (field.type === 'computed' || field.type === 'section') continue;

    const value = data[field.key];
    const emptyList =
      submit && LIST_TYPES.has(field.type) && Array.isArray(value) && value.length === 0;
    const missing = value === undefined || value === null || value === '' || emptyList;
    if (missing) {
      // A field hidden by its condition is never required: a hidden field records no value
      // (SPEC-FINAL 5.8). A value present for a hidden field is not rejected, because a
      // condition is an in-place edit and must not fail queued entries (5.1); the client strips it.
      // `required` is itself an in-place edit, so a stored entry is never held to it.
      if (submit && field.required && isVisible(field, data)) {
        issues.push({
          field_key: field.key,
          code: 'required',
          message: `${field.label} is required`,
        });
      }
      continue;
    }

    const wrongType = (message: string) =>
      issues.push({ field_key: field.key, code: 'wrong-type', message });

    switch (field.type) {
      case 'counter':
      case 'number': {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          issues.push({
            field_key: field.key,
            code: 'wrong-type',
            message: `${field.label} must be a number`,
          });
          break;
        }
        if (!submit) break; // both ranges below are in-place edits
        const min = typeof field.config.min === 'number' ? field.config.min : undefined;
        const max = typeof field.config.max === 'number' ? field.config.max : undefined;
        if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
          issues.push({
            field_key: field.key,
            code: 'out-of-config-range',
            message: `${field.label} must be between ${min ?? '-∞'} and ${max ?? '∞'}`,
          });
          break;
        }
        // The hard entry-time block of SPEC-FINAL 15.1.
        if (field.expected_range) {
          const { min: lo, max: hi } = field.expected_range;
          if (value < lo || value > hi) {
            issues.push({
              field_key: field.key,
              code: 'out-of-expected-range',
              message: `${field.label} is outside its expected range (${lo}–${hi})`,
            });
          }
        }
        break;
      }
      case 'toggle': {
        if (typeof value !== 'boolean') {
          issues.push({
            field_key: field.key,
            code: 'wrong-type',
            message: `${field.label} must be true or false`,
          });
        }
        break;
      }
      case 'single_select': {
        const allowed = selectOptions(field).map((o) => o.value);
        if (typeof value !== 'string' || !allowed.includes(value)) {
          issues.push({
            field_key: field.key,
            code: 'not-an-option',
            message: `${field.label} must be one of: ${allowed.join(', ')}`,
          });
        }
        break;
      }
      case 'multi_select': {
        const allowed = selectOptions(field).map((o) => o.value);
        if (
          !Array.isArray(value) ||
          value.some((v) => typeof v !== 'string' || !allowed.includes(v))
        ) {
          issues.push({
            field_key: field.key,
            code: 'not-an-option',
            message: `${field.label} must be a list drawn from: ${allowed.join(', ')}`,
          });
        }
        break;
      }
      case 'short_text':
      case 'long_text': {
        if (typeof value !== 'string') wrongType(`${field.label} must be text`);
        break;
      }
      case 'rating': {
        const max = typeof field.config.max === 'number' ? field.config.max : 5;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
          wrongType(`${field.label} must be a rating from 1 to ${max}`);
        } else if (submit && value > max) {
          wrongType(`${field.label} must be a rating from 1 to ${max}`);
        }
        break;
      }
      case 'timer': {
        // Nullable via the "unsure — no time" toggle: it submits no value rather than a wrong
        // number (SPEC-FINAL 5.2). A null arrives as an absent key, handled by `missing` above.
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          wrongType(`${field.label} must be a time in seconds, 0 or more`);
        }
        break;
      }
      case 'event_log': {
        if (!Array.isArray(value)) {
          wrongType(`${field.label} must be a list of taps`);
          break;
        }
        const allowed = submit
          ? new Set(
              (Array.isArray(field.config.event_types)
                ? (field.config.event_types as unknown[])
                : []
              )
                .filter(isRecord)
                .map((o) => o.value as string),
            )
          : null;
        let previous = -Infinity;
        let good = true;
        for (const tap of value as unknown[]) {
          if (!validTap(tap, allowed) || tap.t < previous) {
            good = false;
            break;
          }
          previous = tap.t;
        }
        if (!good) wrongType(`${field.label} must be taps of a known type, in time order`);
        break;
      }
      case 'position': {
        const points = Array.isArray(value) ? (value as unknown[]) : [value];
        if (!points.every(inUnitSquare)) {
          wrongType(`${field.label} must be points inside the map (0 to 1)`);
        } else if (submit && field.config.multi_point !== true && points.length > 1) {
          wrongType(`${field.label} takes one point`);
        }
        break;
      }
      case 'cycle_path': {
        const cap =
          typeof field.config.max_points_per_cycle === 'number'
            ? field.config.max_points_per_cycle
            : 6;
        const cycles = value as CyclePath[] | unknown;
        if (
          !Array.isArray(cycles) ||
          cycles.some(
            (c) => !Array.isArray(c) || (submit && c.length > cap) || !c.every(inUnitSquare),
          )
        ) {
          wrongType(`${field.label} must be cycles of at most ${cap} points inside the map`);
        }
        break;
      }
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
