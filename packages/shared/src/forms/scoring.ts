import type { FieldTypeName } from './config';

/**
 * SPEC-FINAL 4.1: the only field types a scoring rule may name. Toggle scores `points` when
 * true, counter and number score `points` × value, a single select scores
 * `option_points[selected]`, a multi select Σ `option_points[each selected]`. Every other
 * type — section included — holds no `scoring_rules` row. Browser-safe, so the builder
 * shows the points input only where a rule is allowed.
 */
export const SCORABLE_FIELD_TYPES = [
  'toggle',
  'counter',
  'number',
  'single_select',
  'multi_select',
] as const satisfies readonly FieldTypeName[];

const SCORABLE: ReadonlySet<string> = new Set(SCORABLE_FIELD_TYPES);
const SELECTS: ReadonlySet<string> = new Set(['single_select', 'multi_select']);

export function isScorable(type: FieldTypeName): boolean {
  return SCORABLE.has(type);
}

/** What a rule is checked against: a LIVE field of the form. */
export type ScoringField = { key: string; type: FieldTypeName; config: Record<string, unknown> };

export type ScoringRuleCandidate = {
  field_key: string;
  points: number;
  option_points?: Record<string, number> | null | undefined;
};

/** One problem with a rule: `path` is `<prefix>.<index>.<column>[.<option value>]`. */
export type ScoringIssue = { field_key: string; path: string; message: string };

const validPoints = (n: number): boolean => Number.isFinite(n) && n >= 0;

function optionValues(field: ScoringField): Set<string> {
  const raw = field.config.options;
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw
      .map((o) => (o as { value?: unknown } | null)?.value)
      .filter((v): v is string => typeof v === 'string'),
  );
}

/**
 * Every rule of SPEC-FINAL 4.1 for a whole rule set (task 1.28), as positioned issues:
 * a key named twice; a key that is not a live field (`noun` names whose: "form" or
 * "definition"); an unscorable type; points that are negative or not finite (penalties are
 * recorded, never subtracted); `option_points` off a select; on a select, `points` other
 * than 0 (a select scores by option, so a non-zero `points` would be silently dead) and an
 * option value the field does not have or a negative option score. A missing option scores 0.
 */
export function validateScoringRules(
  rules: readonly ScoringRuleCandidate[],
  liveFields: readonly ScoringField[],
  options: { prefix: string; noun: string },
): ScoringIssue[] {
  const byKey = new Map(liveFields.map((f) => [f.key, f]));
  const seen = new Set<string>();
  const issues: ScoringIssue[] = [];
  rules.forEach((rule, i) => {
    const at = `${options.prefix}.${i}`;
    const key = rule.field_key;
    const push = (path: string, message: string) =>
      issues.push({ field_key: key, path: `${at}.${path}`, message });

    if (seen.has(key)) push('field_key', `two rules name '${key}'; a field has one scoring rule`);
    seen.add(key);
    const field = byKey.get(key);
    if (!field) {
      push('field_key', `scoring names '${key}', which is not a field of this ${options.noun}`);
      return;
    }
    if (!SCORABLE.has(field.type)) {
      push(
        'field_key',
        `'${key}' is a ${field.type} field; only toggle, counter, number, single_select and multi_select fields are scored`,
      );
      return;
    }
    const isSelect = SELECTS.has(field.type);
    if (!validPoints(rule.points)) {
      push('points', 'points must be a number of at least 0; penalties are never subtracted');
    } else if (isSelect && rule.points !== 0) {
      push('points', `a ${field.type} scores by option_points; its points must be 0`);
    }
    const optionPoints = rule.option_points ?? null;
    if (optionPoints === null) return;
    if (!isSelect) {
      push('option_points', `only a select scores by option; '${key}' is a ${field.type} field`);
      return;
    }
    const values = optionValues(field);
    for (const [value, points] of Object.entries(optionPoints)) {
      if (!values.has(value)) {
        push(`option_points.${value}`, `'${value}' is not an option of '${key}'`);
      } else if (!validPoints(points)) {
        push(
          `option_points.${value}`,
          'option points must be a number of at least 0; penalties are never subtracted',
        );
      }
    }
  });
  return issues;
}

/**
 * The field count every form surface shows (task 1.28): live, data-holding fields — not
 * deprecated, not a section. Used by the forms list and by a saved export's summary.
 */
export function countDataFields(
  fields: readonly { type: string; deprecated?: boolean | null }[],
): number {
  return fields.filter((f) => f.deprecated !== true && f.type !== 'section').length;
}
