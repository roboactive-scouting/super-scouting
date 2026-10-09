import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * THEME "Locked components": primary is filled --accent, secondary is white with a
 * --control-border edge, ghost is bare, destructive is FILLED --ink (never red: red means
 * the red alliance). Heights are 36 / 44 / 52 / 52 (full width). The two smaller sizes keep
 * the SPEC-FINAL 17.7 48 px hit area with an invisible ::after that grows the target, so the
 * drawn button stays at the designed size. `tap-target` stays on every size; `min-h-9` and
 * `min-h-11` win over it (utilities layer over components layer) for the drawn height only.
 */
const HIT_AREA = "relative after:absolute after:inset-x-0 after:content-['']";

const MD = `${HIT_AREA} min-h-11 px-[18px] text-[0.90625rem] after:-inset-y-0.5`;

export const buttonVariants = cva(
  'tap-target hover-veil motion-safe:transition motion-safe:active:not-disabled:scale-[0.97] inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control border font-semibold disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[17px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** The one primary action. */
        primary: 'border-accent bg-accent text-on-accent',
        /** Everything that is not the primary action. */
        secondary: 'border-control-border bg-surface text-ink',
        /** Navigation and low-emphasis actions: no edge, only the hover veil. */
        ghost: 'border-transparent bg-transparent text-ink-2',
        /** The action that starts a destructive flow, and its confirm. Filled ink, never red. */
        destructive: 'border-ink bg-ink text-surface',
        /** An action inside a sentence ("Export it first"): accent-ink text, underlined on hover. */
        link: 'border-transparent bg-transparent font-[650] text-accent-ink underline-offset-2 before:hidden hover:underline',
      },
      size: {
        sm: `${HIT_AREA} min-h-9 px-3 text-[0.84375rem] after:-inset-y-1.5`,
        md: MD,
        lg: 'min-h-[52px] px-6 text-base',
        block: 'min-h-[52px] w-full px-4 text-base',
        icon: 'px-0',
        /** A 32 px icon button in a dense row; its ::after grows the hit area to 48 px. */
        'icon-sm':
          "relative size-8 min-h-8 min-w-8 px-0 after:absolute after:-inset-2 after:content-['']",
        /** In a line of text (with `link`): no box of its own; its ::after grows the hit area. */
        inline: `${HIT_AREA} min-h-0 min-w-0 border-0 px-0 align-baseline after:-inset-y-3.5`,
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Disables the button and shows `busyLabel` (or the children) while work is in flight. */
    busy?: boolean;
    busyLabel?: string;
  };

/** A native button in one of five variants. `type` defaults to "button", never "submit". */
export function Button({
  className,
  variant,
  size,
  type = 'button',
  busy = false,
  busyLabel,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
