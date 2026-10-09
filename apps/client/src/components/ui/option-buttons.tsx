import { Check } from 'lucide-react';
import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Choice<V extends string> = {
  value: V;
  label: ReactNode;
  /** The radio's accessible name where the visible label is not it (e.g. "red"). */
  ariaLabel?: string;
  /** A token colour for the chosen card's edge and its dot: an alliance or a robot status. */
  accent?: string;
};

/** The keyboard focus ring on an option's card (its radio is visually hidden). */
export const OPTION_FOCUS_RING =
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent';

/**
 * One choice among a few (THEME "Option buttons": equal width, 48 px, a control-border
 * edge; chosen = 2 px accent on accent-tint). The radio stays native and focusable; its
 * card is its label, so a tap anywhere on it chooses. An option may bring its own colour
 * (an alliance, a robot status): the edge and the dot take it. The colour change is the one
 * motion here — a state change the scout must see (SPEC-FINAL 17.9, 17.7).
 *
 * Four columns follow the group's **own** width, not the window's (UF.18): a container query,
 * so the builder's 410 px canvas and Try it draw two columns as the phone does, and a tablet
 * or a computer gets four. A click or a tap shows only the chosen border: the focus ring is
 * for the keyboard, and comes back with the first key or when focus leaves the group.
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
  /** The last input here was a pointer (a click, a tap): no focus ring until a key. */
  const [pointer, setPointer] = useState(false);
  /**
   * A press is under way: the browser blurs the radio on the press (a label takes no focus) and
   * focuses the new one on the click, and that blur is not focus leaving the group.
   */
  const pressing = useRef(false);
  return (
    <fieldset
      role="group"
      aria-label={groupLabel ?? legend}
      className="min-w-0"
      onPointerDown={() => {
        pressing.current = true;
        setPointer(true);
      }}
      onClick={() => {
        pressing.current = false;
      }}
      onPointerCancel={() => {
        pressing.current = false;
      }}
      onKeyDown={() => setPointer(false)}
      onBlur={(e) => {
        // Focus left the group (Tab, or a click elsewhere): coming back by keyboard shows the ring.
        if (!pressing.current && !e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPointer(false);
        }
      }}
    >
      <legend className="text-sm font-semibold text-ink" dir="auto">
        {legend}
      </legend>
      <div className="@container mt-2">
        <div
          data-option-grid=""
          className={cn(
            'grid gap-2',
            columns === 4 ? 'grid-cols-2 @lg:grid-cols-4' : 'grid-cols-2',
          )}
        >
          {options.map((option) => (
            <label
              key={option.value}
              style={option.accent ? ({ '--opt': option.accent } as CSSProperties) : undefined}
              className={cn(
                'tap-target hover-veil motion-safe:transition motion-safe:active:not-disabled:scale-[0.97] flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-control border border-control-border bg-surface px-4 text-ink-2 has-[:checked]:border-2 has-[:checked]:px-[0.9375rem]',
                !pointer && OPTION_FOCUS_RING,
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
              {/* A long label wraps inside the card rather than push the ✓ onto its edge. */}
              <span className="min-w-0 font-semibold [overflow-wrap:anywhere]" dir="auto">
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
      </div>
    </fieldset>
  );
}
