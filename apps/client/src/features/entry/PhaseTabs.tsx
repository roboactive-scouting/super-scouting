import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import type { FieldPhase } from '@frc/shared';
import { Tabs } from '@/components/ui/tabs';
import { playOnce, prefersReducedMotion } from '@/lib/animate';
import { cn } from '@/lib/utils';
import { PHASE_NAME, PHASE_TAB, swipeStep, type Phase } from './phases';

/** A gesture that starts on a control is that control's (a counter tap, a switch drag). */
const CONTROLS = 'button, a, input, select, textarea, label, [role="switch"], [role="radio"]';

/**
 * One phase at a time (Entry README, variant B): the tabs with a ✓ on each done phase, the
 * pane header ("Teleop", "Phase 2 of 4", pager dots) and the pane. On a phone the pane
 * follows a sideways swipe (left = next, right = previous) and its foot names the phases on
 * either side; with reduced motion the phase changes without the slide.
 */
export function PhaseTabs({
  phases,
  value,
  onChange,
  done,
  phone,
  children,
}: {
  phases: readonly Phase[];
  value: FieldPhase;
  onChange: (phase: FieldPhase) => void;
  done: ReadonlySet<FieldPhase>;
  phone: boolean;
  /** The current phase's fields. */
  children: ReactNode;
}) {
  const pane = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const index = Math.max(
    0,
    phases.findIndex((p) => p.key === value),
  );
  const previous = phases[index - 1];
  const next = phases[index + 1];

  // The new phase slides in from the side it came from (phone only: it carries the swipe).
  const shown = useRef(index);
  useEffect(() => {
    const from = shown.current;
    shown.current = index;
    if (!phone || from === index) return;
    const side = index > from ? 1 : -1;
    playOnce(
      pane.current,
      [
        { transform: `translateX(${side * 32}px)`, opacity: 0.4 },
        { transform: 'none', opacity: 1 },
      ],
      250,
    );
  }, [index, phone]);

  function drag(dx: number) {
    if (pane.current && !prefersReducedMotion())
      pane.current.style.transform = dx === 0 ? '' : `translateX(${dx * 0.4}px)`;
  }
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const onControl = (e.target as Element).closest(CONTROLS) !== null;
    start.current = phone && !onControl ? { x: e.clientX, y: e.clientY } : null;
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    drag(Math.abs(dx) > Math.abs(e.clientY - s.y) ? dx : 0);
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const s = start.current;
    start.current = null;
    drag(0);
    if (!s) return;
    const target = phases[index + swipeStep(e.clientX - s.x, e.clientY - s.y)];
    if (target && target.key !== value) onChange(target.key);
  }
  function onPointerCancel() {
    start.current = null;
    drag(0);
  }

  return (
    <div>
      <Tabs
        label="Phases"
        tabs={phases.map((p) => ({ key: p.key, label: PHASE_TAB[p.key] }))}
        value={value}
        onChange={onChange}
        done={done}
      />
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className={cn('overflow-hidden', phone ? 'touch-pan-y px-4' : 'px-5 pb-3')}
      >
        <div ref={pane} role="tabpanel" aria-label={PHASE_NAME[value]}>
          <div className="flex items-center gap-2.5 pt-3.5 pb-1.5">
            <h2 className="text-lg font-[750] tracking-[-0.01em] text-ink">{PHASE_NAME[value]}</h2>
            <span className="text-[0.78125rem] font-medium text-muted">
              Phase {index + 1} of {phases.length}
            </span>
            <span aria-hidden="true" className="ms-auto flex items-center gap-[5px]">
              {phases.map((p, i) => (
                <i
                  key={p.key}
                  className={cn(
                    'block h-[7px] rounded-full',
                    i === index
                      ? 'w-5 bg-accent'
                      : done.has(p.key)
                        ? 'w-[7px] bg-ink-2'
                        : 'w-[7px] bg-line',
                  )}
                />
              ))}
            </span>
          </div>
          {children}
        </div>
        {phone && phases.length > 1 && (
          <div className="flex items-center justify-between gap-2 text-[0.78125rem] font-medium text-muted">
            <PagerLink phase={previous} onChange={onChange} back />
            <span>swipe to change phase</span>
            <PagerLink phase={next} onChange={onChange} />
          </div>
        )}
      </div>
    </div>
  );
}

/** "‹ Auto" / "Endgame ›": a tap goes there too, for anyone who cannot swipe. */
function PagerLink({
  phase,
  onChange,
  back = false,
}: {
  phase: Phase | undefined;
  onChange: (phase: FieldPhase) => void;
  back?: boolean;
}) {
  if (!phase) return <span className="min-w-12" />;
  return (
    <button
      type="button"
      onClick={() => onChange(phase.key)}
      aria-label={`${back ? 'Previous' : 'Next'} phase: ${PHASE_TAB[phase.key]}`}
      className={cn(
        'hover-veil flex min-h-12 min-w-12 items-center gap-1 rounded-control',
        back ? '-ms-2 ps-2 pe-2' : '-me-2 ps-2 pe-2',
      )}
    >
      {back && <span aria-hidden="true">‹</span>}
      <b className="font-semibold text-ink-2">{PHASE_TAB[phase.key]}</b>
      {!back && <span aria-hidden="true">›</span>}
    </button>
  );
}
