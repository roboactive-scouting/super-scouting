import { domainPosition, type StatsMetric } from '@frc/shared';
import { ShadedValue } from '@/components/ShadedValue';
import { Sparkline } from '@/components/Sparkline';
import { cn } from '@/lib/utils';
import {
  GROUP_NAME,
  metricDomain,
  metricGroups,
  metricShade,
  metricText,
  valueText,
} from './teamView';

/*
 * THEME "Stat row" (24-team final, D2): every metric as label → shaded value → inline bar →
 * trend line, one white card, grouped by phase under `--bg` group rows. A `neutral` metric (std
 * dev) is never shaded — flat `--line-2` — and its bar is `--faint`; a nominal one is its value
 * in words with no bar and no trend line; a metric that cannot be calculated says so.
 */

const GRID =
  'grid grid-cols-[minmax(0,1fr)_3.375rem_3.25rem_3.625rem] items-center gap-2 px-3.5 lg:grid-cols-[minmax(0,1fr)_4rem_4.375rem_4rem] lg:gap-2.5';

/** The 6 px `--line` bar (`role="meter"`): the value between the worst and best at the event. */
function Bar({ metric, label }: { metric: StatsMetric; label: string }) {
  const domain = metricDomain(metric);
  const raw = domainPosition(metric.value, domain);
  if (raw === null || domain === null || metric.value === null) {
    return <span aria-hidden="true" className="block h-1.5 rounded-[3px] bg-line" />;
  }
  const neutral = metric.direction === 'neutral';
  // `lower_is_better` reversed: the fill is how good the value is, not how big.
  const fill = metric.direction === 'lower_is_better' ? 1 - raw : raw;
  const [min, max] =
    domain.kind === 'range' ? [domain.min, domain.max] : domain.kind === 'rate' ? [0, 1] : [0, 1];
  const now = Math.min(max, Math.max(min, metric.value));
  const range = `${valueText(metric, min)} to ${valueText(metric, max)} at the event`;
  return (
    <div
      role="meter"
      aria-label={`${label}, worst to best`}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={now}
      aria-valuetext={`${metricText(metric)}, ${range}${
        metric.direction === 'lower_is_better' ? ', lower is better' : ''
      }`}
      className="relative h-1.5 rounded-[3px] bg-line"
    >
      <i
        className={cn(
          'absolute inset-y-0 start-0 rounded-[3px]',
          neutral ? 'bg-faint' : 'bg-accent',
        )}
        style={{ width: `${Math.max(3, Math.round(fill * 100))}%` }}
      />
    </div>
  );
}

function MetricRow({ metric }: { metric: StatsMetric }) {
  const label = metric.label;
  const head = (
    <span role="rowheader" dir="auto" className="truncate text-sm font-[550] text-ink-2">
      {label}
    </span>
  );
  if (metric.unavailable_reason !== null) {
    return (
      <div role="row" className={cn(GRID, 'min-h-10 border-b border-line-2 last:border-b-0')}>
        {head}
        <span role="cell" className="col-span-3 py-1.5 text-end text-xs leading-snug text-muted">
          cannot calculate this metric
          {metric.unavailable_reason === 'type-changed'
            ? ' — field type changed between versions'
            : ''}
        </span>
      </div>
    );
  }
  const nominal = metric.kind === 'nominal';
  return (
    <div
      role="row"
      data-metric={metric.key}
      className={cn(GRID, 'min-h-10 border-b border-line-2 last:border-b-0')}
    >
      {head}
      <span role="cell" className="flex justify-end text-sm">
        {nominal ? (
          <span className="whitespace-nowrap font-[650] text-ink" dir="auto">
            {metricText(metric)}
          </span>
        ) : (
          <ShadedValue
            text={metricText(metric)}
            shade={metricShade(metric)}
            mono={metric.kind !== 'ordinal'}
            className="shrink-0 whitespace-nowrap"
          />
        )}
      </span>
      <span role="cell">{nominal ? null : <Bar metric={metric} label={label} />}</span>
      <span role="cell" className="flex justify-end">
        {nominal ? null : <Sparkline values={metric.series.map((s) => s.value)} />}
      </span>
    </div>
  );
}

/** Every metric, grouped by phase, in one white card (`role="table"`, "All metrics"). */
export function StatRows({ metrics }: { metrics: readonly StatsMetric[] }) {
  return (
    <div
      role="table"
      aria-label="All metrics"
      className="overflow-hidden rounded-card border border-line bg-surface"
    >
      {metricGroups(metrics).map(([group, list], i) => (
        <div role="rowgroup" key={group}>
          <div
            role="row"
            className={cn(
              GRID,
              'min-h-[1.875rem] border-b border-line-2 bg-bg text-[0.71875rem] font-[650] text-muted',
            )}
          >
            <span role="columnheader" className={cn(i > 0 && 'col-span-4')}>
              {GROUP_NAME[group]}
            </span>
            {i === 0 && (
              <>
                <span role="columnheader" className="text-end">
                  value
                </span>
                <span role="columnheader">
                  <span className="sr-only">worst to best</span>
                </span>
                <span role="columnheader" className="num text-end font-normal">
                  by match
                </span>
              </>
            )}
          </div>
          {list.map((m) => (
            <MetricRow key={m.key} metric={m} />
          ))}
        </div>
      ))}
    </div>
  );
}
