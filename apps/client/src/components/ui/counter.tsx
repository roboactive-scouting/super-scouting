import { Minus, Plus } from 'lucide-react';
import { useRef } from 'react';
import { DURATION, EASING, usePlayOnChange, VALUE_TICK } from '@/lib/motion';

const TICK = { duration: DURATION.short3, easing: EASING.standard };
const BUTTON =
  'state-layer press motion-transition flex size-[3.125rem] shrink-0 items-center justify-center rounded-control border';

/**
 * SPEC-FINAL 17.9: "Counters are a wide − / value / + triplet, never a text input."
 * THEME "Counter": − white with a control-border edge, the value in mono 22, + filled ink,
 * 50 px buttons. The value ticks once when it changes — the confirmation that a tap in a
 * loud arena counted. That is informational, so it is allowed on the data-entry path.
 */
export function Counter({
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
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className={`${BUTTON} border-control-border bg-surface text-ink-2`}
        aria-label={`${label} minus one`}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        <Minus aria-hidden="true" className="size-[1.375rem]" />
      </button>
      <output
        ref={output}
        aria-label={`${label} value`}
        className="num min-w-[2.625rem] text-center text-[1.375rem] leading-[3.125rem] font-semibold text-ink"
      >
        {value}
      </output>
      <button
        type="button"
        className={`${BUTTON} border-ink bg-ink text-surface`}
        aria-label={`${label} plus one`}
        onClick={() => onChange(value + step)}
      >
        <Plus aria-hidden="true" className="size-[1.375rem]" />
      </button>
    </div>
  );
}
