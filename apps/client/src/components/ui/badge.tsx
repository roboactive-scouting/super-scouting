import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Each tone as [edge, dot] classes: SPEC-FINAL 17.4's functional colours, never brand yellow. */
const TONE = {
  neutral: ['border-border', 'bg-text-muted'],
  played: ['border-status-played', 'bg-status-played'],
  broke_down: ['border-status-broke-down', 'bg-status-broke-down'],
  disabled: ['border-status-disabled', 'bg-status-disabled'],
  no_show: ['border-status-no-show', 'bg-status-no-show'],
  success: ['border-status-played', 'bg-status-played'],
  warning: ['border-warning', 'bg-warning'],
  danger: ['border-danger', 'bg-danger'],
  'alliance-red': ['border-alliance-red', 'bg-alliance-red'],
  'alliance-blue': ['border-alliance-blue', 'bg-alliance-blue'],
} as const;

export type BadgeTone = keyof typeof TONE;

/**
 * A small label with a coloured dot. The dot and the edge carry the colour; the text stays
 * `--text`, so every tone clears 4.5:1 in both themes with no contrast check of its own.
 */
export function Badge({
  tone = 'neutral',
  className,
  children,
  ...props
}: ComponentProps<'span'> & { tone?: BadgeTone }) {
  const [edge, dot] = TONE[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium text-text',
        edge,
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', dot)} />
      {children}
    </span>
  );
}
