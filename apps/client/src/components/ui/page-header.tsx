import type { ReactNode } from 'react';

/**
 * The top of a page: its one h1, a muted line of what the page is for, and its actions on
 * the right. A <header> inside <main> is not a banner landmark, so pages keep theirs.
 */
export function PageHeader({
  title,
  description,
  actions,
  titleDir,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  titleDir?: 'auto';
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        <h1 dir={titleDir} className="text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description && <p className="mt-1 max-w-prose text-sm text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A section's heading row: its title and, on the right, its one or two actions. */
export function SectionHeader({
  id,
  title,
  actions,
  level = 2,
}: {
  id?: string;
  title: ReactNode;
  actions?: ReactNode;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Heading id={id} className="text-lg font-semibold">
        {title}
      </Heading>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
