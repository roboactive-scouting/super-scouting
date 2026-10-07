import { Monitor } from 'lucide-react';
import type { ReactNode } from 'react';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';

/**
 * SPEC-FINAL 17.2: builders unlock at 1024 px; anything narrower gets one clear panel.
 * The width decides, never the user agent (17.3). Device gating is not a permission
 * (7.4): the page inside still checks the role, and the server checks it again.
 *
 * `what` is written as it reads mid-sentence, e.g. "the form builder".
 */
export function DesktopOnly({ what, children }: { what: string; children: ReactNode }) {
  const wide = useMediaQuery(DESKTOP_QUERY, true);
  if (wide) return <>{children}</>;

  return (
    <div className="motion-safe:animate-fade-in mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full border border-line bg-surface"
      >
        <Monitor className="size-6 text-muted" strokeWidth={1.5} />
      </span>
      <h1 className="mt-5 text-lg font-semibold">This needs a computer</h1>
      <p className="mt-2 text-sm text-muted">
        Open {what} on a screen at least 1024 pixels wide. It is pre-competition work, done sitting
        down. Phones do the competition job — entering, browsing and reading — and this is not one
        of those.
      </p>
    </div>
  );
}
