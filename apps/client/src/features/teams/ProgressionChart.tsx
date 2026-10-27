import { Plus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { RobotStatus, StatsMetric } from '@frc/shared';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { chartLabel, chartMetrics, formatStat, valueText } from './teamView';

/*
 * The per-match line view (SPEC-FINAL 13.1, 12.5; THEME "Progression chart") — task 1.59's chart,
 * pulled forward into task 1.53. Hand-written SVG, not Recharts: the team page is a precached
 * offline chunk, and the marks (a no-show gap bridged by a dotted line, the broke-down diamond)
 * are custom anyway. The SVG is decoration for sighted readers (`aria-hidden`); the figure's name
 * and a visually hidden list carry the same values, so the page has no `img` role.
 */

/** Charts stacked by the §12.5 expand, at most. */
export const MAX_CHARTS = 4;

const L = 30;
const R = 10;
const T = 12;
const B = 22;

/** The width of `ref`'s box, following resizes; `fallback` until it is measured (and in jsdom). */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A "nice" step covering `x`: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(x: number): number {
  if (!(x > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  const f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** The axis: three ticks from 0, a little head room over the highest value. */
function axisOf(metric: StatsMetric, values: number[]): { ticks: number[]; max: number } {
  if (metric.kind === 'rate') return { ticks: [0, 0.5, 1], max: 1.1 };
  const top = Math.max(0, ...values, metric.value ?? 0);
  // The top tick may sit a little under the highest value (47 → 0 · 25 · 50; 52 → 0 · 25 · 50).
  const step = niceStep(top / 2.2);
  return { ticks: [0, step, 2 * step], max: Math.max(2 * step, top) * 1.1 };
}

type Point = { label: string; value: number | null; status: RobotStatus | null };

/** What a missing point says in the text alternative. */
function missing(status: RobotStatus | null): string {
  if (status === 'no_show') return 'no show, not counted';
  if (status === 'disabled') return 'disabled, not counted';
  return 'no value';
}

/**
 * One chart: the metric over the team's matches, oldest → newest. A null is a GAP — a no-show or
 * a disabled robot is never drawn as 0 — bridged by a dotted `--faint` line with "—" over it; a
 * broke-down match is a `--warn` diamond; the dashed `--faint` line is the team's value (its
 * average).
 */
export function ProgressionChart({
  metric,
  statusOf,
  height = 140,
}: {
  metric: StatsMetric;
  /** The robot status of an entry of the series (the match table's), for the marks. */
  statusOf: (entryId: string) => RobotStatus | null;
  height?: number;
}) {
  const [box, width] = useWidth(340);
  const points: Point[] = metric.series.map((s) => ({
    label: s.match_label,
    value: s.value,
    status: statusOf(s.entry_id),
  }));
  const name = chartLabel(metric);
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const { ticks, max } = axisOf(metric, values);
  const W = Math.max(width, 160);
  const H = height;
  const n = points.length;
  const x = (i: number) => (n <= 1 ? (L + W - R) / 2 : L + (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  // Labels a match number at least every 18 px, so a long event does not overlap them.
  const every = n <= 1 ? 1 : Math.max(1, Math.ceil(18 / ((W - L - R) / (n - 1))));
  const average = metric.value;

  const line: string[] = [];
  let pen = false;
  points.forEach((p, i) => {
    if (p.value === null) {
      pen = false;
      return;
    }
    line.push(`${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`);
    pen = true;
  });

  // Each gap: a dotted bridge between its neighbours (when it has both) and "—" over each miss.
  const bridges: ReactNode[] = [];
  const dashes: ReactNode[] = [];
  points.forEach((p, i) => {
    if (p.value !== null) return;
    let a = i - 1;
    while (a >= 0 && points[a]!.value === null) a -= 1;
    let b = i + 1;
    while (b < n && points[b]!.value === null) b += 1;
    const left = a >= 0 ? points[a]!.value : null;
    const right = b < n ? points[b]!.value : null;
    let at = average !== null ? y(average) : y(ticks[1]!);
    if (left !== null && right !== null) {
      at = y(left) + ((y(right) - y(left)) * (x(i) - x(a))) / (x(b) - x(a));
      if (a === i - 1) {
        bridges.push(
          <path
            key={`b${i}`}
            d={`M${x(a).toFixed(1)} ${y(left).toFixed(1)} L${x(b).toFixed(1)} ${y(right).toFixed(1)}`}
            className="fill-none stroke-faint"
            strokeWidth={1.2}
            strokeDasharray="2 3"
          />,
        );
      }
    }
    dashes.push(
      <text
        key={`d${i}`}
        x={x(i)}
        y={at - 8}
        textAnchor="middle"
        className="num fill-muted text-[0.625rem]"
      >
        —
      </text>,
    );
  });

  return (
    <figure aria-label={`${name}, match by match`} className="m-0">
      <div ref={box} className="w-full">
        <svg
          aria-hidden="true"
          focusable="false"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block max-w-full"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={L}
                x2={W - R}
                y1={y(t)}
                y2={y(t)}
                className="stroke-line-2"
                strokeWidth={1}
              />
              <text
                x={L - 6}
                y={y(t) + 3}
                textAnchor="end"
                className="num fill-muted text-[0.625rem]"
              >
                {metric.kind === 'rate' ? `${Math.round(t * 100)}%` : formatStat(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % every === 0 || i === n - 1 ? (
              <text
                key={`x${i}`}
                x={x(i)}
                y={H - 6}
                textAnchor="middle"
                className="num fill-muted text-[0.625rem]"
              >
                {p.label.replace(/^[A-Z]+/, '')}
              </text>
            ) : null,
          )}
          {average !== null && (
            <line
              x1={L}
              x2={W - R}
              y1={y(average)}
              y2={y(average)}
              className="stroke-faint"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}
          {bridges}
          {dashes}
          <path
            d={line.join(' ')}
            className="fill-none stroke-accent"
            strokeWidth={2.2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((p, i) => {
            if (p.value === null) return null;
            const cx = x(i);
            const cy = y(p.value);
            return p.status === 'broke_down' ? (
              <rect
                key={`p${i}`}
                data-mark="broke-down"
                x={cx - 4}
                y={cy - 4}
                width={8}
                height={8}
                transform={`rotate(45 ${cx} ${cy})`}
                className="fill-warn stroke-surface"
                strokeWidth={1.5}
              />
            ) : (
              <circle
                key={`p${i}`}
                data-mark="point"
                cx={cx}
                cy={cy}
                r={3}
                className="fill-surface stroke-accent"
                strokeWidth={2}
              />
            );
          })}
        </svg>
      </div>
      <ul className="sr-only">
        {points.map((p, i) => (
          <li key={i}>
            {p.label}: {p.value === null ? missing(p.status) : valueText(metric, p.value)}
            {p.status === 'broke_down' ? ', broke down' : ''}
          </li>
        ))}
        {average !== null && <li>Team value: {valueText(metric, average)}</li>}
      </ul>
    </figure>
  );
}

/** THEME "Progression chart": the legend under it, 11.5 px `--muted`. */
export function ChartLegend({ metric }: { metric: StatsMetric }) {
  return (
    <div
      aria-hidden="true"
      className="flex flex-wrap gap-x-3.5 gap-y-1 text-[0.71875rem] text-muted"
    >
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block h-0.5 w-3.5 bg-accent" />
        {chartLabel(metric).toLowerCase()}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block w-3.5 border-t border-dashed border-faint" />
        team average
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block size-2 rotate-45 bg-warn" />
        broke down
      </span>
      <span>— no show (not counted)</span>
    </div>
  );
}

/** The view-time metric picker (12.5): a select at the top of the chart. */
export function MetricPicker({
  metrics,
  value,
  onChange,
}: {
  metrics: readonly StatsMetric[];
  value: string;
  onChange: (key: string) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="sr-only">
        Chart metric
      </label>
      <Select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        wrapperClassName="inline-block max-w-full"
        className="w-auto max-w-full text-[0.8125rem]"
      >
        {metrics.map((m) => (
          <option key={m.key} value={m.key}>
            {chartLabel(m)}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** The next metric to stack: the first one not on a chart yet, else none. */
export function nextChartKey(metrics: readonly StatsMetric[], shown: readonly string[]) {
  return metrics.find((m) => !shown.includes(m.key))?.key ?? null;
}

/**
 * The Progress tab (13.1, 12.5): the chart with its picker, then "+ Add a chart under it · up to
 * 4" — the expand — each extra chart with its own picker and ✕. View interactions only: nothing
 * is saved. `charts` is the page's, so the computer's Stats tab shows the same first chart.
 */
export function ProgressPanel({
  metrics,
  charts,
  onChange,
  statusOf,
}: {
  metrics: readonly StatsMetric[];
  charts: readonly string[];
  onChange: (charts: string[]) => void;
  statusOf: (entryId: string) => RobotStatus | null;
}) {
  const pool = chartMetrics(metrics);
  const byKey = new Map(pool.map((m) => [m.key, m]));
  const next = nextChartKey(pool, charts);
  return (
    <div className="flex flex-col gap-2.5">
      {charts.map((key, i) => {
        const metric = byKey.get(key);
        if (!metric) return null;
        return (
          <section
            key={`${i}-${key}`}
            aria-label={`Chart ${i + 1}: ${chartLabel(metric)}`}
            className="rounded-card border border-line bg-surface px-3.5 pt-3 pb-2.5"
          >
            <div className="flex items-start gap-2">
              <MetricPicker
                metrics={pool}
                value={key}
                onChange={(k) => onChange(charts.map((c, j) => (j === i ? k : c)))}
              />
              <span className="flex-1" />
              {i > 0 && (
                <button
                  type="button"
                  aria-label={`Remove the ${chartLabel(metric)} chart`}
                  onClick={() => onChange(charts.filter((_, j) => j !== i))}
                  className="tap-target hover-veil -me-2 -mt-1 grid place-items-center rounded-control text-muted"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              )}
            </div>
            <div className={cn('mt-2', i === 0 && 'mb-1.5')}>
              <ProgressionChart metric={metric} statusOf={statusOf} height={i === 0 ? 150 : 120} />
            </div>
            {i === 0 && <ChartLegend metric={metric} />}
          </section>
        );
      })}
      {charts.length < MAX_CHARTS && next !== null && (
        <button
          type="button"
          onClick={() => onChange([...charts, next])}
          className="hover-veil motion-safe:transition flex min-h-12 items-center justify-center gap-2 rounded-control border border-dashed border-control-border bg-surface text-[0.84375rem] font-[650] text-accent-ink"
        >
          <Plus aria-hidden="true" className="size-4" />
          Add a chart under it · up to {MAX_CHARTS}
        </button>
      )}
    </div>
  );
}
