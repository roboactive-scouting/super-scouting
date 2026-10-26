import { Check } from 'lucide-react';
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
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
 * An option card's frame, shared by the radio, check box and star cards (THEME "Option buttons"):
 * the 48 px floor, the hover veil, a press that gives a little, a `--control-border` edge.
 */
export const OPTION_CARD =
  'tap-target hover-veil motion-safe:transition motion-safe:active:not-disabled:scale-[0.97] flex min-h-12 min-w-0 cursor-pointer items-center rounded-control border border-control-border bg-surface';

/** A chosen card: 2 px `--accent` on `--accent-tint` (with `has-[:checked]:border-2`). */
export const OPTION_CHOSEN =
  'has-[:checked]:border-accent has-[:checked]:bg-accent-tint has-[:checked]:text-accent-ink';

/** The keyboard focus ring on an option's card (its radio is visually hidden). */
export const OPTION_FOCUS_RING =
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent';

/** A card's inside, shared with the hidden probe that measures it: edge to dot, label and ✓. */
const CARD_BODY = 'gap-3 px-4';
const DOT = 'size-3 shrink-0 rounded-full';
const MARK = 'size-5 shrink-0';

/**
 * The most columns (of 4, 2, 1) at which a card `need` px wide fits a `width` px grid with `gap`
 * px between columns (Phase 1 H side task 3). `need` is the card the group's longest word asks
 * for beside its ✓; one rule for the whole group, so the buttons stay even.
 */
export function fitColumns(need: number, width: number, gap: number): 1 | 2 | 4 {
  // Half a pixel of slack: a measured text width is fractional.
  const fits = (n: number) => need <= (width - (n - 1) * gap) / n + 0.5;
  return fits(4) ? 4 : fits(2) ? 2 : 1;
}

/** The words of an option's label; a label that is not text brings none. */
const wordsOf = (label: ReactNode) =>
  typeof label === 'string' || typeof label === 'number' ? String(label).split(/\s+/) : [];

/**
 * One choice among a few (THEME "Option buttons": equal width, 48 px, a control-border
 * edge; chosen = 2 px accent on accent-tint). The radio stays native and focusable; its
 * card is its label, so a tap anywhere on it chooses. An option may bring its own colour
 * (an alliance, a robot status): the edge and the dot take it. The colour change is the one
 * motion here — a state change the scout must see (SPEC-FINAL 17.9, 17.7).
 *
 * Four columns follow the group's **own** width, not the window's (UF.18): a container query,
 * so the builder's 410 px canvas and Try it draw two columns as the phone does, and a tablet
 * or a computer gets four. The step is 26 rem (416 px), under the entry's 440 px desktop
 * control column (task 1.33), so four options sit in one row there. A click or a tap shows only
 * the chosen border: the focus ring is for the keyboard, and comes back with the first key or
 * when focus leaves the group. `showLegend={false}` when the page draws the name itself (the
 * entry's field row, label on the left on a computer); the group keeps its name either way.
 *
 * A label wraps only between words (Phase 1 H side task 3): when the group's longest word does not
 * fit beside the ✓ at four columns, the whole group drops to two, and to one past that. Measured,
 * not guessed: a hidden probe card holds every word stacked, with the dot and the ✓, so its width
 * is the card the longest word needs at the live font and text size; a ResizeObserver on the grid
 * and the probe re-measures. Only a word too long even for one column still breaks.
 */
export function OptionButtons<V extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  columns = 2,
  groupLabel,
  showLegend = true,
}: {
  legend: string;
  name?: string;
  value: V | null;
  options: readonly Choice<V>[];
  onChange: (value: V) => void;
  columns?: 2 | 4;
  groupLabel?: string;
  showLegend?: boolean;
}) {
  const fallbackName = useId();
  /** The last input here was a pointer (a click, a tap): no focus ring until a key. */
  const [pointer, setPointer] = useState(false);
  /**
   * A press is under way: the browser blurs the radio on the press (a label takes no focus) and
   * focuses the new one on the click, and that blur is not focus leaving the group.
   */
  const pressing = useRef(false);
  const grid = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  /** The most columns the longest word fits at; null until measured (the CSS rules alone). */
  const [fit, setFit] = useState<1 | 2 | 4 | null>(null);
  const words = [...new Set(options.flatMap((o) => wordsOf(o.label)))].filter(Boolean);
  const wordKey = words.join(' ');
  useLayoutEffect(() => {
    const g = grid.current;
    const p = probe.current;
    if (!g || !p || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const width = g.getBoundingClientRect().width;
      // A hidden panel has no width: keep the last answer until it shows.
      if (width > 0) {
        const gap = parseFloat(getComputedStyle(g).columnGap) || 0;
        setFit(fitColumns(p.getBoundingClientRect().width, width, gap));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(g);
    observer.observe(p);
    return () => observer.disconnect();
  }, [wordKey]);
  const accented = options.some((o) => o.accent);
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
      {showLegend && (
        <legend className="text-sm font-semibold text-ink" dir="auto">
          {legend}
        </legend>
      )}
      <div className={cn('@container', showLegend && 'mt-2')}>
        <div
          ref={grid}
          data-option-grid=""
          data-fit={fit ?? undefined}
          className={cn(
            'grid gap-2',
            fit === 1 ? 'grid-cols-1' : 'grid-cols-2',
            columns === 4 && (fit === null || fit === 4) && '@min-[26rem]:grid-cols-4',
            // One column once two would cut a word (a phone at a large text size, task 1.38).
            '@max-[14rem]:grid-cols-1',
          )}
        >
          {options.map((option) => (
            <label
              key={option.value}
              style={option.accent ? ({ '--opt': option.accent } as CSSProperties) : undefined}
              className={cn(
                OPTION_CARD,
                CARD_BODY,
                'text-ink-2 has-[:checked]:border-2 has-[:checked]:px-[0.9375rem]',
                !pointer && OPTION_FOCUS_RING,
                option.accent
                  ? 'has-[:checked]:border-[var(--opt)] has-[:checked]:bg-[color-mix(in_srgb,var(--opt)_12%,var(--surface))] has-[:checked]:text-ink'
                  : OPTION_CHOSEN,
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
                <span aria-hidden="true" className={DOT} style={{ background: option.accent }} />
              )}
              {/* A long label wraps between its words inside the card rather than push the ✓
                onto its edge; a word breaks only when it is wider than one column (side task 3). */}
              <span className="min-w-0 font-semibold [overflow-wrap:break-word]" dir="auto">
                {option.label}
              </span>
              {/* Chosen is said by a mark too, never by colour alone: no-show's grey is the
                border colour, and 17.7 asks more than a 1 px change. */}
              {value === option.value && (
                <Check data-chosen-mark="" aria-hidden="true" className={cn('ms-auto', MARK)} />
              )}
            </label>
          ))}
        </div>
        {/* The probe: a chosen card at its natural width holding every word on its own line, so
          its width is what the longest word needs beside the ✓. Words are drawn by ::before, so
          no text query finds them; the zero-height clip keeps it out of the page's width. */}
        <div aria-hidden="true" className="invisible h-0 overflow-hidden">
          <div
            ref={probe}
            data-option-probe=""
            className={cn('flex w-max items-center border', CARD_BODY)}
          >
            {accented && <span className={DOT} />}
            <span className="font-semibold">
              {words.map((w) => (
                <span
                  key={w}
                  data-word={w}
                  dir="auto"
                  className="block whitespace-nowrap before:content-[attr(data-word)]"
                />
              ))}
            </span>
            <Check className={MARK} />
          </div>
        </div>
      </div>
    </fieldset>
  );
}
