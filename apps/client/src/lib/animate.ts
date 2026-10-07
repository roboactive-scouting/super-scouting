/**
 * The few movements CSS cannot start on its own: a counter's tick, a phase sliding in after a
 * swipe, a new page fading in. Entrances and transitions are Tailwind `motion-safe:` classes
 * (styles/index.css); this is only for a one-off replay on an element that stays mounted.
 */

/** Decelerating into place — the easing of every entrance in styles/index.css. */
export const EASE_IN_PLACE = 'cubic-bezier(0.05, 0.7, 0.1, 1)';

/** True when the device asks for reduced motion — or cannot say (jsdom): no motion then. */
export function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Plays `keyframes` once on `el` through the Web Animations API and returns it, or does
 * nothing and returns null: no element, no `animate` (jsdom), or reduced motion (SPEC-FINAL
 * 17.9). Never loops, and never holds its end state, so the element's own CSS remains.
 */
export function playOnce(
  el: Element | null,
  keyframes: Keyframe[],
  duration: number,
  easing: string = EASE_IN_PLACE,
): Animation | null {
  if (el === null || typeof el.animate !== 'function' || prefersReducedMotion()) return null;
  return el.animate(keyframes, { duration, easing, fill: 'none' });
}
