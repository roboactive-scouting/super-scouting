import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** SPEC-FINAL 17.9 (shadcn data-table): muted 1 px rules, no zebra striping. */
export function Table({
  className,
  containerClassName,
  ...props
}: ComponentProps<'table'> & { containerClassName?: string }) {
  return (
    <div className={cn('relative w-full overflow-x-auto', containerClassName)}>
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({
  className,
  sticky = false,
  ...props
}: ComponentProps<'thead'> & { sticky?: boolean }) {
  return (
    <thead
      className={cn(
        '[&_tr]:border-b [&_tr]:border-border',
        sticky && 'sticky top-0 z-10 bg-surface',
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'motion-transition border-b border-border hover:bg-surface-raised/50',
        className,
      )}
      {...props}
    />
  );
}

/** A column header. `numeric` right-aligns it over its numbers (SPEC-FINAL 17.9). */
export function TableHead({
  className,
  numeric = false,
  scope = 'col',
  ...props
}: ComponentProps<'th'> & { numeric?: boolean }) {
  return (
    <th
      scope={scope}
      className={cn(
        'h-11 px-3 align-middle text-xs font-medium text-text-muted',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric = false,
  ...props
}: ComponentProps<'td'> & { numeric?: boolean }) {
  return (
    <td
      className={cn('px-3 py-2.5 align-middle', numeric && 'text-right tabular-nums', className)}
      {...props}
    />
  );
}
