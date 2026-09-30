import type { ReactNode, Ref } from 'react';
import { cn } from '@/lib/utils';

const TONE = {
  info: 'border-s-border',
  success: 'border-s-status-played',
  warning: 'border-s-warning',
  danger: 'border-s-danger',
} as const;

/**
 * What the page must say out loud: a strip under the shell's top edge, or a box beside
 * the thing it is about. The start edge carries the tone; the text stays `--text`. It
 * rises in once when it appears — a state change the user must notice (SPEC-FINAL 17.9)
 * — unless `still`, and never moves again. `role` is the caller's: "status" for a state,
 * "alert" for a failure, none for a static line.
 */
export function Notice({
  tone = 'info',
  role,
  still = false,
  action,
  className,
  children,
  ref,
  ...rest
}: {
  tone?: keyof typeof TONE;
  role?: 'status' | 'alert';
  still?: boolean;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
  id?: string;
  tabIndex?: number;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  return (
    <div
      ref={ref}
      role={role}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-s-4 border-border bg-surface px-3 py-2.5 text-sm text-text',
        TONE[tone],
        !still && 'enter-rise',
        className,
      )}
      {...rest}
    >
      <div dir="auto" className="min-w-0 flex-1">
        {children}
      </div>
      {action}
    </div>
  );
}
