import { FIELD_PHASES, type FormKind } from '../api/forms';
import { isScorable } from '../forms/scoring';
import {
  selectOptions,
  type FieldPhase,
  type FieldType,
  type FormFieldDefinition,
  type RobotStatus,
} from '../forms/types';
import { isDeadRobot } from '../forms/validate';
import { isVisible } from '../forms/visibility';
import { aggregate, applyFilters } from './aggregate';
import { hydrateComputed, scoreEntry, scoreField } from './score';
import type { EngineEntry, ScoringRule } from './types';

/**
 * What the breakdown reads of an entry: plain row columns, so the server (getEntry, task 1.50)
 * and the device (the entry preview offline, task 1.52) call it with the same rows.
 */
export type BreakdownEntry = {
  form_kind: FormKind;
  robot_status: RobotStatus | null;
  data: Record<string, unknown>;
};

/**
 * One answer row of the entry preview (SPEC-FINAL 13.4). `value` is what the device shows: the
 * hydrated value as stored, except a select's, which is its option LABEL (a multi select's, the
 * labels of its picks, in the order picked) — never an ordinal rank. A key the entry does not
 * hold has no `value`. `points` is a number when a scoring rule scores the field (0 included:
 * a scored field that earned nothing) and null when nothing scores it — the preview then shows
 * no points cell. A super entry's points are all null.
 */
export type BreakdownField = {
  key: string;
  label: string;
  type: FieldType;
  value?: unknown;
  points: number | null;
};

/** One phase of the preview: its rows in form order, and their points' sum (null if none scored). */
export type BreakdownPhase = {
  phase: FieldPhase;
  subtotal: number | null;
  fields: BreakdownField[];
};

export type ScoreBreakdown = {
  /** Exactly `scoreEntry` for a match entry; null for a no-show, a disabled robot and a super entry. */
  total: number | null;
  phases: BreakdownPhase[];
};

/**
 * An entry's scouted points as every list and preview shows them: `scoreEntry` on the given
 * fields and rules — null for a no-show or disabled robot (SPEC-FINAL 11.3, never zero) — and
 * null for a SUPER entry, which has no score on any page (13.3, 13.4). The engine itself scores
 * a super entry's data (`scoreEntry` reads robot status only), so this is the one place that
 * says "a super entry shows no score".
 */
export function scoutedPoints(
  entry: BreakdownEntry,
  fields: readonly FormFieldDefinition[],
  rules: readonly ScoringRule[],
): number | null {
  if (entry.form_kind === 'super') return null;
  return scoreEntry({ robot_status: entry.robot_status, data: entry.data }, fields, rules);
}

/** A select's value as the device shows it: the option's label, else the value itself. */
function shownValue(field: FormFieldDefinition, value: unknown): unknown {
  if (field.type === 'single_select' && typeof value === 'string') {
    return selectOptions(field).find((o) => o.value === value)?.label ?? value;
  }
  if (field.type === 'multi_select' && Array.isArray(value)) {
    const options = selectOptions(field);
    return value.map((v) => options.find((o) => o.value === v)?.label ?? v);
  }
  return value;
}

/**
 * The entry preview's answers by phase, with each scored row's points and each phase's subtotal
 * (SPEC-FINAL 13.4; page 25), built on `scoreField` and `scoreEntry` so there is no second
 * scoring implementation (11.1). Pass the form's ACTIVE version's fields and the form's rules
 * (5.1), as `scoreEntry` is passed them.
 *
 * - A no-show or disabled robot: no phases and a null total — never a wall of zeros (11.3).
 * - A super entry: its answers by phase, every `points` and `subtotal` null, total null.
 * - Otherwise `total` IS `scoreEntry(...)`, and the subtotals are the sums of the rows' points.
 *
 * Which rows: the fields the confirmation summary shows — every field but a section heading,
 * in form order, under its `phase` (none → `post_match`), each key once (the first field that
 * carries it, as `scoreEntry` scores it). A field the active version retired, or whose own
 * condition hides it, is left out UNLESS the entry holds a value for it: a held value is shown,
 * and is exactly what `scoreEntry` scores, so the rows' points always add up to the total.
 * Computed fields are re-derived first (`hydrateComputed`, 5.7). Phases come in match order
 * (`FIELD_PHASES`), and a phase with no rows is left out.
 */
