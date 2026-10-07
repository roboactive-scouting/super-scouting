import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A text field at the 48 px floor (SPEC-FINAL 17.7): white, `--control-border`, 8 px radius.
 * 16 px text, so iOS Safari never zooms the page on focus. Focus is a 2 px `--accent` edge;
 * `aria-invalid` turns the edge to `--warn` (errors are never red).
 */
export const inputClass =
  'tap-target motion-transition w-full min-w-0 rounded-control border border-control-border bg-surface px-3 text-base text-ink placeholder:text-muted focus-visible:border-accent focus-visible:shadow-[inset_0_0_0_1px_var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-warn';

/** The "large number field" (THEME): 56 px, mono 26 px. */
export const inputLargeClass = 'min-h-14 font-num text-[26px] font-semibold';

export function Input({
  className,
  mono = false,
  size = 'md',
  ...props
}: Omit<ComponentProps<'input'>, 'size'> & {
  /** Numbers, codes and secrets: JetBrains Mono. */
  mono?: boolean;
  /** `lg` is the 56 px large number field. */
  size?: 'md' | 'lg';
}) {
  return (
    <input
      className={cn(inputClass, mono && 'font-num', size === 'lg' && inputLargeClass, className)}
      {...props}
    />
  );
}
