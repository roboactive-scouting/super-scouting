import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { inputClass } from './input';

/**
 * A styled native <select>. Native on purpose: a phone opens its own picker rather than a
 * 30-row scroll, and the tests drive it with `selectOptions`. `className` styles the select
 * itself (and so carries `tap-target`); `wrapperClassName` the box around it.
 */
export function NativeSelect({
  className,
  wrapperClassName,
  ...props
}: ComponentProps<'select'> & { wrapperClassName?: string }) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select className={cn(inputClass, 'appearance-none pe-10', className)} {...props} />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
      />
    </div>
  );
}
