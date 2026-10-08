import { z } from 'zod';

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
