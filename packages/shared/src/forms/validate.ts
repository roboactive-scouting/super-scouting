import type { FormFieldDefinition, RobotStatus } from './types';
import { selectOptions } from './types';

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

/** SPEC-FINAL 8.2: no_show and disabled record no field values at all. */
export function isDeadRobot(status: RobotStatus): boolean {
  return status === 'no_show' || status === 'disabled';
}

/**
 * Dynamic-form validation generated at runtime from the field definitions
 * (SPEC-FINAL 16.4). A new season's form needs no code change.
 */
export function validateEntryData(
  fields: FormFieldDefinition[],
  robotStatus: RobotStatus,
  data: Record<string, unknown>,
): ValidationResult {
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
    const value = data[field.key];
    const missing = value === undefined || value === null || value === '';
    if (missing) {
      if (field.required) {
        issues.push({
          field_key: field.key,
          code: 'required',
          message: `${field.label} is required`,
        });
      }
      continue;
    }

    switch (field.type) {
      case 'counter': {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          issues.push({
            field_key: field.key,
            code: 'wrong-type',
            message: `${field.label} must be a number`,
          });
          break;
        }
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
      case 'long_text': {
        if (typeof value !== 'string') {
          issues.push({
            field_key: field.key,
            code: 'wrong-type',
            message: `${field.label} must be text`,
          });
        }
        break;
      }
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
