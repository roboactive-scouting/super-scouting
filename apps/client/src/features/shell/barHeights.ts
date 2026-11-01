/*
 * The shell's top bar heights (Phase 1 I side task 2: nothing pinned floats). ShellLayout
 * publishes the current one as `--top-bar`; the phone's TopBar and the computer's CrumbBar are
 * exactly that tall, and every sticky element under them sits on it (`top-[var(--top-bar,0px)]`), so
 * no copy of a bar's height lives anywhere else and a bar that changes height leaves no gap.
 */
export const TOP_BAR = {
  /** TopBar: a 54 px row under the safe-area inset. */
  phone: 'calc(3.375rem + env(safe-area-inset-top))',
  /** CrumbBar: 60 px. */
  desktop: '3.75rem',
} as const;
