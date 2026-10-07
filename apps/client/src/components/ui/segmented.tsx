import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * A few exclusive choices in one track (THEME "Segmented control": a `--line-2` track with a
 * 3 px inset, 46 px segments; chosen = accent-tint, accent-ink text, a 2 px inset accent
 * ring). The WAI-ARIA radiogroup pattern: only the chosen segment is in the Tab order (the
 * first, when none is chosen); the arrows, Home and End move focus AND choose, so selection
 * follows focus; Left / Right flip in a right-to-left page. Presentation only: the page
 * keeps the value.
 */
export function Segmented<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  const chosenIndex = options.findIndex((o) => o.key === value);
  const tabbable = chosenIndex >= 0 ? chosenIndex : 0;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = group.current;
    if (!el || options.length === 0) return;
    const items = [...el.querySelectorAll<HTMLElement>('[role="radio"]')];
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (current < 0) return;
    const rtl =
      (el.closest('[dir]')?.getAttribute('dir') ?? '') === 'rtl' ||
      getComputedStyle(el).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    let next: number;
    if (e.key === forward || e.key === 'ArrowDown') next = (current + 1) % options.length;
    else if (e.key === backward || e.key === 'ArrowUp')
      next = (current - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    else return;
    e.preventDefault();
    const target = options[next];
    items[next]?.focus();
    if (target) onChange(target.key);
  }

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="grid auto-cols-fr grid-flow-col gap-0 rounded-control bg-line-2 p-[3px]"
    >
      {options.map((option, index) => {
        const chosen = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={index === tabbable ? 0 : -1}
            onClick={() => onChange(option.key)}
            dir="auto"
            className={cn(
              'state-layer motion-transition min-h-[2.875rem] min-w-12 rounded-tag px-2 text-[0.8125rem] font-semibold',
              chosen
                ? 'bg-accent-tint text-accent-ink shadow-[inset_0_0_0_2px_var(--accent)]'
                : 'text-ink-2',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
