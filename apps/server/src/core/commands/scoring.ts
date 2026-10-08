import {
  AppError,
  assertCan,
  selectOptions,
  setScoringRulesInput,
  validateScoringRules,
  type Caller,
  type FormFieldDefinition,
  type ScoringIssue,
  type ScoringRuleRow,
  type SetScoringRulesInput,
  type SetScoringRulesOutput,
} from '@frc/shared';
import type { StoredScoringRule, UseCaseContext } from '../context.js';
import { formOrNotFound } from './forms.js';
import { parseInput } from './users.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export { setScoringRulesInput, setScoringRulesOutput } from '@frc/shared';

/** A stored rule as it leaves the server: `option_points` null unless it holds one. */
export function toScoringRuleRow(rule: StoredScoringRule): ScoringRuleRow {
  return {
    field_key: rule.field_key,
    points: Number(rule.points),
    option_points: rule.option_points ?? null,
  };
}

const byFieldKey = (a: { field_key: string }, b: { field_key: string }): number =>
  a.field_key < b.field_key ? -1 : a.field_key > b.field_key ? 1 : 0;

function scoringError(issues: ScoringIssue[]): AppError {
  const first = issues[0]!;
  const one = `${first.field_key}: ${first.message}`;
  const summary =
    issues.length === 1 ? one : `${issues.length} problems in the scoring; first, ${one}`;
  return new AppError('invalid', summary, { reason: 'invalid-scoring', issues });
}

const isSelectType = (type: string): boolean => type === 'single_select' || type === 'multi_select';

/**
 * The fields a rule may name: the live fields of the form's draft and of its active version
 * (task 1.28, decision A). Where both have a key, the draft's TYPE wins — it is the newer
 * definition, the one the builder is editing — but a select's options are the UNION of both
 * versions' (review #9): scoring is not versioned, and an option the draft dropped is still
 * scored by every entry of the active version. When the two disagree on the type, options
 * are still taken from both, so long as the draft's type is a select.
 */
async function scorableUniverse(
  ctx: UseCaseContext,
  formId: string,
  activeVersionId: string | null,
): Promise<FormFieldDefinition[]> {
  const versions = await ctx.store.listFormVersions(formId);
  const draft = versions.find((v) => v.published_at === null);
  const byKey = new Map<string, FormFieldDefinition>();
  const ids = [activeVersionId, draft?.id ?? null].filter((id): id is string => id !== null);
  for (const id of ids) {
    for (const field of await ctx.store.getFormFields(id)) {
      if (field.deprecated) continue;
      const earlier = byKey.get(field.key);
      if (earlier && isSelectType(field.type) && isSelectType(earlier.type)) {
        const options = selectOptions(field);
        const seen = new Set(options.map((o) => o.value));
        const union = [...options, ...selectOptions(earlier).filter((o) => !seen.has(o.value))];
        byKey.set(field.key, { ...field, config: { ...field.config, options: union } });
      } else {
        byKey.set(field.key, field);
      }
    }
  }
  return [...byKey.values()];
}

/**
 * SPEC-FINAL 4 (task 1.28): replaces the form's scoring model. Admin only. The rules given
 * become the whole rule set — a field not named loses its rule. Keyed by (form, field key),
 * so a rule carries across versions; scoring is not versioned, so this NEVER writes a
 * form version (not even `updated_by`: a scoring edit does not move "last edited"). Every
 * problem is refused together, positioned: `invalid` with `reason: 'invalid-scoring'`.
 */
export async function setScoringRules(
  caller: Caller,
  input: SetScoringRulesInput,
  ctx: UseCaseContext,
): Promise<SetScoringRulesOutput> {
  assertCan(caller, 'manage_forms');
  const parsed = parseInput(setScoringRulesInput, input);
  const form = await formOrNotFound(ctx, parsed.form_id);
  const fields = await scorableUniverse(ctx, form.id, form.active_version_id ?? null);
  const issues = validateScoringRules(parsed.rules, fields, { prefix: 'rules', noun: 'form' });
  if (issues.length > 0) throw scoringError(issues);

  // Only validated keys reach replaceScoringRules: its delete interpolates them (1.27).
  const isSelect = new Map(
    fields.map((f) => [f.key, f.type === 'single_select' || f.type === 'multi_select']),
  );
  // A kept rule keeps its id: the upsert writes every column it is given, `id` included,
  // and a re-keyed row would reach a device as a second rule beside the stale one.
  const existingIds = new Map(
    (await ctx.store.getScoringRules(form.id)).map((r) => [r.field_key, r.id]),
  );
  await ctx.store.replaceScoringRules(
    form.id,
    parsed.rules.map((rule) => ({
      id: existingIds.get(rule.field_key) ?? crypto.randomUUID(),
      field_key: rule.field_key,
      points: rule.points,
      option_points: isSelect.get(rule.field_key) ? (rule.option_points ?? null) : null,
    })),
  );
  const stored = await ctx.store.getScoringRules(form.id);
  return { rules: stored.map(toScoringRuleRow).sort(byFieldKey) };
}
