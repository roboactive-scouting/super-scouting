import type { CSSProperties } from 'react';
import { NO_VALUE, type Shade } from '@frc/shared';
import { cn } from '@/lib/utils';

/**
 * The background of a shade (THEME "Value shading"): the accent mixed into the surface by the
 * shared ramp's percent, or `--line-2` when the shade is flat (neutral, or min = max). The ramp
 * itself is @frc/shared's `shadeFor`; this only turns its numbers into CSS.
 */
export function shadeBackground(shade: Shade): string {
  return shade.flat
    ? 'var(--line-2)'
    : `color-mix(in srgb, var(--accent) ${shade.mix}%, var(--surface))`;
}

/**
 * One shaded value (SPEC-FINAL 12.6; THEME "Value shading"): a 5 px-radius chip around the value,
 * filled worst → best, the text always `--ink` and ALWAYS printed — colour is a fast cue, never
 * the only channel. `shade` null is no data: a bare `--muted` "—", no chip. `mono` false sets a
 * word (an ordinal's option label) in the UI face.
 */
export function ShadedValue({
  text,
  shade,
  mono = true,
  className,
}: {
  /** The value as printed: "38.4", "89%", "Deep". */
  text: string;
  /** From `shadeFor`; null when there is no value. */
  shade: Shade | null;
  mono?: boolean;
  className?: string;
}) {
  if (shade === null) {
    return <span className={cn('num font-medium text-muted', className)}>{NO_VALUE}</span>;
  }
  // A custom property, so the ramp's colour-mix reaches the browser as written.
  const style = { '--shade-bg': shadeBackground(shade) } as CSSProperties;
  return (
    <span
      data-shade={shade.flat ? 'flat' : String(shade.mix)}
      style={style}
      className={cn(
        'inline-block min-w-[3.25rem] rounded-[5px] bg-[var(--shade-bg)] px-[7px] py-[3px] text-end text-ink',
        mono ? 'num font-semibold' : 'font-[650]',
        className,
      )}
    >
      {text}
    </span>
  );
}
