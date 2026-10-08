import type { DefinitionIssue } from './config';
import type { FormFieldDefinition, VisibilityCondition } from './types';

const OPS = ['=', '!=', '>', '<', '>=', '<='] as const;
const ORDERING_OPS = new Set<string>(['>', '<', '>=', '<=']);

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

/**
 * What is wrong with this field's visibility condition, for the server on save and for the
 * builder. A null condition is always fine. The target must be a live, non-section sibling
 * other than the field itself; ordering operators need a finite number to compare against.
 */
export function validateVisibilityCondition(
  field: FormFieldDefinition,
  fields: FormFieldDefinition[],
): DefinitionIssue[] {
  const condition = field.visibility_condition;
  if (!condition) return [];

  const issues: DefinitionIssue[] = [];
  const issue = (message: string) => issues.push({ path: 'visibility_condition', message });

  if (condition.field_key === field.key) {
    issue('a field cannot be shown or hidden by its own value');
  } else {
    const target = fields.find((f) => f.key === condition.field_key && !f.deprecated);
    if (!target) {
      issue(`'${condition.field_key}' is not a field in this form`);
    } else if (target.type === 'section') {
      issue(`'${condition.field_key}' is a section and holds no value`);
    }
  }

  if (!(OPS as readonly string[]).includes(condition.op)) {
    issue(`'${String(condition.op)}' is not one of ${OPS.join(' ')}`);
  } else if (
    ORDERING_OPS.has(condition.op) &&
    !(typeof condition.value === 'number' && Number.isFinite(condition.value))
  ) {
    issue(`'${condition.op}' compares against a number`);
  }

  return issues;
}
