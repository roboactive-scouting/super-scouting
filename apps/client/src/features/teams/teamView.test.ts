import { describe, expect, it } from 'vitest';
import type { StatsMatchRow, StatsMetric } from '@frc/shared';
import {
  chartLabel,
  chartMetrics,
  formatStat,
  formatTrend,
  isDeadRow,
  lastSeen,
  matchLinkLabel,
  metricShade,
  metricText,
  noteTime,
  scouterShort,
} from './teamView';

const metric = (over: Partial<StatsMetric>): StatsMetric => ({
  key: 'field:x',
  field_key: 'x',
  label: 'High goal',
  group: 'teleop',
  kind: 'number',
  aggregation: 'avg',
  direction: 'higher_is_better',
  value: 3,
  display: null,
  domain: { min: 0, max: 6 },
  series: [{ entry_id: 'e-1', match_label: 'Q1', value: 3 }],
  unavailable_reason: null,
  ...over,
});

const row = (over: Partial<StatsMatchRow>): StatsMatchRow => ({
  entry_id: 'e-1',
  match_id: 'm-1',
  match_label: 'Q14',
  match_type: 'qualification',
  match_number: 14,
  robot_status: 'played',
  scouted_points: 18,
  scouter_id: 'u-1',
  scouter_name: 'Omer Katz',
  columns: {},
  ...over,
});

describe('team page words (task 1.53)', () => {
  it('prints points and averages to one place, whole numbers bare (the design: 38.4, 41)', () => {
    expect(formatStat(38.4)).toBe('38.4');
    expect(formatStat(32.333)).toBe('32.3');
    expect(formatStat(41)).toBe('41');
    expect(formatStat(2.96)).toBe('3');
    expect(formatStat(null)).toBe('—');
  });

  it('signs the trend', () => {
    expect(formatTrend(1.31)).toBe('+1.3');
    expect(formatTrend(-0.44)).toBe('−0.4');
    expect(formatTrend(0.01)).toBe('0');
    expect(formatTrend(null)).toBe('—');
  });

  it('names a scouter by first name and initial', () => {
    expect(scouterShort('Yael Shapira')).toBe('Yael S.');
    expect(scouterShort('Amit Ben-David')).toBe('Amit B.');
    expect(scouterShort('Noa')).toBe('Noa');
    expect(scouterShort(null)).toBe('—');
  });

  it('dates a note: today a time, this week a weekday, else the date', () => {
    const now = new Date('2026-11-14T14:30:00.000Z');
    expect(noteTime('2026-11-14T12:05:00.000Z', now)).toMatch(/^\d{2}:05$/);
    expect(noteTime('2026-11-13T09:20:00.000Z', now)).toMatch(/^Fri \d{2}:20$/);
    expect(noteTime('2026-10-01T09:20:00.000Z', now)).toMatch(/^01\/10\/2026 \d{2}:20$/);
  });

  it('words a metric by kind: number, percent, ordinal and nominal labels', () => {
    expect(metricText(metric({ value: 7.25 }))).toBe('7.3');
    expect(metricText(metric({ kind: 'rate', value: 0.894 }))).toBe('89%');
    expect(metricText(metric({ kind: 'ordinal', value: 1.6, display: 'Deep' }))).toBe('Deep');
    expect(metricText(metric({ kind: 'nominal', value: null, display: 'Shallow' }))).toBe(
      'Shallow',
    );
    expect(metricText(metric({ value: null }))).toBe('—');
    // A timer's seconds come worded by the engine.
    expect(metricText(metric({ value: 12.43, display: '12.4 s' }))).toBe('12.4 s');
  });

  it('never shades a neutral metric, and a nominal one not at all', () => {
    expect(metricShade(metric({ direction: 'neutral' }))!.flat).toBe(true);
    expect(metricShade(metric({ kind: 'nominal', value: null, display: 'Deep' }))).toBeNull();
    expect(metricShade(metric({ value: null }))).toBeNull();
    expect(metricShade(metric({ value: 6 }))!.mix).toBe(52);
    expect(metricShade(metric({ value: 6, direction: 'lower_is_better' }))!.mix).toBe(6);
    // A rate is shaded on 0–1 whatever its observed domain.
    expect(metricShade(metric({ kind: 'rate', value: 1, domain: null }))!.mix).toBe(52);
  });

  it('offers points per match and the field metrics with a series to a chart', () => {
    const list = [
      metric({ key: 'average_points', field_key: null, label: 'Average points', group: 'overall' }),
      metric({ key: 'median_points', field_key: null, label: 'Median points', group: 'overall' }),
      metric({ key: 'field:a' }),
      metric({ key: 'field:n', kind: 'nominal', series: [] }),
      metric({ key: 'field:t', unavailable_reason: 'type-changed', series: [] }),
    ];
    expect(chartMetrics(list).map((m) => m.key)).toEqual(['average_points', 'field:a']);
    expect(chartLabel(list[0]!)).toBe('Points per match');
    expect(chartLabel(metric({}))).toBe('Teleop high goal');
    expect(chartLabel(metric({ label: 'Teleop notes scored' }))).toBe('Teleop notes scored');
    expect(chartLabel(metric({ label: 'L4 coral', group: 'auto' }))).toBe('Auto L4 coral');
  });

  it('names the last match seen, and a dead robot’s row', () => {
    expect(lastSeen({ matches: [row({}), row({ match_label: 'Q37' })] })).toBe('Q37');
    expect(lastSeen({ matches: [] })).toBeNull();
    expect(isDeadRow(row({ robot_status: 'no_show' }))).toBe(true);
    expect(isDeadRow(row({ robot_status: 'disabled' }))).toBe(true);
    expect(isDeadRow(row({ robot_status: 'broke_down' }))).toBe(false);
    expect(matchLinkLabel(row({ robot_status: 'broke_down' }))).toBe(
      'Q14 Broke down, 18 points, Omer K.: open the entry',
    );
    expect(matchLinkLabel(row({ robot_status: 'no_show', scouted_points: null }))).toBe(
      'Q14 No show, no points, Omer K.: open the entry',
    );
  });
});
