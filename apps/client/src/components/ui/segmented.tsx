import type { AriaAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { onRadioGroupKey } from './radio-keys';

/**
 * A few exclusive choices in one track (THEME "Segmented control": a `--line-2` track with a
 * 3 px inset, 46 px segments; chosen = accent-tint, accent-ink text, a 2 px inset accent
 * ring). The WAI-ARIA radiogroup pattern: only the chosen segment is in the Tab order (the
 * first, when none is chosen); the arrows, Home and End move focus AND choose, so selection
 * follows focus; Left / Right flip in a right-to-left page. Presentation only: the page
 * keeps the value, which may be null (nothing chosen yet). The form builder (task 1.30) passes
 * `aria-required` / `aria-invalid` / `aria-describedby`; a disabled fieldset holds the segments.
 * Equal segments while every label fits on one line; at a large text size (task 1.38) the track
 * wraps onto a second row rather than let "Broke down" and "Disabled" run into each other.
 */
export function Segmented<K extends string>({
  label,
  options,
  value,
  onChange,
  ...aria
}: {
  label: string;
  /** `content` draws a segment in place of its label (Settings' "Aa" steps); `label` names it. */
  options: readonly { key: K; label: string; content?: ReactNode }[];
  value: K | null;
  onChange: (key: K) => void;
} & Pick<AriaAttributes, 'aria-required' | 'aria-invalid' | 'aria-describedby'>) {
  const chosenIndex = options.findIndex((o) => o.key === value);
  const tabbable = chosenIndex >= 0 ? chosenIndex : 0;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      {...aria}
      onKeyDown={(e) =>
        onRadioGroupKey(e, (i) => {
          const target = options[i];
          if (target) onChange(target.key);
        })
      }
      className="flex flex-wrap gap-y-[3px] rounded-control bg-line-2 p-[3px]"
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
            aria-label={option.content === undefined ? undefined : option.label}
            dir="auto"
            className={cn(
              'hover-veil motion-safe:transition min-h-[2.875rem] min-w-max flex-[1_1_0%] whitespace-nowrap rounded-tag px-1 text-[0.78125rem] font-semibold lg:px-2 lg:text-[0.8125rem]',
              chosen
                ? 'bg-accent-tint text-accent-ink shadow-[inset_0_0_0_2px_var(--accent)]'
                : 'text-ink-2',
            )}
          >
            {option.content ?? option.label}
          </button>
        );
      })}
    </div>
  );
}
