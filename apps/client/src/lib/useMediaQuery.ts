import { useEffect, useState } from 'react';

/** SPEC-FINAL 17.3: desktop starts at 1024 px; the width decides, never the user agent. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * A media query's answer, kept current. `fallback` is the answer where the browser has no
 * `matchMedia` — jsdom — so tests get a known layout without stubbing it.
 */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const supported = typeof window.matchMedia === 'function';
  const [matches, setMatches] = useState(() =>
    supported ? window.matchMedia(query).matches : fallback,
  );
  useEffect(() => {
    if (!supported) return;
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    listener();
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query, supported]);
  return matches;
}

/** Desktop (≥ 1024 px). Desktop under test, where jsdom cannot say. */
export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY, true);
}
