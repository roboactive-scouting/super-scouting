/*
 * Class strings for the buttons added from task 1.17 on. Existing screens keep their own.
 *
 * SPEC-FINAL 17.7 asks 3:1 of a UI boundary. A `--brand-plate` fill on `--surface` has no
 * boundary to speak of (about 1.1:1), so these buttons carry a 1 px `--border` edge:
 * 3.67:1 on `--surface` and 4.09:1 on `--bg` in the dark theme, 7.03:1 and 7.73:1 in the
 * outdoor theme. The destructive button is an outline in `--danger`: 4.71:1 on `--surface`
 * (dark) and 5.89:1 (outdoor); its label stays `--text`.
 */

const BASE =
  'tap-target inline-flex items-center justify-center gap-2 rounded-lg px-4 disabled:opacity-50';

/** The one primary action: the brand plate with the yellow label (SPEC-FINAL 17.4). */
export const PRIMARY_BUTTON = `${BASE} border border-[var(--border)] bg-[var(--brand-plate)] font-semibold text-[var(--brand)]`;

/** Everything that is not the primary action. */
export const SECONDARY_BUTTON = `${BASE} border border-[var(--border)] font-medium text-[var(--text)]`;

/** A destructive verb (SPEC-FINAL 17.8). Outline only: no fill clears 4.5:1 in both themes. */
export const DESTRUCTIVE_BUTTON = `${BASE} border-2 border-[var(--danger)] font-semibold text-[var(--text)]`;

/** A text input or select at the 48 px floor, as on the sign-in screens. */
export const FIELD =
  'tap-target w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3';
