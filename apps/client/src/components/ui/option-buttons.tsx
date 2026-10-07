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
 * One choice among a few (THEME "Option buttons": equal width, 48 px, a control-border
 * edge; chosen = 2 px accent on accent-tint). The radio stays native and focusable; its
 * card is its label, so a tap anywhere on it chooses. An option may bring its own colour
 * (an alliance, a robot status): the edge and the dot take it. The colour change is the one
 * motion here — a state change the scout must see (SPEC-FINAL 17.9, 17.7).
 */
export function OptionButtons<V extends string>({
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
      <legend className="text-sm font-semibold text-ink" dir="auto">
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
            style={option.accent ? ({ '--opt': option.accent } as CSSProperties) : undefined}
            className={cn(
              'tap-target state-layer press motion-transition flex min-h-12 cursor-pointer items-center gap-3 rounded-control border border-control-border bg-surface px-4 text-ink-2 has-[:checked]:border-2 has-[:checked]:px-[0.9375rem] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
              option.accent
                ? 'has-[:checked]:border-[var(--opt)] has-[:checked]:bg-[color-mix(in_srgb,var(--opt)_12%,var(--surface))] has-[:checked]:text-ink'
                : 'has-[:checked]:border-accent has-[:checked]:bg-accent-tint has-[:checked]:text-accent-ink',
            )}
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
            <span className="font-semibold" dir="auto">
              {option.label}
            </span>
            {/* Chosen is said by a mark too, never by colour alone: no-show's grey is the
                border colour, and 17.7 asks more than a 1 px change. */}
            {value === option.value && (
              <Check data-chosen-mark="" aria-hidden="true" className="ms-auto size-5 shrink-0" />
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
