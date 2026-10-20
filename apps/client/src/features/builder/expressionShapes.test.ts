import { describe, expect, it } from 'vitest';
import type { Expr } from '@frc/shared';
import { emptyShape, exprOf, exprText, shapeOf } from './expressionShapes';

const f = (key: string): Expr => ({ kind: 'field', key });

describe('computed expression shapes (task 1.30)', () => {
  it('a sum of three fields round-trips through its expression', () => {
    const shape = { kind: 'sum' as const, keys: ['a', 'b', 'c'] };
    const expr = exprOf(shape)!;
    expect(exprText(expr)).toBe('a + b + c');
    expect(shapeOf(expr)).toEqual(shape);
  });

  it('an operand not chosen yet writes null, never a half expression', () => {
    expect(exprOf({ kind: 'sum', keys: ['a', null] })).toBeNull();
    expect(exprOf({ kind: 'ratio', left: 'a', right: null })).toBeNull();
    expect(exprOf({ kind: 'ratio', left: 'a', right: { kind: 'number', value: null } })).toBeNull();
  });

  it('reads a difference, a ratio by a number and a join; anything else is not offered', () => {
    expect(shapeOf({ kind: 'op', op: '-', left: f('a'), right: f('b') })).toEqual({
      kind: 'difference',
      left: 'a',
      right: { kind: 'field', key: 'b' },
    });
    expect(
      shapeOf({ kind: 'op', op: '/', left: f('a'), right: { kind: 'literal', value: 2 } }),
    ).toEqual({ kind: 'ratio', left: 'a', right: { kind: 'number', value: 2 } });
    expect(shapeOf({ kind: 'op', op: 'concat', left: f('a'), right: f('b') })?.kind).toBe('join');
    expect(
      shapeOf({ kind: 'op', op: '+', left: { kind: 'literal', value: 1 }, right: f('a') }),
    ).toBeNull();
    expect(shapeOf(f('a'))).toBeNull();
    expect(shapeOf(null)).toBeNull();
  });

  it('a new shape keeps the operands the last one had', () => {
    expect(emptyShape('difference', { kind: 'sum', keys: ['a', 'b', 'c'] })).toEqual({
      kind: 'difference',
      left: 'a',
      right: { kind: 'field', key: 'b' },
    });
    expect(emptyShape('sum')).toEqual({ kind: 'sum', keys: [null, null] });
  });
});

describe('exprText (task 1.30, fix round 1)', () => {
  it('reads a chain of + flat, and keeps the brackets of any other nesting', () => {
    const sum: Expr = {
      kind: 'op',
      op: '+',
      left: { kind: 'op', op: '+', left: f('a'), right: f('b') },
      right: f('c'),
    };
    expect(exprText(sum)).toBe('a + b + c');
    const scaled: Expr = {
      kind: 'op',
      op: '*',
      left: { kind: 'op', op: '+', left: f('a'), right: f('b') },
      right: { kind: 'literal', value: 2 },
    };
    expect(exprText(scaled)).toBe('(a + b) × 2');
    const nested: Expr = {
      kind: 'op',
      op: '+',
      left: f('a'),
      right: { kind: 'op', op: '+', left: f('b'), right: f('c') },
    };
    expect(exprText(nested)).toBe('a + (b + c)');
  });
});
