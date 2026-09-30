import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A text field at the 48 px floor (SPEC-FINAL 17.7). 16 px text, so iOS Safari never zooms
 * the page on focus. `aria-invalid` turns the edge to `--danger`.
 */
export const inputClass =
  'tap-target motion-transition w-full min-w-0 rounded-lg border border-border bg-bg px-3 text-base text-text placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputClass, className)} {...props} />;
}
