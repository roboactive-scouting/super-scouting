import { evaluateExpr, stripHiddenValues, type Expr, type FormFieldDefinition } from '@frc/shared';

/*
 * An entry's starting values and the data it saves, from a form's fields: one definition for
 * the builder's Try it (task 1.31) and, from task 1.33, the entry page. Pure: nothing here
 * stores or sends.
 */

/** The values a scouter starts with: each control as it is drawn before anyone touches it. */
export function seedValues(fields: readonly FormFieldDefinition[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === 'section' || field.type === 'computed') continue;
    const given = field.default_value;
    if (given !== null && given !== undefined) {
      values[field.key] = given;
    } else if (field.type === 'toggle') {
      // A toggle is off until switched on, so a condition on it is never left undecided.
      values[field.key] = false;
    } else if (field.type === 'counter') {
      // The counter shows its minimum (else 0): what it shows is what it holds.
      values[field.key] = typeof field.config.min === 'number' ? field.config.min : 0;
    }
  }
  return values;
}

/** Each computed field's value, worked out from the others (SPEC-FINAL 5.7). */
function withComputed(
  fields: readonly FormFieldDefinition[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...values };
  for (const field of fields) {
    if (field.type !== 'computed') continue;
    const expression = field.config.expression as Expr | null | undefined;
    const value = expression ? evaluateExpr(expression, out) : null;
    if (value === null || (typeof value === 'number' && !Number.isFinite(value))) {
      delete out[field.key];
    } else {
      out[field.key] = value;
    }
  }
  return out;
}

/**
 * The entry's data as it would sync (SPEC-FINAL 5.8): a hidden field records no value, a
 * computed field is worked out from what is shown, and then hidden again if its own condition
 * hides it. The shared `stripHiddenValues` and `evaluateExpr`, never a copy.
 */
export function previewData(
  fields: readonly FormFieldDefinition[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const live = fields.filter((f) => !f.deprecated);
  const shown = stripHiddenValues(live, values);
  return stripHiddenValues(live, withComputed(live, shown));
}
