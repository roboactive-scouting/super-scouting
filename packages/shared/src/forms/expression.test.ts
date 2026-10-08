import { describe, expect, it } from 'vitest';
import type { Expr } from './expression';
import { evaluateExpr, exprSchema, validateExpr } from './expression';
import type { FormFieldDefinition } from './types';

const f = (
  key: string,
  type: FormFieldDefinition['type'],
  unit: FormFieldDefinition['unit'],
): FormFieldDefinition => ({
  id: key,
  key,
  label: key,
  help_text: null,
  type,
  section: null,
  display_order: 1,
  required: false,
  default_value: null,
  config: type === 'computed' ? { expression: null, result_type: 'float' } : {},
  visibility_condition: null,
  deprecated: false,
  description: 'x',
  unit,
  phase: 'auto',
  direction: 'neutral',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
});

const fields = [
  f('auto', 'counter', 'count'),
  f('teleop', 'counter', 'count'),
  f('note', 'short_text', 'text'),
  f('derived', 'computed', 'count'),
];

const add: Expr = {
  kind: 'op',
  op: '+',
  left: { kind: 'field', key: 'auto' },
  right: { kind: 'field', key: 'teleop' },
};

const joined: Expr = {
  kind: 'op',
  op: 'concat',
  left: { kind: 'field', key: 'note' },
  right: { kind: 'literal', value: '!' },
};

describe('computed expressions (SPEC-FINAL 5.7)', () => {
  it('parses the three node kinds and nothing else', () => {
    expect(exprSchema.safeParse(add).success).toBe(true);
    expect(exprSchema.safeParse({ kind: 'call', fn: 'sqrt' }).success).toBe(false);
  });

  it('evaluates arithmetic over field values', () => {
    expect(evaluateExpr(add, { auto: 3, teleop: 4 })).toBe(7);
  });

  it('concatenates strings', () => {
    expect(evaluateExpr(joined, { note: 'ok' })).toBe('ok!');
  });

  it('yields null on division by zero', () => {
    const expr: Expr = {
      kind: 'op',
      op: '/',
      left: { kind: 'field', key: 'auto' },
      right: { kind: 'field', key: 'teleop' },
    };
    expect(evaluateExpr(expr, { auto: 5, teleop: 0 })).toBeNull();
  });

  it('propagates a null operand through the whole expression', () => {
    expect(evaluateExpr(add, { auto: 3 })).toBeNull();
    const nested: Expr = { kind: 'op', op: '*', left: add, right: { kind: 'literal', value: 2 } };
    expect(evaluateExpr(nested, { auto: 3 })).toBeNull();
  });

  it('reads a toggle as 1 or 0, the numeric type the validator gives it', () => {
    const expr: Expr = {
      kind: 'op',
      op: '+',
      left: { kind: 'field', key: 'auto' },
      right: { kind: 'field', key: 'climbed' },
    };
    expect(evaluateExpr(expr, { auto: 3, climbed: true })).toBe(4);
    expect(evaluateExpr(expr, { auto: 3, climbed: false })).toBe(3);
  });

  it('refuses mixed operand types at build time', () => {
    const mixed: Expr = {
      kind: 'op',
      op: '+',
      left: { kind: 'field', key: 'auto' },
      right: { kind: 'field', key: 'note' },
    };
    expect(validateExpr(mixed, fields)).not.toEqual([]);
  });

  it('refuses concat on numbers and arithmetic on strings', () => {
    const badConcat: Expr = {
      kind: 'op',
      op: 'concat',
      left: { kind: 'field', key: 'auto' },
      right: { kind: 'field', key: 'teleop' },
    };
    const badMath: Expr = {
      kind: 'op',
      op: '-',
      left: { kind: 'field', key: 'note' },
      right: { kind: 'literal', value: 'x' },
    };
    expect(validateExpr(badConcat, fields)).not.toEqual([]);
    expect(validateExpr(badMath, fields)).not.toEqual([]);
  });

  it('refuses a reference to another computed field — no chaining in v1', () => {
    const chained: Expr = {
      kind: 'op',
      op: '+',
      left: { kind: 'field', key: 'derived' },
      right: { kind: 'literal', value: 1 },
    };
    expect(validateExpr(chained, fields)[0]?.message).toMatch(/another computed field/i);
  });

  it('refuses a reference to a key that is not in this form', () => {
    const stranger: Expr = { kind: 'field', key: 'from_another_form' };
    expect(validateExpr(stranger, fields)).not.toEqual([]);
  });

  it('accepts a valid expression', () => {
    expect(validateExpr(add, fields)).toEqual([]);
  });

  it('accepts an expression whose type matches the field result_type', () => {
    expect(validateExpr(add, fields, 'float')).toEqual([]);
    expect(validateExpr(joined, fields, 'string')).toEqual([]);
  });

  it('refuses a numeric expression on a string field, and the reverse', () => {
    expect(validateExpr(add, fields, 'string')[0]?.message).toBe(
      'the expression gives a float, but the field says string',
    );
    expect(validateExpr(joined, fields, 'float')[0]?.message).toBe(
      'the expression gives a string, but the field says float',
    );
  });

  it('does not stack a result_type complaint on top of a type error', () => {
    const mixed: Expr = {
      kind: 'op',
      op: '+',
      left: { kind: 'field', key: 'auto' },
      right: { kind: 'field', key: 'note' },
    };
    expect(validateExpr(mixed, fields, 'float')).toHaveLength(1);
  });
});

describe('a referenced field whose unit is still null (a draft that needs meaning)', () => {
  const ref = (key: string): Expr => ({ kind: 'field', key });
  const plus = (a: string, b: string): Expr => ({
    kind: 'op',
    op: '+',
    left: ref(a),
    right: ref(b),
  });

  it.each(['counter', 'number', 'rating', 'timer', 'toggle'] as const)(
    'types a %s with no unit as a number, so it does not block Save draft',
    (type) => {
      const fieldsWithBlank = [f('known', 'counter', 'count'), f('blank', type, null)];
      expect(validateExpr(plus('known', 'blank'), fieldsWithBlank, 'float')).toEqual([]);
    },
  );

  it.each(['single_select', 'short_text', 'long_text'] as const)(
    'types a %s with no unit as a string',
    (type) => {
      const fieldsWithBlank = [f('known', 'short_text', 'text'), f('blank', type, null)];
      const concat: Expr = { kind: 'op', op: 'concat', left: ref('known'), right: ref('blank') };
      expect(validateExpr(concat, fieldsWithBlank, 'string')).toEqual([]);
      expect(validateExpr(plus('blank', 'blank'), fieldsWithBlank)).toHaveLength(1);
    },
  );
});
