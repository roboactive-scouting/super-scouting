import { Star } from 'lucide-react';
import { useId } from 'react';
import type { FormFieldDefinition } from '@frc/shared';
import { OPTION_FOCUS_RING } from '@/components/ui/option-buttons';
import { cn } from '@/lib/utils';
import { FieldLabel, FieldRow } from './FieldRow';

/** The word under each of five stars (entry parts, version D). */
export const STAR_WORDS = ['Poor', 'Weak', 'OK', 'Good', 'Great'] as const;

type Props = {
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
};

/** A rating 1–max by `config.style` (SPEC-FINAL 5.2, 5.3): stars, or a slider. */
export function RatingInput(props: Props) {
  return props.field.config.style === 'slider' ? (
    <RatingSlider {...props} />
  ) : (
    <RatingStars {...props} />
  );
}

function ratingMax(field: FormFieldDefinition): number {
  const max = field.config.max;
  return typeof max === 'number' && Number.isInteger(max) && max >= 1 ? max : 5;
}

const picked = (value: unknown, max: number) =>
  typeof value === 'number' && value >= 1 && value <= max ? value : null;

/**
 * THEME "Rating (stars)": equal 56 px boxed buttons, each a 22 px star over an 11 px word. The
 * stars up to the pick are filled (`--accent` on `--accent-tint` with an `--accent` edge), the
 * pick itself has a 2 px ring and an `--accent-ink` word; unanswered, all outlined. A radio
 * group: each box is its radio's label.
 */
function RatingStars({ field, value, onChange }: Props) {
  const id = useId();
  const labelId = `${id}-label`;
  const helpId = `${id}-help`;
  const max = ratingMax(field);
  const pick = picked(value, max);
  const words = max === 5 ? STAR_WORDS : null;
  return (
    <FieldRow label={<FieldLabel field={field} id={labelId} helpId={helpId} />}>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={field.help_text ? helpId : undefined}
        className="flex gap-2"
      >
        {Array.from({ length: max }, (_, i) => {
          const n = i + 1;
          const filled = pick !== null && n <= pick;
          const word = words?.[i] ?? String(n);
          return (
            <label
              key={n}
              data-star=""
              data-filled={filled ? '' : undefined}
              className={cn(
                'tap-target hover-veil motion-safe:transition flex h-14 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-control border border-control-border bg-surface text-[0.6875rem] font-[650] text-muted',
                filled && 'border-accent bg-accent-tint',
                n === pick && 'border-2 border-accent text-accent-ink',
                OPTION_FOCUS_RING,
              )}
            >
              <input
                type="radio"
                name={id}
                value={n}
                checked={n === pick}
                aria-label={words ? `${word}, ${n} of ${max}` : `${n} of ${max}`}
                onChange={() => onChange(n)}
                className="sr-only"
              />
              <Star
                aria-hidden="true"
                strokeWidth={1.7}
                className={cn(
                  'size-[1.375rem] shrink-0',
                  filled ? 'fill-accent text-accent' : 'text-control-border',
                )}
              />
              <span aria-hidden="true">{word}</span>
            </label>
          );
        })}
      </div>
    </FieldRow>
  );
}

/**
 * THEME "Rating (slider)": a 6 px `--line` track with an `--accent` fill and a 28 px white knob,
 * 1–max under it in mono with the value in `--accent-ink`. A native range input lies over the
 * drawing (its own thumb sized to the knob, so a tap lands where it looks). Unanswered there is
 * no knob and no fill, and the first tap commits even at 1, which a range alone would not.
 */
function RatingSlider({ field, value, onChange }: Props) {
  const id = useId();
  const helpId = `${id}-help`;
  const max = ratingMax(field);
  const pick = picked(value, max);
  const at = pick ?? 1;
  const share = max > 1 ? (at - 1) / (max - 1) : 0;
  return (
    <FieldRow label={<FieldLabel field={field} htmlFor={id} helpId={helpId} />}>
      <div className="relative h-12">
        <input
          id={id}
          type="range"
          min={1}
          max={max}
          step={1}
          value={at}
          aria-valuetext={pick === null ? 'Not rated' : `${pick} of ${max}`}
          aria-describedby={field.help_text ? helpId : undefined}
          onChange={(e) => onChange(Number(e.target.value))}
          // A tap on the knob's own spot changes nothing, so no change event: still an answer.
          onClick={(e) => {
            if (pick === null) onChange(Number(e.currentTarget.value));
          }}
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none opacity-0 [&::-moz-range-thumb]:size-6 [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none"
        />
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-x-3 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line',
            // Unanswered there is no knob to ring: the keyboard's focus shows on the track.
            pick === null &&
              'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-accent',
          )}
        />
        {pick !== null && (
          <>
            <span
              aria-hidden="true"
              className="absolute start-3 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent"
              style={{ width: `calc((100% - 1.5rem) * ${share})` }}
            />
            <span
              aria-hidden="true"
              className="absolute top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface shadow-[0_2px_6px_rgb(20_24_32/0.2)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent rtl:translate-x-1/2"
              style={{ insetInlineStart: `calc(0.75rem + (100% - 1.5rem) * ${share})` }}
            />
          </>
        )}
      </div>
      <div aria-hidden="true" className="flex justify-between px-1.5 font-num text-xs text-muted">
        {Array.from({ length: max }, (_, i) =>
          i + 1 === pick ? (
            <b key={i} className="font-semibold text-accent-ink">
              {i + 1}
            </b>
          ) : (
            <span key={i}>{i + 1}</span>
          ),
        )}
      </div>
    </FieldRow>
  );
}
