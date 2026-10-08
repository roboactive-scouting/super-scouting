import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { FieldPhase } from '@frc/shared';
import {
  followOffset,
  gestureIntent,
  releaseVelocity,
  TEXT_ENTRY,
  type DragSample,
} from '@/components/ui/drag-dismiss';
import { Tabs } from '@/components/ui/tabs';
import { EASE_IN_PLACE, playOnce, prefersReducedMotion } from '@/lib/animate';
import { cn } from '@/lib/utils';
import { PHASE_NAME, PHASE_TAB, swipeStep, type Phase } from './phases';

/** The pane leaving after a swipe, then the next one arriving from the side it swiped from. */
const LEAVE_MS = 140;
const ENTER_MS = 260;
const SETTLE_MS = 200;
/** A click this soon after a swipe's release is the swipe's own, not a tap. */
const CLICK_AFTER_SWIPE_MS = 400;

type Swipe = {
  id: number;
  x: number;
  y: number;
  reduced: boolean;
  engaged: boolean;
  dx: number;
  samples: DragSample[];
};

/**
 * One phase at a time (Entry README, variant B): the tabs with a ✓ on each done phase, the
 * pane header ("Teleop", "Phase 2 of 4", pager dots) and the pane. On a phone a sideways
 * swipe anywhere in `swipeArea` (the whole page; this component by default) changes phase
 * (left = next, right = previous): the pane follows the finger, with a rubber band past the
 * first and last phase, and goes past the distance or flick of `swipeStep`, else springs
 * back. A swipe may start on a counter (a tap still taps), never on a focused text field,
 * and a mostly vertical gesture is left to scroll the page. The foot names the phases on
 * either side. With reduced motion nothing follows the finger and the phase just changes.
 */
