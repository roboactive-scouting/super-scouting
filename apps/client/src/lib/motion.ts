import { useEffect, useRef, type RefObject } from 'react';

/** Material 3 easing curves — the same values as styles/motion.css. */
export const EASING = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  standardDecelerate: 'cubic-bezier(0, 0, 0, 1)',
  standardAccelerate: 'cubic-bezier(0.3, 0, 1, 1)',
  emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
} as const;

/** Material 3 durations in milliseconds — the same values as styles/motion.css. */
export const DURATION = {
  short2: 100,
  short3: 150,
  short4: 200,
  medium1: 250,
  medium2: 300,
  medium4: 400,
} as const;

/**
 * A new page fading in: M3's fade-through, opacity only. M3 also scales the incoming
 * container, but a transform on the page wrapper would re-anchor every `position: fixed`
 * descendant for the length of the animation, so the page only fades.
 */
export const PAGE_ENTER: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

/**
 * A counter's value confirming the tap (SPEC-FINAL 8.6): informational, so it is one of
 * the few movements allowed on the data-entry path (17.9).
 */
export const VALUE_TICK: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.15)' },
  { transform: 'scale(1)' },
];

export type MotionOptions = { duration: number; easing: string };

/** True when the device asks for reduced motion — or cannot say (jsdom): no motion then. */
export function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Plays one animation on `el` through the Web Animations API and returns it, or does
 * nothing and returns null: no element, no `animate` (jsdom), or reduced motion. Never
 * loops, and never holds its end state (`fill: 'none'`), so the element's own CSS is
 * what remains.
 */
export function play(
  el: Element | null,
  keyframes: Keyframe[],
  options: MotionOptions,
): Animation | null {
  if (el === null || typeof el.animate !== 'function' || prefersReducedMotion()) return null;
  return el.animate(keyframes, {
    duration: options.duration,
    easing: options.easing,
    fill: 'none',
  });
}

/**
 * Replays `keyframes` on the element in `ref` each time `key` changes — never on the
 * first render. The element is never remounted, so a page or a counter keeps its state
 * (AppShell must never key its Outlet: that throws a part-filled form away).
 */
export function usePlayOnChange(
  ref: RefObject<Element | null>,
  key: unknown,
  keyframes: Keyframe[],
  options: MotionOptions,
  enabled = true,
): void {
  const previous = useRef(key);
  useEffect(() => {
    if (Object.is(previous.current, key)) return;
    previous.current = key;
    if (enabled) play(ref.current, keyframes, options);
  }, [key, enabled, ref, keyframes, options]);
}
