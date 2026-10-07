import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

const SIDES = [
  {
    key: 'red',
    label: 'Red',
    square: 'bg-alliance-red',
    on: 'border-alliance-red bg-alliance-red-tint text-alliance-red',
  },
  {
    key: 'blue',
    label: 'Blue',
    square: 'bg-alliance-blue',
    on: 'border-alliance-blue bg-alliance-blue-tint text-alliance-blue',
  },
] as const;

/**
 * THEME "Alliance buttons": two equal 52 px buttons, each with a small alliance square.
 * Selected: a 2 px alliance border on the alliance tint, text in the alliance colour. The
 * border is 2 px in both states (`--control-border` when off) so choosing never shifts the
 * layout. A radio group with a roving tabindex: the picked side (else the first) is the tab
 * stop, arrows / Home / End move and pick; `value` is null until a side is picked.
 */
export function AllianceButtons({
  value,
  onChange,
  label = 'Alliance',
}: {
  value: 'red' | 'blue' | null;
  onChange: (alliance: 'red' | 'blue') => void;
  label?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabStop = value === 'blue' ? 1 : 0;

  function pick(index: number) {
    const side = SIDES[index];
    if (!side) return;
    onChange(side.key);
    refs.current[index]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = refs.current.findIndex((el) => el === document.activeElement);
    if (current < 0) return;
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    const last = SIDES.length - 1;
    let next: number;
    if (e.key === forward || e.key === 'ArrowDown') next = current === last ? 0 : current + 1;
    else if (e.key === back || e.key === 'ArrowUp') next = current === 0 ? last : current - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else return;
    e.preventDefault();
    pick(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="grid grid-cols-2 gap-2"
    >
      {SIDES.map((side, i) => {
        const on = value === side.key;
        return (
          <button
            key={side.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === tabStop ? 0 : -1}
            onClick={() => onChange(side.key)}
            className={cn(
              'motion-safe:transition flex min-h-[52px] items-center justify-center gap-2 rounded-control border-2 text-[0.9375rem] font-[650]',
              on ? side.on : 'border-control-border bg-surface text-ink',
            )}
          >
            <span aria-hidden="true" className={cn('size-3 rounded-[3px]', side.square)} />
            {side.label}
          </button>
        );
      })}
    </div>
  );
}
