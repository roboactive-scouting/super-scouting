import { useId } from 'react';
import { cn } from '@/lib/utils';

export type SeasonChip = {
  id: string;
  year: number;
  /** A plain word after the year ("active", "no forms yet"); never coloured. */
  note?: string;
  /** The active season: a 7 px `--accent` dot before the year. */
  active?: boolean;
};

/**
 * THEME "Season chips (labelled)" (Forms list, 2026-10-08): the switcher's season pills with
 * a label — the year in mono, then an 11.5 px / 500 `--muted` word; the active season also
 * carries a 7 px `--accent` dot (white with an accent ring on the selected chip). Selected:
 * filled `--ink`, the label in `--rail-ink`. Toggle buttons (`aria-pressed`); one is always on.
 * An invisible ::after grows each 34 px chip's hit area to the 48 px floor.
 */
export function SeasonChips({
  label = 'Season',
  seasons,
  value,
  onChange,
}: {
  label?: string;
  seasons: readonly SeasonChip[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id={labelId} className="me-1 text-xs font-[650] text-muted">
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {seasons.map((s) => {
          const on = s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(s.id)}
              className={cn(
                "hover-veil motion-safe:transition relative inline-flex min-h-[34px] items-center gap-[7px] whitespace-nowrap rounded-full border px-3.5 text-[0.8125rem] font-semibold after:absolute after:inset-x-0 after:-inset-y-[7px] after:content-['']",
                on ? 'border-ink bg-ink text-surface' : 'border-control-border bg-surface text-ink',
              )}
            >
              {s.active && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-[7px] shrink-0 rounded-full',
                    on ? 'bg-surface ring-2 ring-accent' : 'bg-accent',
                  )}
                />
              )}
              <span className="num">{s.year}</span>
              {s.note && (
                <small
                  className={cn(
                    'text-[0.71875rem] font-medium',
                    on ? 'text-rail-ink' : 'text-muted',
                  )}
                >
                  {s.note}
                </small>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
