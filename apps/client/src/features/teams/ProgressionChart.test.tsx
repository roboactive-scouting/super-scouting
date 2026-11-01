import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StatsMetric } from '@frc/shared';
import { ProgressionChart, ProgressPanel } from './ProgressionChart';

/*
 * Phase 1 I side task 5 (plan v1.33): a field's chart shows the answers it has. A match whose form
 * version had no such field (`asked: false`) draws nothing — no point, no "—", no dotted bridge —
 * and keeps its place on the x-axis; a field chart with no value says so in one line; one value
 * is one dot and the team value line.
 */

type P = number | null | 'not asked';
const metric = (series: P[], over: Partial<StatsMetric> = {}): StatsMetric => {
  const answers = series.filter((v): v is number => typeof v === 'number');
  return {
    key: 'field:driver_skill',
    field_key: 'driver_skill',
    label: 'Driver skill',
    group: 'post_match',
    kind: 'number',
    aggregation: 'avg',
    direction: 'higher_is_better',
    value: answers.length ? answers.reduce((a, b) => a + b, 0) / answers.length : null,
    display: null,
    domain: { min: 1, max: 5 },
    series: series.map((v, i) => ({
      entry_id: `e-${i + 1}`,
      match_label: `Q${i + 1}`,
      value: v === 'not asked' ? null : v,
      asked: v !== 'not asked',
    })),
    unavailable_reason: null,
    ...over,
  };
};

const played = () => 'played' as const;

function draw(m: StatsMetric) {
  const { container } = render(<ProgressionChart metric={m} statusOf={played} />);
  const svg = container.querySelector('svg');
  const texts = [...(svg?.querySelectorAll('text') ?? [])].map((t) => t.textContent);
  return {
    container,
    svg,
    points: container.querySelectorAll('[data-mark="point"]').length,
    dashes: texts.filter((t) => t === '—').length,
    bridges: container.querySelectorAll('path[stroke-dasharray="2 3"]').length,
    teamLine: container.querySelectorAll('line[stroke-dasharray="3 3"]').length,
    axis: texts.filter((t) => t !== null && /^\d+$/.test(t)),
    line: svg?.querySelector('path.stroke-accent')?.getAttribute('d') ?? '',
    said: [...container.querySelectorAll('li')].map((li) => li.textContent),
  };
}

describe('ProgressionChart: a field chart shows the answers it has', () => {
  it('draws one answer as one dot with the team value line', () => {
    const chart = draw(metric(['not asked', 'not asked', 'not asked', 4]));
    expect(chart.points).toBe(1);
    expect(chart.teamLine).toBe(1);
    expect(chart.dashes).toBe(0);
    expect(chart.container.querySelector('[data-chart-empty]')).toBeNull();
  });

  it('draws no dash, point or bridge for a match whose version lacked the field; the axis keeps it', () => {
    const chart = draw(metric(['not asked', 'not asked', 3, null, 5]));
    // Q4's "—" (a gap between two answers, bridged); nothing over Q1 and Q2.
    expect(chart.dashes).toBe(1);
    expect(chart.bridges).toBe(1);
    expect(chart.points).toBe(2);
    expect(chart.axis).toEqual(expect.arrayContaining(['1', '2', '3', '4', '5']));
    expect(chart.said.slice(0, 2)).toEqual([
      'Q1: not on the form for this match',
      'Q2: not on the form for this match',
    ]);
    expect(chart.said[3]).toBe('Q4: no value');
  });

  it('bridges nothing across a match whose version lacked the field', () => {
    const chart = draw(metric([3, 'not asked', 5]));
    expect(chart.points).toBe(2);
    expect(chart.dashes).toBe(0);
    expect(chart.bridges).toBe(0);
    // The line is broken there: two separate pieces, one point each.
    expect(chart.line.match(/M/g)).toHaveLength(2);
    expect(chart.line).not.toContain('L');
  });

  it('still draws "—" for a no-show, a field left empty and an unsure timer on a version that had it', () => {
    const chart = draw(metric([4, null, null, 2]));
    expect(chart.dashes).toBe(2);
    expect(chart.points).toBe(2);
  });

  it('says so in one line when a field has no value at all, instead of an empty plot', () => {
    for (const series of [
      ['not asked', 'not asked', 'not asked'],
      ['not asked', null, null],
    ] as P[][]) {
      const chart = draw(metric(series));
      expect(chart.svg).toBeNull();
      expect(chart.container.textContent).toBe('No Driver skill answers for this team yet');
    }
  });

  it('keeps the plot for points per match, which always has its matches', () => {
    const chart = draw(
      metric([null, null], { key: 'average_points', field_key: null, label: 'Average points' }),
    );
    expect(chart.svg).not.toBeNull();
    expect(chart.dashes).toBe(2);
  });

  it('drops the legend under an empty first chart in the Progress tab', () => {
    const empty = metric(['not asked', null]);
    const points = metric([3, 4], {
      key: 'average_points',
      field_key: null,
      label: 'Average points',
    });
    const { rerender } = render(
      <ProgressPanel
        metrics={[points, empty]}
        charts={[empty.key]}
        onChange={() => {}}
        statusOf={played}
      />,
    );
    expect(screen.getByText('No Driver skill answers for this team yet')).toBeInTheDocument();
    expect(screen.queryByText('team average')).toBeNull();
    rerender(
      <ProgressPanel
        metrics={[points, empty]}
        charts={[points.key]}
        onChange={() => {}}
        statusOf={played}
      />,
    );
    expect(screen.getByText('team average')).toBeInTheDocument();
  });
});
