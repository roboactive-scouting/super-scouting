import {
  formatMetric,
  formatPercent,
  formatTime,
  formatWeekdayTime,
  formatDate,
  NO_VALUE,
  shadeFor,
  type Shade,
  type ShadeDomain,
  type StatGroup,
  type StatsMatchRow,
  type StatsMetric,
  type TeamStats,
} from '@frc/shared';

/*
 * How the team page (task 1.53) words and shades what `buildTeamStats` computed. Display only:
 * every number here was computed by @frc/shared; nothing is recomputed.
 */

/** The stat-row groups by name (24-team final: Overall, Autonomous, Teleop, Endgame). */
export const GROUP_NAME: Record<StatGroup, string> = {
  overall: 'Overall',
  auto: 'Autonomous',
  teleop: 'Teleop',
  endgame: 'Endgame',
  post_match: 'Post-match',
};

/** The short phase word a chart's picker puts before a field's label ("Teleop high goal"). */
const PHASE_WORD: Record<StatGroup, string> = {
  overall: '',
  auto: 'Auto',
  teleop: 'Teleop',
  endgame: 'Endgame',
  post_match: 'Post-match',
};

/**
 * Points and averages as every page prints them: whole bare ("41"), else one place ("38.4").
 * SPEC-FINAL 17.8 (v1.46) made this the app's one format, so it is @frc/shared's `formatMetric`
 * (task 1.58), not a copy.
 */
export function formatStat(value: number | null | undefined): string {
  return formatMetric(value);
}

/** The trend tile: the slope with its sign, "+1.3" / "−0.4". */
export function formatTrend(slope: number | null | undefined): string {
  if (slope === null || slope === undefined || !Number.isFinite(slope)) return NO_VALUE;
  const text = formatStat(Math.abs(slope));
  if (text === '0') return '0';
  return `${slope < 0 ? '−' : '+'}${text}`;
}

/** "Yael S.": a scouter's first name and initial (the match list and table, 24 final). */
export function scouterShort(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return NO_VALUE;
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}

/** A note's time: "11:52" today, "Fri 16:05" this week, else "14/11/2026 16:05". */
export function noteTime(iso: string, now: Date): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return NO_VALUE;
  if (formatDate(iso) === formatDate(now.toISOString())) return formatTime(iso);
  const days = (now.getTime() - at.getTime()) / 86_400_000;
  return days >= 0 && days < 6 ? formatWeekdayTime(iso) : `${formatDate(iso)} ${formatTime(iso)}`;
}

/** The colour domain of a metric (12.6): rates fixed 0–1, the rest the metric's own domain. */
export function metricDomain(metric: StatsMetric): ShadeDomain | null {
  if (metric.kind === 'nominal') return null;
  if (metric.kind === 'rate') return { kind: 'rate' };
  return metric.domain ? { kind: 'range', min: metric.domain.min, max: metric.domain.max } : null;
}

/** A metric's shade: the shared ramp; `neutral` comes back flat — never shaded. */
export function metricShade(metric: StatsMetric): Shade | null {
  if (metric.kind === 'nominal') return null;
  return shadeFor(metric.value, metricDomain(metric), metric.direction);
}

/**
 * A metric's value in words: "38.4", "89%", the ordinal's nearest option, the nominal's mode,
 * and a timer's "12.4 s" (its `display`).
 */
export function metricText(metric: StatsMetric): string {
  if (metric.kind === 'nominal' || metric.kind === 'ordinal') return metric.display ?? NO_VALUE;
  if (metric.value === null) return NO_VALUE;
  if (metric.display !== null) return metric.display;
  return metric.kind === 'rate' ? formatPercent(metric.value) : formatStat(metric.value);
}

/** A value of `metric`'s kind (one match's, the axis's): "34", "100%", rank "2". */
export function valueText(metric: Pick<StatsMetric, 'kind'>, value: number | null): string {
  if (value === null) return NO_VALUE;
  return metric.kind === 'rate' ? formatPercent(value) : formatStat(value);
}

/** The metrics in page order, grouped (Overall first, then the phases in form order). */
export function metricGroups(metrics: readonly StatsMetric[]): [StatGroup, StatsMetric[]][] {
  const out = new Map<StatGroup, StatsMetric[]>();
  for (const m of metrics) out.set(m.group, [...(out.get(m.group) ?? []), m]);
  return [...out.entries()];
}

/** The metric that IS points per match: the Progress chart's default line. */
export const POINTS_METRIC_KEY = 'average_points';

/**
 * The metrics a progression chart can show (12.5: one X dimension, the team's matches): points
 * per match, then every field metric with a per-match series. Median and std dev share the
 * points series, and a nominal field has none, so neither is offered.
 */
export function chartMetrics(metrics: readonly StatsMetric[]): StatsMetric[] {
  return metrics.filter(
    (m) =>
      m.key === POINTS_METRIC_KEY ||
      (m.field_key !== null &&
        m.kind !== 'nominal' &&
        m.unavailable_reason === null &&
        m.series.length > 0),
  );
}

/** A chart picker's words for a metric: "Points per match", "Teleop high goal". */
export function chartLabel(metric: StatsMetric): string {
  if (metric.key === POINTS_METRIC_KEY) return 'Points per match';
  const word = PHASE_WORD[metric.group];
  // A label that already names its phase ("Teleop notes scored") is not prefixed again.
  if (!word || metric.label.toLowerCase().startsWith(word.toLowerCase())) return metric.label;
  const [first = '', second = ''] = metric.label;
  // "High goal" → "high goal"; an acronym ("L4 coral") keeps its capitals.
  const label =
    second && /\p{Ll}/u.test(second) ? first.toLowerCase() + metric.label.slice(1) : metric.label;
  return `${word} ${label}`;
}

/** "Q55": the last match the team was seen in (the last row of the match order). */
export function lastSeen(stats: Pick<TeamStats, 'matches'>): string | null {
  for (let i = stats.matches.length - 1; i >= 0; i -= 1) {
    const label = stats.matches[i]!.match_label;
    if (label) return label;
  }
  return null;
}

const DEAD = new Set(['no_show', 'disabled']);

/** A dead robot (no-show, disabled): "—" in every value column, never a 0 (11.3). */
export const isDeadRow = (row: Pick<StatsMatchRow, 'robot_status'>): boolean =>
  row.robot_status !== null && DEAD.has(row.robot_status);

/** "Q14 Broke down, 18 points, Omer K.: open the entry" — what a match row says it opens. */
export function matchLinkLabel(row: StatsMatchRow): string {
  const status =
    row.robot_status === 'no_show'
      ? 'No show'
      : row.robot_status === 'broke_down'
        ? 'Broke down'
        : row.robot_status === 'disabled'
          ? 'Disabled'
          : 'Played';
  const points =
    row.scouted_points === null || isDeadRow(row)
      ? 'no points'
      : `${formatStat(row.scouted_points)} points`;
  return `${row.match_label ?? 'Match'} ${status}, ${points}, ${scouterShort(row.scouter_name)}: open the entry`;
}
