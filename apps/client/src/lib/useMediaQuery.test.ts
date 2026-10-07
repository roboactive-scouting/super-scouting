import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DESKTOP_QUERY, useIsDesktop, useMediaQuery } from './useMediaQuery';

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

function controllableMedia(initial: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: initial,
    media: DESKTOP_QUERY,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  window.matchMedia = (() => media) as unknown as typeof window.matchMedia;
  return {
    set(next: boolean) {
      media.matches = next;
      for (const l of listeners) l();
    },
  };
}

describe('useMediaQuery', () => {
  it('answers the fallback where there is no matchMedia (jsdom)', () => {
    expect(renderHook(() => useMediaQuery(DESKTOP_QUERY, true)).result.current).toBe(true);
    expect(renderHook(() => useMediaQuery(DESKTOP_QUERY, false)).result.current).toBe(false);
  });

  it('reads matchMedia synchronously on the first render (no flash of the desktop layout)', () => {
    controllableMedia(false);
    const seen: boolean[] = [];
    renderHook(() => {
      const value = useMediaQuery(DESKTOP_QUERY, true);
      seen.push(value);
      return value;
    });
    expect(seen[0]).toBe(false);
    expect(seen).not.toContain(true);
  });

  it('follows the query as it changes', () => {
    const media = controllableMedia(false);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
  });
});
