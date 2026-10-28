import {
  FIELD_PHASES,
  formatCount,
  formatMetric,
  formatPercent,
  formatStdDev,
  NO_VALUE,
  PHASE_SORT_KEYS,
  phaseOfSortKey,
  RANK_SORT_DEFAULT_DIRECTION,
  rankRowHasData,
  rankSortValue,
  sortRankRows,
  type FieldPhase,
  type RankRow,
  type RankSortKey,
  type RankSortStep,
} from '@frc/shared';

/*
 * The ranking page (SPEC-FINAL 13.5, 27-ranking final, task 1.58) as plain functions: the two
 * categories and their figures, the sort (one figure or several), its words, the status spread
 * and the team study's figures. Display only: every number was computed by @frc/shared's
 * `buildRankTable` (the server's `rankTeams`, or the device's own copy); the order is its
 * `sortRankRows`. Nothing is recomputed here.
 */

export type Category = 'scoring' | 'availability';

export const CATEGORY_NAME: Record<Category, string> = {
  scoring: 'Scoring',
  availability: 'Availability',
};

/** Each phase's word in a header, the bar's legend and the study panel. */
export const PHASE_NAME: Record<FieldPhase, string> = {
  auto: 'Auto',
  teleop: 'Teleop',
  endgame: 'Endgame',
  post_match: 'Post-match',
};

/**
 * How a figure reads and sorts. `points`: an average (best first = most points). `rate`:
 * availability, a 0–1 fraction (best first = highest). `count`: breakdowns, no-shows, disabled
 * (best first = fewest).
 */
export type FigureKind = 'points' | 'rate' | 'count';

/** A figure that can order the list: a sort key of `rankTeams` (`stddev` is never one). */
export type SortFigure = {
  key: RankSortKey;
  label: string;
  kind: FigureKind;
};

const COUNT_KEYS: ReadonlySet<RankSortKey> = new Set(['breakdowns', 'no_shows', 'disabled']);

/** The table's phases: the ones on its rows (every row carries the same, in FIELD_PHASES order). */
export function phasesOf(rows: readonly RankRow[]): FieldPhase[] {
  const held = new Set(rows.flatMap((r) => r.phase_averages.map((p) => p.phase)));
  return FIELD_PHASES.filter((phase) => held.has(phase));
}

/** A sort key's figure: its header word and kind. */
export function figureOf(key: RankSortKey): SortFigure {
  const phase = phaseOfSortKey(key);
  if (phase !== null) return { key, label: PHASE_NAME[phase], kind: 'points' };
  switch (key) {
    case 'average_points':
      return { key, label: 'Total', kind: 'points' };
    case 'availability_rate':
      return { key, label: 'Availability', kind: 'rate' };
    case 'breakdowns':
      return { key, label: 'Breakdowns', kind: 'count' };
    case 'no_shows':
      return { key, label: 'No-shows', kind: 'count' };
    case 'disabled':
      return { key, label: 'Disabled', kind: 'count' };
    case 'matches_counted':
      return { key, label: 'Matches', kind: 'count' };
    default:
      return { key, label: 'Team', kind: 'count' };
  }
}

/**
 * The figures each category sorts by, in header order (27-ranking README): Scoring is Total then
 * one per scoring phase; Availability is Availability, Breakdowns, No-shows, Disabled.
 * Consistency is shown but never sorts (SPEC-FINAL 11.3), and Matches only reads.
 */
export function sortFigures(category: Category, phases: readonly FieldPhase[]): SortFigure[] {
  const keys: RankSortKey[] =
    category === 'scoring'
      ? ['average_points', ...phases.map((p) => PHASE_SORT_KEYS[p])]
      : ['availability_rate', 'breakdowns', 'no_shows', 'disabled'];
  return keys.map(figureOf);
}

/** Each category's first sort (27-ranking README "Defaults"): its headline figure, best first. */
export const DEFAULT_SORT: Record<Category, RankSortStep[]> = {
  scoring: [{ key: 'average_points', direction: RANK_SORT_DEFAULT_DIRECTION.average_points }],
  availability: [
    { key: 'availability_rate', direction: RANK_SORT_DEFAULT_DIRECTION.availability_rate },
  ],
};

/** Whether a step runs best first: the direction `rankTeams` takes by default for that key. */
export const isBestFirst = (step: RankSortStep): boolean =>
  RANK_SORT_DEFAULT_DIRECTION[step.key] === step.direction;

/** A key's direction for best (or worst) first. */
export function directionFor(key: RankSortKey, best: boolean): RankSortStep['direction'] {
  const bestDir = RANK_SORT_DEFAULT_DIRECTION[key];
  return best ? bestDir : bestDir === 'asc' ? 'desc' : 'asc';
}

