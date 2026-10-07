import { useEffect, useRef, type PointerEvent, type RefObject, type MouseEvent } from 'react';
import { EASE_IN_PLACE, prefersReducedMotion } from '@/lib/animate';

/**
 * Drag-to-dismiss for the phone's floating panels (UI fix round, UF.4): a bottom sheet
 * follows the finger down and the ☰ menu follows a swipe back toward its edge. The numbers
 * are pure functions below; `useDragDismiss` wires them to pointer events.
 */

/** The edge a panel leaves through: `bottom` (a sheet, dragged down) or `start` (the menu). */
export type DragEdge = 'bottom' | 'start';

/** A release this far toward the edge closes: 30 % of the panel, never more than 120 px. */
export const DISMISS_FRACTION = 0.3;
export const DISMISS_MAX_PX = 120;
/** A flick toward the edge at least this fast closes at any distance (px per ms). */
export const FLICK_PX_PER_MS = 0.5;
/** The other way, the panel gives a rubber band that never passes this. */
export const RUBBER_BAND_PX = 24;
/** Movement before a gesture counts as a drag (or as a scroll, and is left alone). */
export const DRAG_SLOP_PX = 6;
/** The last stretch of movement a release's speed is measured over. */
export const VELOCITY_WINDOW_MS = 100;

/** The distance at which a release closes the panel. */
export function dismissThreshold(size: number): number {
  return Math.min(size * DISMISS_FRACTION, DISMISS_MAX_PX);
}

/** How far a pointer has moved toward the panel's edge (negative: away from it). */
export function towardEdge(edge: DragEdge, dx: number, dy: number, rtl = false): number {
  if (edge === 'bottom') return dy;
  return rtl ? dx : -dx;
}

/**
 * Whether a gesture is a dismiss drag, once it has moved past the slop: `dismiss` along the
 * panel's axis toward its edge, `other` for anything else (a scroll, the wrong way), `null`
 * while it is still too small to say.
 */
export function gestureIntent(
  edge: DragEdge,
  dx: number,
  dy: number,
  rtl = false,
): 'dismiss' | 'other' | null {
  if (Math.hypot(dx, dy) < DRAG_SLOP_PX) return null;
  const along = edge === 'bottom' ? Math.abs(dy) : Math.abs(dx);
  const across = edge === 'bottom' ? Math.abs(dx) : Math.abs(dy);
  return along > across && towardEdge(edge, dx, dy, rtl) > 0 ? 'dismiss' : 'other';
}

/**
 * Where the panel sits for a drag `distance` toward its edge: it follows the finger that way,
 * and the other way it gives a rubber band that slows and stops short of RUBBER_BAND_PX.
 */
export function followOffset(distance: number): number {
  if (distance >= 0) return distance;
  const pull = -distance;
  return -(RUBBER_BAND_PX * pull) / (pull + 2 * RUBBER_BAND_PX);
}

export type DragSample = { t: number; d: number };

/** Speed toward the edge (px per ms) over the last VELOCITY_WINDOW_MS of samples. */
export function releaseVelocity(samples: readonly DragSample[]): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  const first = samples.find((s) => last.t - s.t <= VELOCITY_WINDOW_MS) ?? last;
  const dt = last.t - first.t;
  return dt > 0 ? (last.d - first.d) / dt : 0;
}

/** On release: close past the threshold or on a fast flick toward the edge; else spring back. */
export function shouldDismiss(distance: number, velocity: number, size: number): boolean {
  if (distance <= 0) return false;
  return distance >= dismissThreshold(size) || velocity >= FLICK_PX_PER_MS;
}

/** Text being typed into keeps its own gestures (moving the caret, selecting). */
const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const SETTLE_MS = 200;
const LEAVE_MS = 160;
/** A click this soon after a drag's release is the drag's own, not a tap. */
const CLICK_AFTER_DRAG_MS = 400;

type Gesture = {
  id: number;
  x: number;
  y: number;
  rtl: boolean;
  reduced: boolean;
  engaged: boolean;
  distance: number;
  samples: DragSample[];
};

/** True when anything from `target` up to the panel is scrolled away from its top. */
function scrolledDown(target: Element, panel: HTMLElement): boolean {
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
    if (el === panel) break;
  }
  return false;
}

