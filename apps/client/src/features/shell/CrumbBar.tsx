import { Fragment } from 'react';
import { useCrumb } from '@/lib/pageTitle';
import { SyncPill, type SyncStatus } from './SyncPill';

/**
 * The desktop top bar (THEME "Top bar", 60 px): where you are on the left ("Admin / Users"),
 * the sending state as chips on the right.
 */
export function CrumbBar({ status }: { status: SyncStatus }) {
  const { trail, current } = useCrumb();
  return (
    <header className="sticky top-0 z-20 flex h-[3.75rem] shrink-0 items-center gap-3.5 border-b border-line bg-surface px-8">
      <p className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted">
        {trail.map((part) => (
          <Fragment key={part}>
            <span dir="auto">{part}</span> /{' '}
          </Fragment>
        ))}
        <b dir="auto" className="font-semibold text-ink">
          {current}
        </b>
      </p>
      <SyncPill status={status} />
    </header>
  );
}
