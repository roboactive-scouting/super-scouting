import { Minus, Plus } from 'lucide-react';
import { useRef } from 'react';
import { playOnce } from '@/lib/animate';

/** The value's tick: informational, so it is allowed on the data-entry path (17.9). */
const TICK: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.15)' },
  { transform: 'scale(1)' },
];
const BUTTON =
  'hover-veil motion-safe:transition motion-safe:active:not-disabled:scale-[0.97] flex size-[3.125rem] shrink-0 items-center justify-center rounded-control border';

/**
 * SPEC-FINAL 17.9: "Counters are a wide − / value / + triplet, never a text input."
 * THEME "Counter": − white with a control-border edge, the value in mono 22, + filled ink,
 * 50 px buttons. The value ticks once when a tap changes it — the confirmation that a tap in
 * a loud arena counted. That is informational, so it is allowed on the data-entry path.
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
  const set = (next: number) => {
    onChange(next);
    if (next !== value) playOnce(output.current, TICK, 150, 'cubic-bezier(0.2, 0, 0, 1)');
  };
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className={`${BUTTON} border-control-border bg-surface text-ink-2`}
        aria-label={`${label} minus one`}
        onClick={() => set(Math.max(min, value - step))}
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
        onClick={() => set(value + step)}
      >
        <Plus aria-hidden="true" className="size-[1.375rem]" />
      </button>
    </div>
  );
}