export function scoreBreakdown(
  entry: BreakdownEntry,
  fields: readonly FormFieldDefinition[],
  rules: readonly ScoringRule[],
): ScoreBreakdown {
  if (entry.robot_status !== null && isDeadRobot(entry.robot_status)) {
    return { total: null, phases: [] };
  }
  const scored = entry.form_kind !== 'super';
  const data = hydrateComputed(entry.data, fields);
  const byKey = new Map(rules.map((r) => [r.field_key, r]));
  const seen = new Set<string>();
  const rows = new Map<FieldPhase, BreakdownField[]>();

  for (const field of fields) {
    if (seen.has(field.key)) continue;
    seen.add(field.key);
    if (field.type === 'section') continue;
    const held = Object.prototype.hasOwnProperty.call(data, field.key);
    if (!held && (field.deprecated || !isVisible(field, data))) continue;
    const rule = byKey.get(field.key);
    const value = data[field.key];
    const row: BreakdownField = {
      key: field.key,
      label: field.label,
      type: field.type,
      points: scored && rule && isScorable(field.type) ? scoreField(field, rule, value) : null,
    };
    if (held) row.value = shownValue(field, value);
    const phase = field.phase ?? 'post_match';
    rows.set(phase, [...(rows.get(phase) ?? []), row]);
  }

  const phases = FIELD_PHASES.flatMap((phase): BreakdownPhase[] => {
    const list = rows.get(phase);
    if (!list || list.length === 0) return [];
    const points = list.map((r) => r.points).filter((p): p is number => p !== null);
    return [
      {
        phase,
        subtotal: points.length > 0 ? points.reduce((sum, p) => sum + p, 0) : null,
        fields: list,
      },
    ];
  });
  return { total: scoutedPoints(entry, fields, rules), phases };
}

/** A team's average scouted points over its counted match entries (`averagePoints`). */
export type AveragePoints = { avg: number | null; matches_counted: number };

/**
 * ONE team's average scouted points (NEXT-CHAT "1.57 average points"; task 1.50 for the entry
 * preview's band and the team search's rank): `aggregate(applyFilters(matchEntries, {}, fields)
 * .map(scoreEntry), 'avg')`. Only `form_kind === 'match'` entries are read — a super entry passes
 * the qualification and status rules — so the population is the team's canonical, live,
 * qualification, not-dead match entries. `matches_counted` is that population's size; with
 * none, `avg` is null, never 0. Pass one team's entries; the caller groups.
 */
export function averagePoints(
  entries: readonly EngineEntry[],
  fields: readonly FormFieldDefinition[],
  rules: readonly ScoringRule[],
): AveragePoints {
  const counted = applyFilters(
    entries.filter((e) => e.form_kind === 'match'),
    {},
    fields,
  );
  return {
    avg: aggregate(
      counted.map((e) => scoreEntry(e, fields, rules)),
      'avg',
    ),
    matches_counted: counted.length,
  };
}

/** One roster team's place by average points (`rankByAveragePoints`). */
export type TeamRank = {
  team_id: string;
  number: number;
  /** 1-based; null when the team has no counted match entry ("not ranked yet"). */
  rank: number | null;
  avg: number | null;
  matches_counted: number;
};

/**
 * The interim event rank (task 1.50, until the ranking dashboard of task 1.58): each roster
 * team's `averagePoints` over ITS entries in `entries`, ranked highest first, ties to the lower
 * team number. A team with no counted match entry has `rank: null` and comes after every ranked
 * team, by number. Entries of a team not in `teams` are ignored. Positions are 1, 2, 3, … with
 * no shared places. Pure, so the device ranks offline exactly as the server does.
 */
export function rankByAveragePoints(
  entries: readonly EngineEntry[],
  teams: readonly { id: string; number: number }[],
  fields: readonly FormFieldDefinition[],
  rules: readonly ScoringRule[],
): TeamRank[] {
  const byTeam = new Map<string, EngineEntry[]>(teams.map((t) => [t.id, []]));
  for (const entry of entries) byTeam.get(entry.team_id)?.push(entry);
  const all = [...new Map(teams.map((t) => [t.id, t])).values()].map((team) => ({
    team_id: team.id,
    number: team.number,
    ...averagePoints(byTeam.get(team.id) ?? [], fields, rules),
  }));
  const ranked = all
    .filter((t) => t.matches_counted > 0 && t.avg !== null)
    .sort((a, b) => (b.avg as number) - (a.avg as number) || a.number - b.number)
    .map((t, i) => ({ ...t, rank: i + 1 }));
  const unranked = all
    .filter((t) => t.matches_counted === 0 || t.avg === null)
    .sort((a, b) => a.number - b.number)
    .map((t) => ({ ...t, rank: null }));
  return [...ranked, ...unranked];
}
