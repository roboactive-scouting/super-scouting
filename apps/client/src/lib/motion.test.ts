import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DURATION,
  EASING,
  PAGE_ENTER,
  play,
  prefersReducedMotion,
  usePlayOnChange,
} from './motion';

const original = window.matchMedia;

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

const OPTIONS = { duration: DURATION.medium1, easing: EASING.emphasizedDecelerate };

afterEach(() => {
  window.matchMedia = original;
  vi.restoreAllMocks();
});

describe('play', () => {
  it('animates with the M3 tokens it is given and never holds the end state', () => {
    stubReducedMotion(false);
    const { el, animate } = animatable();
    play(el, PAGE_ENTER, OPTIONS);
    expect(animate).toHaveBeenCalledWith(PAGE_ENTER, {
      duration: 250,
      easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
      fill: 'none',
    });
  });

  it('does nothing under prefers-reduced-motion', () => {
    stubReducedMotion(true);
    const { el, animate } = animatable();
    expect(play(el, PAGE_ENTER, OPTIONS)).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('does nothing without matchMedia, without element.animate, or without an element', () => {
    // @ts-expect-error jsdom has no matchMedia; removed here on purpose
    window.matchMedia = undefined;
    expect(prefersReducedMotion()).toBe(true);
    stubReducedMotion(false);
    expect(play(document.createElement('div'), PAGE_ENTER, OPTIONS)).toBeNull();
    expect(play(null, PAGE_ENTER, OPTIONS)).toBeNull();
  });
});

describe('usePlayOnChange', () => {
  it('plays when the key changes, never on the first render or an unchanged key', () => {
    stubReducedMotion(false);
    const { el, animate } = animatable();
    const ref = { current: el };
    const { rerender } = renderHook(({ k }) => usePlayOnChange(ref, k, PAGE_ENTER, OPTIONS), {
      initialProps: { k: 'a' },
    });
    expect(animate).not.toHaveBeenCalled();
    rerender({ k: 'a' });
    expect(animate).not.toHaveBeenCalled();
    rerender({ k: 'b' });
    expect(animate).toHaveBeenCalledOnce();
  });

  it('skips a change while disabled, and never replays it later', () => {
    stubReducedMotion(false);
    const { el, animate } = animatable();
    const ref = { current: el };
    const { rerender } = renderHook(
      ({ k, on }) => usePlayOnChange(ref, k, PAGE_ENTER, OPTIONS, on),
      { initialProps: { k: 'a', on: true } },
    );
    rerender({ k: 'b', on: false });
    rerender({ k: 'b', on: true });
    expect(animate).not.toHaveBeenCalled();
  });
});
