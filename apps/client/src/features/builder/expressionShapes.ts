import type { Expr, FormFieldDefinition } from '@frc/shared';

/*
 * The computed field's editor offers the common shapes of SPEC-FINAL 5.7's expression tree
 * (task 1.30): a sum of fields, a difference, a product or a ratio of two operands (a field, or
 * a number on the right), and two text fields joined. Anything else — nested mixes, a number
 * on the left — is shown as text and can only be replaced (DEVIATIONS 1.30).
 */

export type ShapeKind = 'sum' | 'difference' | 'product' | 'ratio' | 'join';

/** An operand: a field's key, a number, or not chosen yet. */
export type Operand =
  { kind: 'field'; key: string } | { kind: 'number'; value: number | null } | null;

export type Shape =
  | { kind: 'sum'; keys: (string | null)[] }
  | { kind: 'difference' | 'product' | 'ratio' | 'join'; left: string | null; right: Operand };

export const SHAPE_NAME: Record<ShapeKind, string> = {
  sum: 'Sum of fields',
  difference: 'Difference (first − second)',
  product: 'Product (first × second)',
  ratio: 'Ratio (first ÷ second)',
  join: 'Text joined (first, then second)',
};

const OP: Record<Exclude<ShapeKind, 'sum'>, '-' | '*' | '/' | 'concat'> = {
  difference: '-',
  product: '*',
  ratio: '/',
  join: 'concat',
};
const KIND_OF_OP: Record<string, Exclude<ShapeKind, 'sum'>> = {
  '-': 'difference',
  '*': 'product',
  '/': 'ratio',
  concat: 'join',
};

/** A new shape of a kind, keeping the operands the last one had where they fit. */
export function emptyShape(kind: ShapeKind, from?: Shape | null): Shape {
  const firstKeys =
    from === null || from === undefined
      ? []
      : from.kind === 'sum'
        ? from.keys
        : [from.left, from.right?.kind === 'field' ? from.right.key : null];
  if (kind === 'sum') {
    const keys = firstKeys.slice(0, 2);
    while (keys.length < 2) keys.push(null);
    return { kind, keys };
  }
  const right = firstKeys[1] ?? null;
  return { kind, left: firstKeys[0] ?? null, right: right ? { kind: 'field', key: right } : null };
}

/** The expression a complete shape writes; null while any operand is still to be chosen. */
export function exprOf(shape: Shape): Expr | null {
  if (shape.kind === 'sum') {
    if (shape.keys.length < 2 || shape.keys.some((k) => k === null)) return null;
    const [first, ...rest] = shape.keys as string[];
    return rest.reduce<Expr>(
      (left, key) => ({ kind: 'op', op: '+', left, right: { kind: 'field', key } }),
      { kind: 'field', key: first! },
    );
  }
  if (shape.left === null || shape.right === null) return null;
  if (shape.right.kind === 'number' && shape.right.value === null) return null;
  const right: Expr =
    shape.right.kind === 'field'
      ? { kind: 'field', key: shape.right.key }
      : { kind: 'literal', value: shape.right.value! };
  return { kind: 'op', op: OP[shape.kind], left: { kind: 'field', key: shape.left }, right };
}

/** The field keys of a chain of `+` over fields, or null when it is anything else. */
function sumKeys(expr: Expr): string[] | null {
  if (expr.kind === 'field') return [expr.key];
  if (expr.kind !== 'op' || expr.op !== '+' || expr.right.kind !== 'field') return null;
  const left = sumKeys(expr.left);
  return left ? [...left, expr.right.key] : null;
}

/** The shape an expression has, or null when the editor does not offer it. */
export function shapeOf(expr: Expr | null): Shape | null {
  if (expr === null || expr.kind !== 'op') return null;
  if (expr.op === '+') {
    const keys = sumKeys(expr);
    return keys && keys.length >= 2 ? { kind: 'sum', keys } : null;
  }
  if (expr.left.kind !== 'field') return null;
  const kind = KIND_OF_OP[expr.op]!;
  if (expr.right.kind === 'field') {
    return { kind, left: expr.left.key, right: { kind: 'field', key: expr.right.key } };
  }
  if (expr.right.kind === 'literal' && typeof expr.right.value === 'number' && kind !== 'join') {
    return { kind, left: expr.left.key, right: { kind: 'number', value: expr.right.value } };
  }
  return null;
}

/**
 * An expression as one line of text: `auto_high + tele_high`. A chain of `+` reads flat
 * (`a + b + c`, not `(a + b) + c`); any other nested operation keeps its brackets.
 */
export function exprText(expr: Expr): string {
  if (expr.kind === 'field') return expr.key;
  if (expr.kind === 'literal') return JSON.stringify(expr.value);
  const op = { '+': '+', '-': '−', '*': '×', '/': '÷', concat: 'then' }[expr.op];
  const side = (e: Expr) => (e.kind === 'op' ? `(${exprText(e)})` : exprText(e));
  const left =
    expr.op === '+' && expr.left.kind === 'op' && expr.left.op === '+'
      ? exprText(expr.left)
      : side(expr.left);
  return `${left} ${op} ${side(expr.right)}`;
}

/** The result a shape gives: text for a join, a number for the rest. */
export const resultTypeOf = (kind: ShapeKind): 'float' | 'string' =>
  kind === 'join' ? 'string' : 'float';

const NUMERIC_TYPES = new Set(['counter', 'number', 'rating', 'timer', 'toggle']);
const TEXT_TYPES = new Set(['short_text', 'long_text', 'single_select']);

/**
 * The fields an operand may be: live, holding a value, not computed (no chaining in v1), not
 * the field itself; numbers for arithmetic and text for a join.
 */
export function operandFields(
  self: string,
  all: readonly FormFieldDefinition[],
  kind: ShapeKind,
): FormFieldDefinition[] {
  const wanted = kind === 'join' ? TEXT_TYPES : NUMERIC_TYPES;
  return all.filter(
    (f) =>
      f.key !== self &&
      !f.deprecated &&
      f.type !== 'section' &&
      f.type !== 'computed' &&
      wanted.has(f.type),
  );
}
