import { Check } from 'lucide-react';
import { useId, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Choice<V extends string> = {
  value: V;
  label: ReactNode;
  /** The radio's accessible name where the visible label is not it (e.g. "red"). */
  ariaLabel?: string;
  /** A token colour for the chosen card's edge and its dot: an alliance or a robot status. */
  accent?: string;
};

/**
 * One choice among a few, as big tappable cards (SPEC-FINAL 17.9, 17.7). The radio stays
 * native and focusable; its card is its label, so a tap anywhere on it chooses. The chosen
 * card takes the accent edge — a state change the scout must see, so its colour change is
 * the one motion here.
 */
export function ChoiceGroup<V extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  columns = 2,
  groupLabel,
}: {
  legend: string;
  name?: string;
  value: V | null;
  options: readonly Choice<V>[];
  onChange: (value: V) => void;
  columns?: 2 | 4;
  groupLabel?: string;
}) {
  const fallbackName = useId();
  return (
    <fieldset role="group" aria-label={groupLabel ?? legend} className="min-w-0">
      <legend className="text-sm font-medium" dir="auto">
        {legend}
      </legend>
      <div
        className={cn(
          'mt-2 grid gap-2',
          columns === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2',
        )}
      >
        {options.map((option) => (
          <label
            key={option.value}
            style={{ '--accent': option.accent ?? 'var(--text)' } as CSSProperties}
            className="tap-target state-layer press motion-transition flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-4 has-[:checked]:border-2 has-[:checked]:border-[var(--accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
          >
            <input
              type="radio"
              name={name ?? fallbackName}
              value={option.value}
              aria-label={option.ariaLabel}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.accent && (
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full"
                style={{ background: option.accent }}
              />
            )}
            <span className="font-medium" dir="auto">
              {option.label}
            </span>
            {/* Chosen is said by a mark too, never by colour alone: no-show's grey is the
                border colour, and 17.7 asks more than a 1 px change. */}
            {value === option.value && (
              <Check
                data-chosen-mark=""
                aria-hidden="true"
                className="ms-auto size-5 shrink-0 text-text"
              />
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
