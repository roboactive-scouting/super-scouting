import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A multi-line field; the same edge, surface and 16 px text as `Input`. */
export const textareaClass =
  'motion-transition block min-h-24 w-full rounded-lg border border-border bg-bg p-3 text-base text-text placeholder:text-text-muted disabled:opacity-50 aria-[invalid=true]:border-danger';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(textareaClass, className)} {...props} />;
}