/** The two words of a figure's directions: "Best" / "Worst", or for a count "Fewest" / "Most". */
export function directionWords(key: RankSortKey): { best: string; worst: string } {
  return COUNT_KEYS.has(key) ? { best: 'Fewest', worst: 'Most' } : { best: 'Best', worst: 'Worst' };
}

/** One step in words: "best first", "fewest first". */
export function directionText(step: RankSortStep): string {
  const words = directionWords(step.key);
  return `${(isBestFirst(step) ? words.best : words.worst).toLowerCase()} first`;
}

/** The whole sort as the Sort control says it: "Availability, best first · then Breakdowns, …". */
export function sortSentence(sort: readonly RankSortStep[]): string {
  return sort
    .map((step, i) => `${i ? 'then ' : ''}${figureOf(step.key).label}, ${directionText(step)}`)
    .join(' · ');
}

/**
 * A header click (27-ranking README "Sort"): the figure becomes the whole sort, best first; when
 * it already is the whole sort, the click reverses it.
 */
export function headerClick(sort: readonly RankSortStep[], key: RankSortKey): RankSortStep[] {
  const only = sort.length === 1 ? sort[0] : undefined;
  if (only?.key === key) {
    return [{ key, direction: only.direction === 'asc' ? 'desc' : 'asc' }];
  }
  return [{ key, direction: directionFor(key, true) }];
}

/** The Sort builder's edits. A sort keeps at least one figure. */
export function addStep(sort: readonly RankSortStep[], key: RankSortKey): RankSortStep[] {
  if (sort.some((s) => s.key === key)) return [...sort];
  return [...sort, { key, direction: directionFor(key, true) }];
}

export function removeStep(sort: readonly RankSortStep[], key: RankSortKey): RankSortStep[] {
  const next = sort.filter((s) => s.key !== key);
  return next.length > 0 ? next : [...sort];
}

export function setStepBest(
  sort: readonly RankSortStep[],
  key: RankSortKey,
  best: boolean,
): RankSortStep[] {
  return sort.map((s) => (s.key === key ? { key, direction: directionFor(key, best) } : s));
}

