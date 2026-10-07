import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type CardProps = Omit<ComponentProps<'div'>, 'ref'> & {
  /** `section` when the card is a labelled part of the page (pass `aria-labelledby`). */
  as?: 'div' | 'section';
  /** `danger` is THEME's "Danger section": a 3 px `--ink` start edge (never red). */
  tone?: 'default' | 'danger';
};

/** One bordered surface: white, 1 px `--line`, 12 px radius, no shadow. Never a Card in a Card. */
export function Card({ as: Tag = 'div', tone = 'default', className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-card border border-line bg-surface p-5',
        tone === 'danger' && 'border-s-[3px] border-s-ink',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)} {...props} />
  );
}

export function CardTitle({
  level = 2,
  className,
  ...props
}: ComponentProps<'h2'> & { level?: 2 | 3 }) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return <Heading className={cn('text-[0.96875rem] font-[650]', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('mt-1 text-[0.8125rem] text-muted', className)} {...props} />;
}
