import { Fragment } from 'react';
import { useCrumb } from '@/lib/pageTitle';
import { SyncPill, type SyncStatus } from './SyncPill';
import { TOP_BAR } from './barHeights';

/**
 * The desktop top bar (THEME "Top bar", 60 px): where you are on the left ("Admin / Users"),
 * the sending state as chips on the right. Exactly `TOP_BAR.desktop` tall (the shell's `--top-bar`).
 */
export function CrumbBar({ status }: { status: SyncStatus }) {
  const { trail, current } = useCrumb();
  return (
    <header
      style={{ height: TOP_BAR.desktop }}
      className="sticky top-0 z-20 flex shrink-0 items-center gap-3.5 border-b border-line bg-surface px-8"
    >
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