export function PhaseTabs({
  phases,
  value,
  onChange,
  done,
  phone,
  swipeArea,
  children,
}: {
  phases: readonly Phase[];
  value: FieldPhase;
  onChange: (phase: FieldPhase) => void;
  done: ReadonlySet<FieldPhase>;
  phone: boolean;
  /** Where a phone swipe counts: the page's `<main>`, so the space below a short form does too. */
  swipeArea?: RefObject<HTMLElement | null>;
  /** The current phase's fields. */
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const swipe = useRef<Swipe | null>(null);
  const swipedAt = useRef(-Infinity);
  /** After a swipe: how far off the new phase starts (the pane's width); 0 for a tab tap. */
  const entering = useRef(0);
  const leaving = useRef<number | undefined>(undefined);
  const index = Math.max(
    0,
    phases.findIndex((p) => p.key === value),
  );
  const previous = phases[index - 1];
  const next = phases[index + 1];

  // The new phase slides in from the side it came from (phone only: it carries the swipe),
  // before the first paint of its fields, so the old pane's last position never flashes.
  const shown = useRef(index);
  useLayoutEffect(() => {
    const from = shown.current;
    shown.current = index;
    const el = pane.current;
    if (!phone || from === index || !el) return;
    window.clearTimeout(leaving.current);
    const side = index > from ? 1 : -1;
    const width = entering.current;
    entering.current = 0;
    el.style.transition = '';
    el.style.transform = '';
    playOnce(
      el,
      width > 0
        ? [{ transform: `translateX(${side * width}px)` }, { transform: 'none' }]
        : [
            { transform: `translateX(${side * 32}px)`, opacity: 0.4 },
            { transform: 'none', opacity: 1 },
          ],
      width > 0 ? ENTER_MS : 250,
    );
  }, [index, phone]);

  useEffect(() => () => window.clearTimeout(leaving.current), []);

  useEffect(() => {
    const area = swipeArea?.current ?? root.current;
    if (!phone || !area) return;

    function place(offset: number, ms: number, easing = EASE_IN_PLACE) {
      const el = pane.current;
      if (!el) return;
      el.style.transition = ms > 0 ? `transform ${ms}ms ${easing}` : 'none';
      el.style.transform = offset === 0 ? '' : `translateX(${offset}px)`;
    }
    /** 1:1 toward a phase that exists; a rubber band past the first or the last. */
    function offset(dx: number) {
      if (phases[index + (dx < 0 ? 1 : -1)]) return dx;
      return -Math.sign(dx) * followOffset(-Math.abs(dx));
    }

    function down(e: PointerEvent) {
      // A new press is a new gesture: its click is its own, however soon after a swipe.
      swipedAt.current = -Infinity;
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      const text = (e.target as Element).closest(TEXT_ENTRY);
      if (text && text === document.activeElement) return;
      swipe.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        reduced: prefersReducedMotion(),
        engaged: false,
        dx: 0,
        samples: [],
      };
    }
    function move(e: PointerEvent) {
      const s = swipe.current;
      if (!s || e.pointerId !== s.id || !area) return;
      const dx = e.clientX - s.x;
      if (!s.engaged) {
        // A sheet's axis lock (drag-dismiss), either way along the row.
        const intent = gestureIntent('start', -Math.abs(dx), e.clientY - s.y);
        if (intent === null) return;
        if (intent === 'other') {
          swipe.current = null;
          return;
        }
        s.engaged = true;
        pane.current?.getAnimations?.().forEach((a) => a.cancel());
        try {
          area.setPointerCapture?.(e.pointerId);
        } catch {
          // A pointer the browser no longer tracks: the swipe still follows the events it gets.
        }
      }
      s.dx = dx;
      s.samples.push({ t: e.timeStamp, d: dx });
      if (s.samples.length > 8) s.samples.shift();
      if (!s.reduced) place(offset(dx), 0);
    }
    function up(e: PointerEvent) {
      const s = swipe.current;
      if (!s || e.pointerId !== s.id) return;
      swipe.current = null;
      if (!s.engaged) return;
      swipedAt.current = performance.now();
      // The clipping box's width, padding included: a pane moved that far is out of sight.
      const width = pane.current?.parentElement?.offsetWidth ?? 0;
      const step = swipeStep(s.dx, releaseVelocity(s.samples), width);
      const target = step === 0 ? undefined : phases[index + step];
      if (!target) return s.reduced ? undefined : place(0, SETTLE_MS);
      if (s.reduced || width === 0) return onChange(target.key);
      place(-step * width, LEAVE_MS, 'ease-out');
      entering.current = width;
      leaving.current = window.setTimeout(() => onChange(target.key), LEAVE_MS);
    }
    function cancel(e: PointerEvent) {
      const s = swipe.current;
      if (!s || e.pointerId !== s.id) return;
      swipe.current = null;
      if (!s.engaged) return;
      swipedAt.current = performance.now();
      if (!s.reduced) place(0, SETTLE_MS);
    }
    /** A swipe that began on a counter's button is not a tap on it. */
    function click(e: MouseEvent) {
      if (performance.now() - swipedAt.current > CLICK_AFTER_SWIPE_MS) return;
      swipedAt.current = -Infinity;
      e.preventDefault();
      e.stopPropagation();
    }
    // A swipe must stop the page's own pan, or the browser takes the gesture and cancels it.
    function hold(e: TouchEvent) {
      if (swipe.current?.engaged && e.cancelable) e.preventDefault();
    }

    area.addEventListener('pointerdown', down);
    area.addEventListener('pointermove', move);
    area.addEventListener('pointerup', up);
    area.addEventListener('pointercancel', cancel);
    area.addEventListener('click', click, true);
    area.addEventListener('touchmove', hold, { passive: false });
    return () => {
      area.removeEventListener('pointerdown', down);
      area.removeEventListener('pointermove', move);
      area.removeEventListener('pointerup', up);
      area.removeEventListener('pointercancel', cancel);
      area.removeEventListener('click', click, true);
      area.removeEventListener('touchmove', hold);
    };
  }, [phone, swipeArea, phases, index, onChange]);

  return (
    <div ref={root} className={cn(phone && 'flex flex-1 flex-col')}>
      <Tabs
        label="Phases"
        tabs={phases.map((p) => ({ key: p.key, label: PHASE_TAB[p.key] }))}
        value={value}
        onChange={onChange}
        done={done}
      />
      <div className={cn('overflow-hidden', phone ? 'flex-1 touch-pan-y px-4' : 'px-5 pb-3')}>
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
