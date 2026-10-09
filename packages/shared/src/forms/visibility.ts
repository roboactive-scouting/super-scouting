import type { FormFieldDefinition, VisibilityCondition } from './types';

function compare(left: unknown, op: VisibilityCondition['op'], right: unknown): boolean {
  switch (op) {
    case '=':
      return left === right;
    case '!=':
      return left !== right;
    default: {
      if (typeof left !== 'number' || typeof right !== 'number') return false;
      switch (op) {
        case '>':
          return left > right;
        case '<':
          return left < right;
        case '>=':
          return left >= right;
        case '<=':
          return left <= right;
      }
    }
  }
}

/** SPEC-FINAL 5.8: one condition per field, never a general expression language. */
export function isVisible(field: FormFieldDefinition, values: Record<string, unknown>): boolean {
  const condition = field.visibility_condition;
  if (!condition) return true;
  const controlling = values[condition.field_key];
  if (controlling === undefined) return false;
  return compare(controlling, condition.op, condition.value);
}

export function visibleFields(
  fields: FormFieldDefinition[],
  values: Record<string, unknown>,
): FormFieldDefinition[] {
  return fields.filter((field) => isVisible(field, values));
}

/**
 * SPEC-FINAL 5.8: a hidden field records no value. Returns `data` without the keys of the
 * fields hidden by their condition, every condition judged on the submitted `data` itself.
 * Keys that belong to no field are left alone: rejecting those is `validateEntryData`'s job.
 */
export function stripHiddenValues(
  fields: FormFieldDefinition[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const stripped = { ...data };
  for (const field of fields) {
    if (!isVisible(field, data)) delete stripped[field.key];
  }
  return stripped;
}