export function moveStep(sort: readonly RankSortStep[], from: number, to: number): RankSortStep[] {
  if (from === to || from < 0 || to < 0 || from >= sort.length || to >= sort.length) {
    return [...sort];
  }
  const next = [...sort];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * The figures the builder offers as tie-breakers: the open category's figures not in the sort
 * yet. Never Consistency, never another category's figure.
 */
export function tieBreakers(
  category: Category,
  phases: readonly FieldPhase[],
  sort: readonly RankSortStep[],
): SortFigure[] {
  const used = new Set(sort.map((s) => s.key));
  return sortFigures(category, phases).filter((f) => !used.has(f.key));
}

/** Rows in a sort's order: @frc/shared's one ranking order (no data last; ties to rank). */
export const sortedRows = (rows: readonly RankRow[], sort: readonly RankSortStep[]): RankRow[] =>
  sortRankRows(rows, sort);

/** Where a key stands in the sort: 0 for the first figure, … ; -1 when it is not in it. */
export const sortIndex = (sort: readonly RankSortStep[], key: RankSortKey): number =>
  sort.findIndex((s) => s.key === key);

// ---------------------------------------------------------------------------------------
// Words of one row. A row with no data prints "—" in every figure, never a zero.

export const hasData = rankRowHasData;

/** A figure's value in words: "81.2", "100%", "3"; "—" when the row has no data or no value. */
export function figureText(row: RankRow, key: RankSortKey): string {
  if (!rankRowHasData(row)) return NO_VALUE;
  const value = rankSortValue(row, key);
  const kind = figureOf(key).kind;
  if (kind === 'rate') return formatPercent(value);
  if (kind === 'count') return formatCount(value);
  return formatMetric(value);
}

/** A figure's raw value (null for no data): what 1.59's shading reads. */
export function figureValue(row: RankRow, key: RankSortKey): number | null {
  return rankRowHasData(row) ? rankSortValue(row, key) : null;
}

/** Consistency: "±6.1"; "—" with fewer than two counted matches or no data. */
export const consistencyText = (row: RankRow): string => formatStdDev(row.stddev);

/** Matches counted; "—" for a row with no data. */
export const matchesText = (row: RankRow): string =>
  rankRowHasData(row) ? formatCount(row.matches_counted) : NO_VALUE;

/** A phase's average of a row (null: no data). */
export function phaseAverage(row: RankRow, phase: FieldPhase): number | null {
  return row.phase_averages.find((p) => p.phase === phase)?.average ?? null;
}

// ---------------------------------------------------------------------------------------
// Robot status (THEME "Robot status": Played dot, Broke down diamond, Disabled hollow square,
// No show dash) over the team's SCOUTED matches only.

export type StatusKey = 'played' | 'broke_down' | 'disabled' | 'no_show';

export const STATUS_WORD: Record<StatusKey, string> = {
  played: 'Played',
  broke_down: 'Broke down',
  disabled: 'Disabled',
  no_show: 'No show',
};

/** The four counts of a row's scouted matches. Played = matches counted − breakdowns. */
export type StatusSpread = Record<StatusKey, number>;

export function statusSpread(row: RankRow): StatusSpread {
  return {
    played: Math.max(0, row.matches_counted - row.breakdowns),
    broke_down: row.breakdowns,
    disabled: row.disabled,
    no_show: row.no_shows,
  };
}

/**
 * One mark per problem match, in THEME order — broke down, disabled, no show — for the Scoring
 * view's availability (Status marks). A clean team has none.
 */
export function statusMarks(row: RankRow): StatusKey[] {
  return [
    ...Array<StatusKey>(row.breakdowns).fill('broke_down'),
    ...Array<StatusKey>(row.disabled).fill('disabled'),
    ...Array<StatusKey>(row.no_shows).fill('no_show'),
  ];
}

/** The Scoring view's availability cell in words, for a screen reader. */
export function availabilityLabel(row: RankRow): string {
  if (!rankRowHasData(row)) return 'Availability: no counted matches yet';
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return `Availability ${formatPercent(row.availability_rate)} · ${plural(row.breakdowns, 'breakdown', 'breakdowns')} · ${row.disabled} disabled · ${plural(row.no_shows, 'no-show', 'no-shows')}`;
}

/**
 * The Status spread's scale for a table: the most matches any team was on the field for (left of
 * the line) and the most it missed (right; at least one, so "Missed" always has room).
 */
export function spreadScale(rows: readonly RankRow[]): { onField: number; missed: number } {
  let onField = 1;
  let missed = 1;
  for (const row of rows) {
    if (!rankRowHasData(row)) continue;
    const s = statusSpread(row);
    onField = Math.max(onField, s.played + s.broke_down);
    missed = Math.max(missed, s.disabled + s.no_show);
  }
  return { onField, missed };
}

// ---------------------------------------------------------------------------------------
// The team study (study panel, summary sheet)

/** "1st", "2nd", "3rd", "11th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** The team's place in a phase among the teams with a value: 1 + those strictly above it. */
export function phasePlace(
  rows: readonly RankRow[],
  row: RankRow,
  phase: FieldPhase,
): number | null {
  const own = phaseAverage(row, phase);
  if (own === null) return null;
  return (
    rows.filter((r) => {
      const v = phaseAverage(r, phase);
      return v !== null && v > own;
    }).length + 1
  );
}

/** A phase's share of Total, as a whole percent ("60%"); "—" with no Total. */
export function phaseShare(row: RankRow, phase: FieldPhase): string {
  const avg = phaseAverage(row, phase);
  const total = row.average_points;
  if (avg === null || total === null || total <= 0) return NO_VALUE;
  return formatPercent(avg / total);
}

/** How many teams hold a rank (the "of N" of "Rank 4 of 23"). */
export const rankedCount = (rows: readonly RankRow[]): number =>
  rows.filter((r) => r.rank !== null).length;

/**
 * The Consistency strip (THEME "Team study panel"): an axis from 0 to a round ceiling over every
 * team's Total + SD (a multiple of 20), the typical-match band Total ± SD (never below 0), and
 * the mean. Null with no Total or no SD.
 */
export function typicalRange(
  rows: readonly RankRow[],
  row: RankRow,
): { low: number; high: number; mean: number; axisMax: number } | null {
  if (row.average_points === null || row.stddev === null) return null;
  const top = Math.max(
    ...rows.map((r) => (r.average_points ?? 0) + (r.stddev ?? 0)),
    row.average_points + row.stddev,
    1,
  );
  return {
    low: Math.max(0, row.average_points - row.stddev),
    high: row.average_points + row.stddev,
    mean: row.average_points,
    axisMax: Math.ceil(top / 20) * 20,
  };
}

/** The event's highest Total: what every row's By-phase bar is drawn against. */
export const highestTotal = (rows: readonly RankRow[]): number =>
  Math.max(0, ...rows.map((r) => r.average_points ?? 0));
