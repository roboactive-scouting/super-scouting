import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * The form tags (task 1.29), beside tag.tsx's TAG shape but in their own module: only the lazy
 * forms and builder pages use them, so they stay out of the initial bundle.
 */
const TAG =
  'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-tag px-[9px] text-[0.78125rem] font-[650]';

/** The version tag's shape and tone, for the builder's version chip (a button) to share. */
export function versionTagClass(tone: 'draft' | 'published'): string {
  return cn(
    TAG,
    'px-2',
    tone === 'published' ? 'bg-accent-tint text-accent-ink' : 'bg-line-2 text-ink-2',
  );
}

/**
 * A form version's status (THEME "Builder top bar" version chip, "Form card" status tag):
 * a draft on `--line-2`, a published version on `--accent-tint` with a lock when it is locked.
 */
export function VersionTag({
  tone,
  locked = false,
  children,
}: {
  tone: 'draft' | 'published';
  locked?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={versionTagClass(tone)}>
      {locked && <Lock aria-hidden="true" className="size-[13px]" />}
      {children}
    </span>
  );
}

/** A form that does not exist yet: white, a `--control-border` outline, `--muted` words. */
export function NotCreatedTag() {
  return (
    <span className={cn(TAG, 'bg-surface px-2 text-muted ring-1 ring-inset ring-control-border')}>
      Not created
    </span>
  );
}
