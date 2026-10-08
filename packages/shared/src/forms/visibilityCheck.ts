import type { DefinitionIssue } from './config';
import type { FormFieldDefinition } from './types';

// Moved out of visibility.ts by task 1.29, unchanged, for the same reason as definition.ts:
// the entry form judges conditions; only the server and the builder check them.

const OPS = ['=', '!=', '>', '<', '>=', '<='] as const;
const ORDERING_OPS = new Set<string>(['>', '<', '>=', '<=']);

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
