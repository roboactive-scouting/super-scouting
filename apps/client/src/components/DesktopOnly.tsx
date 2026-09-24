import { useEffect, useState, type ReactNode } from 'react';

const QUERY = '(min-width: 1024px)';

/**
 * SPEC-FINAL 17.2: builders unlock at 1024 px; anything narrower gets one clear panel.
 * The width decides, never the user agent (17.3). Device gating is not a permission
 * (7.4): the page inside still checks the role, and the server checks it again.
 *
 * `what` is written as it reads mid-sentence, e.g. "the form builder".
 */
export function DesktopOnly({ what, children }: { what: string; children: ReactNode }) {
  const [wide, setWide] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const listener = () => setWide(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  if (wide) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-lg font-semibold">This needs a computer</h1>
      <p className="mt-2 text-[var(--text-muted)]">
        Open {what} on a screen at least 1024 pixels wide. It is pre-competition work, done sitting
        down. Phones do the competition job — entering, browsing and reading — and this is not one
        of those.
      </p>
    </div>
  );
}
