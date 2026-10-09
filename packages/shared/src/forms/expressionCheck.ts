import type { DefinitionIssue } from './config';
import type { Expr } from './expression';
import type { FormFieldDefinition } from './types';

// Moved out of expression.ts by task 1.29, unchanged, for the same reason as definition.ts:
// the entry form evaluates expressions; only the server and the builder check them.

const NUMERIC_UNITS = new Set(['count', 'seconds', 'points']);
/** The types whose value is a number (a toggle reads as 1 or 0): the fallback for no unit. */
const NUMERIC_TYPES = new Set(['counter', 'number', 'rating', 'timer', 'toggle']);

type StaticType = 'float' | 'string' | 'invalid';

function staticType(expr: Expr, byKey: Map<string, FormFieldDefinition>): StaticType {
  switch (expr.kind) {
    case 'literal':
      return typeof expr.value === 'number' ? 'float' : 'string';
    case 'field': {
      const field = byKey.get(expr.key);
      if (!field) return 'invalid';
      if (field.type === 'computed') return 'invalid';
      if (field.type === 'toggle') return 'float';
      // A draft field may not have its unit yet ("needs meaning", which only publish demands):
      // judge it by its type, so a blank unit never turns into a definition error here.
      if (field.unit === null || field.unit === undefined) {
        return NUMERIC_TYPES.has(field.type) ? 'float' : 'string';
      }
      return NUMERIC_UNITS.has(field.unit) ? 'float' : 'string';
    }
    case 'op': {
      const left = staticType(expr.left, byKey);
      const right = staticType(expr.right, byKey);
      if (left === 'invalid' || right === 'invalid' || left !== right) return 'invalid';
      if (expr.op === 'concat') return left === 'string' ? 'string' : 'invalid';
      return left === 'float' ? 'float' : 'invalid';
    }
  }
}

/**
 * The cross-field checks `validateFieldDefinition` cannot make on its own: they need the
 * sibling fields. `resultType`, when given, is the field's own `config.result_type`.
 */
export function validateExpr(
  expr: Expr,
  fields: FormFieldDefinition[],
  resultType?: 'float' | 'string',
): DefinitionIssue[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const issues: DefinitionIssue[] = [];

  const walk = (node: Expr): void => {
    if (node.kind === 'field') {
      const field = byKey.get(node.key);
      if (!field) {
        issues.push({ path: 'expression', message: `'${node.key}' is not a field on this form` });
      } else if (field.type === 'computed') {
        issues.push({
          path: 'expression',
          message: `a computed field may not reference another computed field ('${node.key}')`,
        });
      }
    }
    if (node.kind === 'op') {
      walk(node.left);
      walk(node.right);
    }
  };
  walk(expr);

  if (issues.length === 0) {
    const type = staticType(expr, byKey);
    if (type === 'invalid') {
      issues.push({
        path: 'expression',
        message: 'operands must be the same type: numbers take + − × ÷, strings take concat',
      });
    } else if (resultType !== undefined && type !== resultType) {
      issues.push({
        path: 'expression',
        message: `the expression gives a ${type}, but the field says ${resultType}`,
      });
    }
  }
  return issues;
}
