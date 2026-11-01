/**
 * The compact match label (Q12, P3, PO1 — SPEC-FINAL 6.4). Since task 1.50 the one copy lives in
 * `@frc/shared` (`format.ts`), so the server's entry search (`match_label`) and the device write
 * the same label; this module re-exports it, so every client import is unchanged.
 */
export { MATCH_TYPE_PREFIX, matchLabel } from '@frc/shared';
