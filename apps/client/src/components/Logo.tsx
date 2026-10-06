import { cn } from '@/lib/utils';

const IMAGE = {
  sm: { mark: 'h-8 w-8', lockup: 'h-8 w-auto' },
  // The wordmark needs ~96 px of width to read (SPEC-FINAL 17.8); the lockup is taller
  // than it is wide, so `lg` is 144 px tall.
  lg: { mark: 'h-16 w-16', lockup: 'h-36 w-auto' },
} as const;

/**
 * SPEC-FINAL 17.4: brand yellow is 1.23:1 on white and 16:1 on near-black, so the
 * logo always sits on a --brand-plate plate, INCLUDING in the outdoor theme.
 */
export function Logo({
  variant = 'lockup',
  size = 'sm',
  className,
}: {
  variant?: 'lockup' | 'mark';
  size?: 'sm' | 'lg';
  className?: string;
}) {
  return (
    <span className={cn('brand-plate inline-flex items-center rounded-md p-2', className)}>
      <img
        src={variant === 'mark' ? '/brand/mark.png' : '/brand/logo.png'}
        alt="ROBACTIVE 2096"
        className={IMAGE[size][variant]}
      />
    </span>
  );
}
