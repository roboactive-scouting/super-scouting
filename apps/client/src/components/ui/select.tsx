import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { inputClass } from './input';

/**
 * A styled native <select> (THEME "Select"): white, `--control-border`, 16 px / 600 text and
 * a `--muted` chevron. Native on purpose: a phone opens its own picker rather than a 30-row
 * scroll, and the tests drive it with `selectOptions`. `className` styles the select itself;
 * `wrapperClassName` the box around it. `lg` is the 56 px Scout size.
 */
export function Select({
  className,
  wrapperClassName,
  size = 'md',
  ...props
}: Omit<ComponentProps<'select'>, 'size'> & {
  size?: 'md' | 'lg';
  wrapperClassName?: string;
}) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select
        className={cn(
          inputClass,
          'appearance-none pe-10 font-semibold',
          size === 'lg' && 'min-h-14',
          className,
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
