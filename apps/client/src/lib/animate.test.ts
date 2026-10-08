import { afterEach, describe, expect, it, vi } from 'vitest';
import { EASE_IN_PLACE, playOnce, prefersReducedMotion } from './animate';

const original = window.matchMedia;
const FADE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

function stubReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('reduce') ? reduce : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

/** A div with a spy where jsdom has no `animate`. */
function animatable() {
  const el = document.createElement('div');
  const animate = vi.fn(() => ({}) as Animation);
  Object.defineProperty(el, 'animate', { value: animate });
  return { el, animate };
}

afterEach(() => {
  window.matchMedia = original;
  vi.restoreAllMocks();
});

describe('playOnce', () => {
  it('animates once with the timing it is given and never holds the end state', () => {
    stubReducedMotion(false);
    const { el, animate } = animatable();
    playOnce(el, FADE, 250);
    expect(animate).toHaveBeenCalledWith(FADE, {
      duration: 250,
      easing: EASE_IN_PLACE,
      fill: 'none',
    });
  });

  it('does nothing under prefers-reduced-motion', () => {
    stubReducedMotion(true);
    const { el, animate } = animatable();
    expect(playOnce(el, FADE, 250)).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('does nothing without matchMedia, without element.animate, or without an element', () => {
    // @ts-expect-error jsdom has no matchMedia; removed here on purpose
    window.matchMedia = undefined;
    expect(prefersReducedMotion()).toBe(true);
    stubReducedMotion(false);
    expect(playOnce(document.createElement('div'), FADE, 250)).toBeNull();
    expect(playOnce(null, FADE, 250)).toBeNull();
  });
});
