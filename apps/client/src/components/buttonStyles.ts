/*
 * The class strings every screen built before the redesign imports. They now come from the
 * design-system primitives (components/ui), so those screens take the new look without
 * touching their JSX. New code uses <Button> or buttonVariants() directly. The contrast
 * figures behind each variant are in components/ui/button.tsx.
 */
import { buttonVariants } from './ui/button';
import { inputClass } from './ui/input';

/** The one primary action: the brand plate with the yellow label (SPEC-FINAL 17.4). */
export const PRIMARY_BUTTON = buttonVariants({ variant: 'primary' });

/** Everything that is not the primary action. */
export const SECONDARY_BUTTON = buttonVariants({ variant: 'secondary' });

/** A destructive verb (SPEC-FINAL 17.8). Outline only: no fill clears 4.5:1 in both themes. */
export const DESTRUCTIVE_BUTTON = buttonVariants({ variant: 'destructive' });

/** A text input or select at the 48 px floor. */
export const FIELD = inputClass;
