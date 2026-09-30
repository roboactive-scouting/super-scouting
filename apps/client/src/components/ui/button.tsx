import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * SPEC-FINAL 17.7 asks 3:1 of a UI boundary. A `--brand-plate` fill on `--surface` has no
 * boundary to speak of (about 1.1:1), so the primary button carries a 1 px `--border` edge:
 * 3.67:1 on `--surface` and 4.09:1 on `--bg` in the dark theme, 7.03:1 and 7.73:1 in the
 * outdoor theme. The destructive button is an outline in `--danger`: 4.71:1 on `--surface`
 * (dark) and 5.89:1 (outdoor); its label stays `--text`.
 */
export const buttonVariants = cva(
  'tap-target state-layer press motion-transition inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** The one primary action: the brand plate with the yellow label (SPEC-FINAL 17.4). */
        primary: 'border border-border bg-brand-plate font-semibold text-brand',
        /** Everything that is not the primary action. */
        secondary: 'border border-border bg-surface text-text',
        /** A destructive verb (SPEC-FINAL 17.8). Outline only: no fill clears 4.5:1 in both themes. */
        destructive: 'border-2 border-danger font-semibold text-text',
        /** Navigation and low-emphasis actions: no edge, only the state layer. */
        ghost: 'text-text',
      },
      size: {
        default: 'px-4 text-sm',
        lg: 'px-6 text-base',
        icon: 'px-0',
        block: 'w-full px-4 text-base',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
);

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>;

/** A native button in one of four variants. `type` defaults to "button", never "submit". */
export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
