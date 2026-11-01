import { evaluateExpr, type Expr } from '../forms/expression';
import { isScorable } from '../forms/scoring';
import type { FormFieldDefinition } from '../forms/types';
import { isDeadRobot } from '../forms/validate';
import { isVisible } from '../forms/visibility';
import type { EngineEntry, ScoringRule } from './types';

/** A finite, positive number, else 0: points are never negative and never subtracted (4.1). */
function nonNegative(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The points of one option. Own keys only: `option_points` is a JSON object, and a value
 * such as 'constructor' must not reach `Object.prototype`.
 */
function optionPoints(rule: ScoringRule, option: unknown): number {
  const table = rule.option_points;
  if (table === null || typeof option !== 'string') return 0;
  return Object.prototype.hasOwnProperty.call(table, option) ? nonNegative(table[option]) : 0;
}

/**
 * SPEC-FINAL 4.1. Toggle → `points` if true. Counter and Number → `points` × value. Single
 * select → `option_points[selected]`. Multi select → Σ `option_points[each selected]`, each
 * option once. Every other type is not scored and holds no rule, so it scores 0 even when
 * handed one. Points are never negative and never subtracted; a missing value, a value of the
 * wrong shape and an unknown option all score 0 rather than throwing.
 */
export function scoreField(
  field: Pick<FormFieldDefinition, 'type'>,
  rule: ScoringRule | undefined,
  value: unknown,
): number {
  if (!rule || !isScorable(field.type)) return 0;

  switch (field.type) {
    case 'toggle':
      return value === true ? nonNegative(rule.points) : 0;
    case 'counter':
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? nonNegative(nonNegative(rule.points) * value)
        : 0;
    case 'single_select':
      return optionPoints(rule, value);
    case 'multi_select':
      return Array.isArray(value)
        ? [...new Set(value)].reduce<number>((sum, option) => sum + optionPoints(rule, option), 0)
        : 0;
    default:
      return 0;
  }
}

/**
 * SPEC-FINAL 5.7: a Computed field's value is written into the entry's data payload at
 * submit time AND RECOMPUTED BY THE ENGINE WHENEVER THE ENTRY IS READ, so correcting an
 * expression repairs history. Every read path — scoreEntry, getEntry, queryEntries,
 * getTeamStats — goes through this first.
 *
 * The result has the shape the device saves (`previewData` on the client): a computed field
 * whose value is null or not finite, or whose own condition hides it (5.8), holds no key.
 * Every other key is left as stored.
 */
export function hydrateComputed(
  data: Record<string, unknown>,
  fields: readonly FormFieldDefinition[],
): Record<string, unknown> {
  const out = { ...data };
  for (const field of fields) {
    if (field.type !== 'computed') continue;
    const expr = field.config.expression as Expr | null | undefined;
    const value = expr ? evaluateExpr(expr, out) : null;
    const empty = value === null || (typeof value === 'number' && !Number.isFinite(value));
    if (empty || !isVisible(field, out)) {
      delete out[field.key];
    } else {
      out[field.key] = value;
    }
  }
  return out;
}

/**
 * A robot's scouted score is the sum of its field points (SPEC-FINAL 4.1). A no-show or
 * disabled robot has no score at all — null, never zero (11.3). A super entry (no robot
 * status) and a played or broke_down robot are scored on the data they hold. Each field key
 * scores once, by the first field of `fields` that carries it. Nothing is stored: the same
 * entry scored under a corrected rule set gives the corrected score.
 */
export function scoreEntry(
  entry: Pick<EngineEntry, 'robot_status' | 'data'>,
  fields: readonly FormFieldDefinition[],
  rules: readonly ScoringRule[],
): number | null {
  if (entry.robot_status !== null && isDeadRobot(entry.robot_status)) return null;
  const byKey = new Map(rules.map((r) => [r.field_key, r]));
  // Computed fields are re-derived here, never trusted from the stored payload (5.7).
  const data = hydrateComputed(entry.data, fields);
  const seen = new Set<string>();
  let total = 0;
  for (const field of fields) {
    if (seen.has(field.key)) continue;
    seen.add(field.key);
    total += scoreField(field, byKey.get(field.key), data[field.key]);
  }
  return total;
}
