import { cn } from '@/lib/utils';

/**
 * THEME "Filter chips": 34 px pills (32 px, 12.5 px text and 10 px side padding below 1024 px), `--control-border`, 13 px / 600 with a mono count.
 * Selected: filled `--ink`, white text. Toggle buttons (`aria-pressed`); one is always on.
 * An invisible ::after grows each chip's hit area to the 48 px floor.
 */
export function FilterChips<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={cn(
              "motion-safe:transition relative inline-flex min-h-8 min-w-12 justify-center items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[0.78125rem] font-semibold after:absolute after:inset-x-0 after:-inset-y-2 lg:min-h-[34px] lg:px-3.5 lg:text-[0.8125rem] lg:after:-inset-y-[7px] after:content-['']",
              on ? 'border-ink bg-ink text-surface' : 'border-control-border bg-surface text-ink-2',
            )}
          >
            <span dir="auto">{o.label}</span>
            {o.count !== undefined ? <span className="num">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
