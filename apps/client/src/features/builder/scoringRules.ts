import { useCallback, useMemo, useState } from 'react';
import {
  isScorable,
  isSelectType,
  selectOptions,
  type FieldTypeName,
  type ScoredFieldRow,
  type ScoringField,
  type ScoringRuleInput,
} from '@frc/shared';

/*
 * The form's scoring as the builder holds it (SPEC-FINAL 4; task 1.30). Scoring is not
 * versioned: `setScoringRules` replaces the form's WHOLE rule set in place. The builder keeps
 * one rule per field — by the field's id, so a new field's rule follows it while its key still
 * follows its label — and turns them into rules by key when it saves. The universe a rule set
 * is checked against is the shared `scoringUniverse`, the server's own (task 1.30, fix round 1).
 */

/** One field's points: `points` × value (or when on), or per option for a select. */
export type Rule = { points: number; option_points: Record<string, number> | null };

/** A row's rule as the server attached it; null when the field has none. */
export function ruleOf(row: Pick<ScoredFieldRow, 'points' | 'option_points'>): Rule | null {
  if (row.points === null && row.option_points === null) return null;
  return { points: row.points ?? 0, option_points: row.option_points ?? null };
}

/** 0 everywhere: the field is recorded, not scored, so it holds no rule. */
export function isZeroRule(rule: Rule | null | undefined): boolean {
  if (!rule) return true;
  const options = Object.values(rule.option_points ?? {});
  return rule.points <= 0 && options.every((p) => p <= 0);
}

/**
 * A rule the field's type can no longer carry (fix round 1, I1): it scores something, but the
 * type is not scored, or it scores by option and the type is not a select, or the other way
 * round. A counter's rule carries to a number or a toggle, a single select's to a multi select.
 * Saving drops such a rule for every version of the form; until then the pane says so.
 */
export function ruleLost(type: FieldTypeName, rule: Rule | null | undefined): boolean {
  if (!rule || isZeroRule(rule)) return false;
  if (!isScorable(type)) return true;
  if (isSelectType(type)) return Object.values(rule.option_points ?? {}).every((p) => p <= 0);
  return !(rule.points > 0);
}

type Types = ReadonlyMap<string, FieldTypeName>;

/** What `dirty` compares: the rules that score something and that their field can carry. */
const signature = (rules: ReadonlyMap<string, Rule>, types: Types) =>
  JSON.stringify(
    [...rules]
      .filter(([id, rule]) => !isZeroRule(rule) && !lostIn(types, id, rule))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, rule]) => [
        id,
        rule.points,
        Object.entries(rule.option_points ?? {})
          .filter(([, p]) => p > 0)
          .sort(([a], [b]) => (a < b ? -1 : 1)),
      ]),
  );

/** A field not in `types` (removed in this session) keeps its rule as it is. */
function lostIn(types: Types, id: string, rule: Rule): boolean {
  const type = types.get(id);
  return type !== undefined && ruleLost(type, rule);
}

const typesOf = (fields: readonly { id: string; type: FieldTypeName }[]): Types =>
  new Map(fields.map((f) => [f.id, f.type]));

/** The rules by field id, from the version's rows (deprecated ones too). */
function rulesFrom(rows: readonly ScoredFieldRow[]): Map<string, Rule> {
  const map = new Map<string, Rule>();
  for (const row of rows) {
    const rule = ruleOf(row);
    if (rule) map.set(row.id, rule);
  }
  return map;
}

/**
 * The builder's scoring: `ruleFor(id)`, `setRule(id, rule)`, `dirty` against what was loaded
 * or last sent, `rekey` after a save gives new fields their server ids, and `markSent`. `live`
 * is the live field set: a rule its field's type can no longer carry counts as removed, so a
 * type change that loses one makes the scoring dirty (fix round 1, I1).
 */
