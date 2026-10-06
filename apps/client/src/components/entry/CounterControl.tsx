import { Minus, Plus } from 'lucide-react';
import { useRef } from 'react';
import { DURATION, EASING, usePlayOnChange, VALUE_TICK } from '@/lib/motion';

const TICK = { duration: DURATION.short3, easing: EASING.standard };
const SIDE =
  'tap-target state-layer press motion-transition flex min-h-14 flex-1 items-center justify-center rounded-xl border border-border bg-surface text-text';

/**
 * SPEC-FINAL 17.9: "Counters are a wide − / value / + triplet, never a text input." The value
 * ticks once when it changes — the confirmation that a tap in a loud arena counted. That is
 * informational, so it is allowed on the data-entry path.
 */
export function CounterControl({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
}) {
  const output = useRef<HTMLOutputElement>(null);
  usePlayOnChange(output, value, VALUE_TICK, TICK);
  return (
    <div className="tap-row flex items-center">
      <button
        type="button"
        className={SIDE}
        aria-label={`${label} minus one`}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        <Minus aria-hidden="true" className="size-6" />
      </button>
      <output
        ref={output}
        aria-label={`${label} value`}
        className="tap-target min-w-20 basis-20 text-center text-3xl leading-[3.5rem] font-semibold tabular-nums"
      >
        {value}
      </output>
      <button
        type="button"
        className={SIDE}
        aria-label={`${label} plus one`}
        onClick={() => onChange(value + step)}
      >
        <Plus aria-hidden="true" className="size-6" />
      </button>
    </div>
  );
}
