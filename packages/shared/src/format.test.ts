import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatDate,
  formatMetric,
  formatPercent,
  formatTime,
  formatDayTime,
  formatWeekdayTime,
} from './format';

describe('formatting (SPEC-FINAL 17.8)', () => {
  it('renders metrics and standard deviations to 2 decimals', () => {
    expect(formatMetric(12.3456)).toBe('12.35');
    expect(formatMetric(12)).toBe('12.00');
  });

  it('renders null as an em dash, never as zero', () => {
    expect(formatMetric(null)).toBe('—');
    expect(formatPercent(null)).toBe('—');
    expect(formatCount(null)).toBe('—');
  });

  it('renders counts and team numbers with no decimals and no separator', () => {
    expect(formatCount(2096)).toBe('2096');
    expect(formatCount(120)).toBe('120');
  });

  it('renders rates as whole-number percentages', () => {
    expect(formatPercent(0.8333)).toBe('83%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('renders dates as DD/MM/YYYY and times in 24 hours', () => {
    const iso = '2026-11-14T09:31:02.000Z';
    expect(formatDate(iso, 'UTC')).toBe('14/11/2026');
    expect(formatTime(iso, 'UTC')).toBe('09:31');
  });

  it('renders a day in words with a 24-hour time, the month from a fixed list', () => {
    expect(formatDayTime('2026-10-12T08:02:00.000Z', 'UTC')).toBe('Mon 12 Oct, 08:02');
    expect(formatDayTime('2026-09-04T17:40:00.000Z', 'UTC')).toBe('Fri 4 Sep, 17:40');
    expect(formatDayTime('2026-10-12T22:30:00.000Z', 'Asia/Jerusalem')).toBe('Tue 13 Oct, 01:30');
    expect(formatWeekdayTime('2026-10-10T14:20:00.000Z', 'UTC')).toBe('Sat 14:20');
  });
});
