import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { OPTION_CARD, OPTION_CHOSEN, OPTION_FOCUS_RING } from './option-buttons';

export type MultiChoice<V extends string> = { value: V; label: string };

/** Columns by how many options, read from the group's own width (UF.18), never the window's. */
function columnsFor(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-2';
  if (count === 3) return 'grid-cols-3';
  if (count === 4) return 'grid-cols-2 @min-[26rem]:grid-cols-4';
  return 'grid-cols-2 @min-[26rem]:grid-cols-3';
}

/**
 * Any number of choices among a few (THEME "Multi select": equal 48 px option buttons with an
 * 18 px check box; on = 2 px `--accent` on `--accent-tint`, the box filled `--accent` with a
 * white tick). The `OptionButtons` pattern around native checkboxes: each card is its
 * checkbox's label, so a tap anywhere on it toggles, and the checkbox stays focusable. `foot`
 * sits under the buttons ("Pick any that apply", an Undo).
 */
export function MultiOptionButtons<V extends string>({
  label,
  value,
  options,
  onToggle,
  labelledBy,
  foot,
}: {
  /** The group's accessible name, when no visible label names it (`labelledBy`). */
  label?: string;
  value: readonly V[];
  options: readonly MultiChoice<V>[];
  onToggle: (option: MultiChoice<V>) => void;
  labelledBy?: string;
  foot?: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className="@container min-w-0"
    >
      <div
        data-option-grid=""
        className={cn(
          'grid gap-2',
          columnsFor(options.length),
          // One column once two would cut a word (a phone at a large text size, task 1.38).
          '@max-[14rem]:grid-cols-1',
        )}
      >
        {options.map((option) => {
          const on = value.includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                OPTION_CARD,
                'group/opt justify-center gap-1.5 px-3 text-sm font-semibold text-ink-2 has-[:checked]:border-2 has-[:checked]:px-[0.6875rem]',
                OPTION_CHOSEN,
                OPTION_FOCUS_RING,
              )}
            >
              <input
                type="checkbox"
                value={option.value}
                checked={on}
                onChange={() => onToggle(option)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="grid size-[1.125rem] shrink-0 place-items-center rounded-[5px] border-2 border-control-border group-has-[:checked]/opt:border-accent group-has-[:checked]/opt:bg-accent"
              >
                {on && <Check className="size-3 text-on-accent" strokeWidth={3.5} />}
              </span>
              <span className="min-w-0 [overflow-wrap:anywhere]" dir="auto">
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
      {foot}
    </div>
  );
}
