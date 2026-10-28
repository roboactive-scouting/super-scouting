import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * THEME "Category switch (two views of one list)" (Ranking, 2026-10-28): a `--line-2` track with
 * a `--line` edge, 10 px radius, 4 px inset; each segment at least 236 px, its name 14 px / 650
 * over a 12 px `--muted` line naming what it holds ("Total · Auto · Teleop · Endgame ·
 * Consistency"); the current one white with a 1 px `--accent` ring. `compact` (a phone): two equal
 * 44 px segments, names only.
 *
 * The WAI-ARIA radio group pattern, as `Segmented`: only the chosen segment is in the Tab order,
 * and the arrows, Home and End move AND choose (a view switch drops nothing). Presentation only:
 * the page keeps the value.
 */
export function CategorySwitch<K extends string>({
  label,
  options,
  value,
  onChange,
  compact = false,
  className,
}: {
  label: string;
  options: readonly { key: K; name: string; holds: string }[];
  value: K;
  onChange: (key: K) => void;
  compact?: boolean;
  className?: string;
}) {
  const group = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = group.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>('[role="radio"]')];
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (current < 0) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    let next: number;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') || e.key === 'ArrowDown') {
      next = (current + 1) % options.length;
    } else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') || e.key === 'ArrowUp') {
      next = (current - 1 + options.length) % options.length;
    } else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    else return;
    e.preventDefault();
    items[next]?.focus();
    const target = options[next];
    if (target) onChange(target.key);
  }

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'flex gap-1 rounded-[10px] border border-line bg-line-2 p-1',
        compact && 'gap-[3px] p-[3px]',
        className,
      )}
    >
      {options.map((option) => {
        const chosen = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={chosen ? 0 : -1}
            onClick={() => onChange(option.key)}
            className={cn(
              'hover-veil motion-safe:transition rounded-control border text-start',
              compact
                ? 'grid min-h-11 flex-1 place-items-center text-[0.90625rem] font-[650]'
                : 'flex min-w-[236px] flex-col gap-px px-3.5 py-1.5',
              chosen ? 'border-accent bg-surface' : 'border-transparent',
            )}
          >
            <span
              className={cn(
                !compact && 'text-sm font-[650]',
                chosen ? 'text-accent-ink' : 'text-ink-2',
              )}
            >
              {option.name}
            </span>
            {!compact && <span className="text-xs text-muted">{option.holds}</span>}
          </button>
        );
      })}
    </div>
  );
}
