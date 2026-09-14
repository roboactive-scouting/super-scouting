import { cn } from '@/lib/utils';

/**
 * SPEC-FINAL 17.4: brand yellow is 1.23:1 on white and 16:1 on near-black, so the
 * logo always sits on a --brand-plate plate, INCLUDING in the outdoor theme.
 */
export function Logo({
  variant = 'lockup',
  className,
}: {
  variant?: 'lockup' | 'mark';
  className?: string;
}) {
  return (
    <span className={cn('brand-plate inline-flex items-center rounded-md p-2', className)}>
      <img
        src={variant === 'mark' ? '/brand/mark.png' : '/brand/logo.png'}
        alt="ROBACTIVE 2096"
        className={variant === 'mark' ? 'h-8 w-8' : 'h-8 w-auto'}
      />
    </span>
  );
}