export function useScoring(
  rows: readonly ScoredFieldRow[],
  live: readonly { id: string; type: FieldTypeName }[],
) {
  const [state, setState] = useState(() => {
    const rules = rulesFrom(rows);
    return { rules, sent: signature(rules, typesOf(rows)) };
  });
  const types = useMemo(() => typesOf(live), [live]);

  const setRule = useCallback((id: string, rule: Rule | null) => {
    setState((s) => {
      const rules = new Map(s.rules);
      if (rule) rules.set(id, rule);
      else rules.delete(id);
      return { ...s, rules };
    });
  }, []);

  /** After a field save: a new field's `new-n` id becomes the id the server gave it. */
  const rekey = useCallback((ids: ReadonlyMap<string, string>) => {
    if (ids.size === 0) return;
    setState((s) => {
      const rules = new Map<string, Rule>();
      for (const [id, rule] of s.rules) rules.set(ids.get(id) ?? id, rule);
      return { ...s, rules };
    });
  }, []);

  /**
   * The rule set was sent. A rule its field could not carry was left out of it, so the server
   * no longer has it: it goes here too. `sentTypes` names each live field's type by its id
   * after any `rekey`.
   */
  const markSent = useCallback((sentTypes: Types) => {
    setState((s) => {
      const rules = new Map([...s.rules].filter(([id, rule]) => !lostIn(sentTypes, id, rule)));
      return { rules, sent: signature(rules, sentTypes) };
    });
  }, []);

  const dirty = useMemo(() => signature(state.rules, types) !== state.sent, [state, types]);
  const ruleFor = useCallback((id: string) => state.rules.get(id) ?? null, [state.rules]);

  return { rules: state.rules, ruleFor, setRule, rekey, markSent, dirty };
}

export type Scoring = ReturnType<typeof useScoring>;

/** A rule as `setScoringRules` takes it, or null when it scores nothing. */
function toInput(key: string, type: FieldTypeName, rule: Rule, allowed: Set<string> | null) {
  if (!isScorable(type)) return null;
  if (isSelectType(type)) {
    const kept = Object.fromEntries(
      Object.entries(rule.option_points ?? {}).filter(
        ([value, p]) => (allowed === null || allowed.has(value)) && Number.isFinite(p),
      ),
    );
    if (Object.values(kept).every((p) => p <= 0)) return null;
    return { field_key: key, points: 0, option_points: kept } satisfies ScoringRuleInput;
  }
  if (!(rule.points > 0)) return null;
  return { field_key: key, points: rule.points } satisfies ScoringRuleInput;
}

/**
 * The form's whole rule set, by key, for `setScoringRules` (it replaces every rule). This
 * version's fields give their rules from `rules` (by id): its live fields, then its other rows
 * (retired, or removed in this session). The other version's rows (the draft or the active
 * one) give the rules of keys this version does not have. Only keys in `universe` can be sent
 * — the server refuses any other — and a select keeps points only for options it still has
 * in either version. A rule that scores 0 everywhere is dropped: recorded, not scored.
 */
export function wholeRuleSet({
  live,
  others,
  partner,
  rules,
  universe,
}: {
  live: readonly { id: string; key: string; type: FieldTypeName }[];
  others: readonly { id: string; key: string; type: FieldTypeName }[];
  partner: readonly ScoredFieldRow[];
  rules: ReadonlyMap<string, Rule>;
  universe: readonly ScoringField[];
}): ScoringRuleInput[] {
  const byKey = new Map(universe.map((f) => [f.key, f]));
  const out = new Map<string, ScoringRuleInput>();
  const seen = new Set<string>();
  const add = (key: string, rule: Rule | null) => {
    if (seen.has(key)) return;
    seen.add(key);
    const field = byKey.get(key);
    if (!rule || !field) return;
    const allowed = isSelectType(field.type)
      ? new Set(selectOptions(field).map((o) => o.value))
      : null;
    const input = toInput(key, field.type, rule, allowed);
    if (input) out.set(key, input);
  };
  for (const f of live) add(f.key, rules.get(f.id) ?? null);
  for (const f of others) add(f.key, rules.get(f.id) ?? null);
  for (const row of partner) add(row.key, ruleOf(row));
  return [...out.values()];
}
