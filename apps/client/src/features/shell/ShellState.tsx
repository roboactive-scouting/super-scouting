import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * A full-page state of the shell itself — no competition, loading, not loaded — laid out
 * like StateMessage (a glyph, one bold line, one muted line) but with its action optional:
 * a scouter on "no competition" has nothing to do but wait, and is told so.
 */
export function ShellState({
  glyph: Glyph,
  title,
  busy = false,
  children,
}: {
  glyph: LucideIcon;
  title: string;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      aria-busy={busy || undefined}
      className="enter-fade mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full border border-border bg-surface"
      >
        <Glyph className="size-6 text-text-muted" strokeWidth={1.5} />
      </span>
      <h1 className="mt-5 text-lg font-semibold" dir="auto">
        {title}
      </h1>
      {children}
    </div>
  );
}
