import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A multi-line field; the same edge, surface and 16 px text as `Input`. */
export const textareaClass =
  'motion-safe:transition block min-h-24 w-full rounded-control border border-control-border bg-surface px-3 py-2.5 text-base text-ink placeholder:text-muted focus-visible:border-accent focus-visible:shadow-[inset_0_0_0_1px_var(--accent)] disabled:opacity-50 aria-[invalid=true]:border-warn';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(textareaClass, className)} {...props} />;
}
