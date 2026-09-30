import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type CardProps = Omit<ComponentProps<'div'>, 'ref'> & {
  /** `section` when the card is a labelled part of the page (pass `aria-labelledby`). */
  as?: 'div' | 'section';
  /** `danger` edges a card that holds an irreversible action (SPEC-FINAL 17.8). */
  tone?: 'default' | 'danger';
};

/** One bordered surface. Never put a Card inside a Card (BUILD-CONTEXT 12.4). */
export function Card({ as: Tag = 'div', tone = 'default', className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-xl border bg-surface p-5',
        tone === 'danger' ? 'border-danger' : 'border-border',
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
  return <Heading className={cn('text-base font-semibold', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('mt-1 text-sm text-text-muted', className)} {...props} />;
}
