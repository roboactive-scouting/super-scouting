import { z } from 'zod';
// A type-only import: `config.ts` imports the `exprSchema` value from here, so a value
// import back would be a runtime cycle.
import type { DefinitionIssue } from './config';
import type { FormFieldDefinition } from './types';

export type Expr =
  | { kind: 'field'; key: string }
  | { kind: 'literal'; value: number | string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' | 'concat'; left: Expr; right: Expr };

export const exprSchema: z.ZodType<Expr> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('field'), key: z.string().min(1) }).strict(),
    z.object({ kind: z.literal('literal'), value: z.union([z.number(), z.string()]) }).strict(),
    z
      .object({
        kind: z.literal('op'),
        op: z.enum(['+', '-', '*', '/', 'concat']),
        left: exprSchema,
        right: exprSchema,
      })
      .strict(),
  ]),
);

export type ExprValue = number | string | null;

/** SPEC-FINAL 5.7. Division by zero yields null, and a null operand propagates. */
export function evaluateExpr(expr: Expr, values: Record<string, unknown>): ExprValue {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'field': {
      const value = values[expr.key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') return value;
      // A toggle is numeric to the validator below (true = 1, false = 0), so it is here too.
      if (typeof value === 'boolean') return value ? 1 : 0;
      return null;
    }
    case 'op': {
      const left = evaluateExpr(expr.left, values);
      const right = evaluateExpr(expr.right, values);
      if (left === null || right === null) return null;

      if (expr.op === 'concat') {
        if (typeof left !== 'string' || typeof right !== 'string') return null;
        return left + right;
      }
      if (typeof left !== 'number' || typeof right !== 'number') return null;
      switch (expr.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return right === 0 ? null : left / right;
      }
    }
  }
}

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
