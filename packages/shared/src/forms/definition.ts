import { FIELD_TYPE_CONFIG, type DefinitionIssue, type FieldTypeName } from './config';
import type { FormFieldDefinition } from './types';
import { validateEntryData } from './validate';

// Moved out of config.ts by task 1.29, unchanged: the client's initial bundle needs the type
// configs (config.ts) but not this check, which only the server and the lazy form builder
// call. A module is one unit to the bundler, so a check living beside the configs would ship
// in the competition path's initial JS (DEVIATIONS 1.29).

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
const SEMANTIC_COLUMNS = [
  'description',
  'unit',
  'phase',
  'direction',
  'category',
  'expected_range',
  'include_in_ai_context',
] as const;

const blank = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

/**
 * The three constraints SPEC-FINAL 3.3 leaves to the use-case layer, because they
 * depend on the field's type. Both the server and the builder call this, so a rule
 * cannot drift between them.
 */
export function validateFieldDefinition(field: FormFieldDefinition): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];

  if (!KEY_PATTERN.test(field.key)) {
    issues.push({
      path: 'key',
      message:
        'a key is permanent: lowercase letters, digits and underscores, starting with a letter',
    });
  }

  if (field.type === 'section') {
    for (const column of SEMANTIC_COLUMNS) {
      if (field[column] !== null && field[column] !== undefined) {
        issues.push({
          path: column,
          message: 'a section holds no data and carries no semantic metadata',
        });
      }
    }
  } else {
    for (const required of ['description', 'unit', 'phase', 'direction'] as const) {
      if (blank(field[required])) {
        issues.push({
          path: required,
          message: `${required} is required on every data field and cannot be backfilled later`,
        });
      }
    }
  }

  const ordinalAllowed = field.type === 'single_select' || field.type === 'multi_select';
  if (!ordinalAllowed && field.is_ordinal !== null && field.is_ordinal !== undefined) {
    issues.push({
      path: 'is_ordinal',
      message: 'is_ordinal applies only to single and multi select',
    });
  }

  const schema = FIELD_TYPE_CONFIG[field.type as FieldTypeName];
  if (!schema) {
    issues.push({ path: 'type', message: `unknown field type '${field.type}'` });
  } else {
    const parsed = schema.safeParse(field.config);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          path: issue.path.length > 0 ? `config.${issue.path.join('.')}` : 'config',
          message: issue.message,
        });
      }
    } else if (field.default_value !== null && field.default_value !== undefined) {
      // Judged only against a config that parsed: a broken config already has its issue.
      const message = defaultValueProblem(field);
      if (message !== null) issues.push({ path: 'default_value', message });
    }
  }

  return issues;
}

/**
 * Whether a non-null default is a value the scouter could submit: the entry validator's
 * 'submit' rules for this one field. Its condition and `required` are set aside — a default
 * is judged as a value, not as an answer, and its condition names a sibling not given here.
 */
function defaultValueProblem(field: FormFieldDefinition): string | null {
  const alone: FormFieldDefinition = {
    ...field,
    required: false,
    visibility_condition: null,
    deprecated: false,
  };
  const result = validateEntryData([alone], 'played', { [field.key]: field.default_value });
  if (result.ok) return null;
  return `the default is not a valid value: ${result.issues[0]!.message}`;
}