/**
 * Drag-to-dismiss on `panel` for touch and pen (a mouse keeps selecting text). A bottom sheet's
 * drag starts on its `[data-drag-handle]` area, or in its body only when nothing under the
 * finger is scrolled down, so scrolling content still scrolls; never on a focused text field.
 * Past the threshold or on a flick it calls `onDismiss` — the panel's own close path, as ✕
 * does — otherwise the panel springs back. Reduced motion: nothing follows the finger, and a
 * qualifying swipe just closes. Spread the handlers on the panel.
 */
export function useDragDismiss(
  panel: RefObject<HTMLElement | null>,
  { edge, enabled, onDismiss }: { edge: DragEdge; enabled: boolean; onDismiss: () => void },
) {
  const gesture = useRef<Gesture | null>(null);
  const draggedAt = useRef(-Infinity);
  const leaving = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(leaving.current), []);

  // React listens to touchmove passively; a drag must stop the page's own pan, or the
  // browser takes the gesture and cancels the pointer.
  useEffect(() => {
    const el = panel.current;
    if (!el || !enabled) return;
    const hold = (e: TouchEvent) => {
      if (gesture.current?.engaged && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', hold, { passive: false });
    return () => el.removeEventListener('touchmove', hold);
  }, [panel, enabled]);

  function place(el: HTMLElement, offset: number, rtl: boolean, ms: number) {
    el.style.transition = ms > 0 ? `translate ${ms}ms ${EASE_IN_PLACE}` : 'none';
    const px = edge === 'bottom' ? offset : rtl ? offset : -offset;
    el.style.translate = offset === 0 ? '' : edge === 'bottom' ? `0 ${px}px` : `${px}px 0`;
  }

  function settle(g: Gesture) {
    const el = panel.current;
    if (el && !g.reduced) place(el, 0, g.rtl, SETTLE_MS);
  }

  function onPointerDown(e: PointerEvent<HTMLElement>) {
    const el = panel.current;
    if (!enabled || !el || e.pointerType === 'mouse' || !e.isPrimary) return;
    const target = e.target as Element;
    const text = target.closest(TEXT_ENTRY);
    if (text && text === document.activeElement) return;
    const fromHandle = target.closest('[data-drag-handle]') !== null;
    if (edge === 'bottom' && !fromHandle && scrolledDown(target, el)) return;
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      rtl: getComputedStyle(el).direction === 'rtl',
      reduced: prefersReducedMotion(),
      engaged: false,
      distance: 0,
      samples: [],
    };
  }

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    const el = panel.current;
    if (!g || !el || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.engaged) {
      const intent = gestureIntent(edge, dx, dy, g.rtl);
      if (intent === null) return;
      if (intent === 'other') {
        gesture.current = null;
        return;
      }
      g.engaged = true;
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        // A pointer the browser no longer tracks: the drag still follows the events it gets.
      }
    }
    g.distance = towardEdge(edge, dx, dy, g.rtl);
    g.samples.push({ t: e.timeStamp, d: g.distance });
    if (g.samples.length > 8) g.samples.shift();
    if (!g.reduced) place(el, followOffset(g.distance), g.rtl, 0);
  }

  function onPointerUp(e: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    const el = panel.current;
    if (!g || e.pointerId !== g.id) return;
    gesture.current = null;
    if (!g.engaged || !el) return;
    draggedAt.current = performance.now();
    const size = edge === 'bottom' ? el.offsetHeight : el.offsetWidth;
    if (!shouldDismiss(g.distance, releaseVelocity(g.samples), size)) return settle(g);
    if (g.reduced) return onDismiss();
    place(el, Math.max(size, g.distance), g.rtl, LEAVE_MS);
    leaving.current = window.setTimeout(onDismiss, LEAVE_MS);
  }

  function onPointerCancel(e: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    gesture.current = null;
    if (!g.engaged) return;
    draggedAt.current = performance.now();
    settle(g);
  }

  /** A drag that began on a button is not a tap on it. */
  function onClickCapture(e: MouseEvent<HTMLElement>) {
    if (performance.now() - draggedAt.current > CLICK_AFTER_DRAG_MS) return;
    draggedAt.current = -Infinity;
    e.preventDefault();
    e.stopPropagation();
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture };
}
