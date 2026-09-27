import { formatCount, type MatchType } from '@frc/shared';

/**
 * The compact match label prefix (Q12, P3, PO1 — SPEC-FINAL 6.4), shared between the entry
 * flow (`EntryRoute.tsx`) and the admin match editor (`MatchesPanel.tsx`, task 1.21). Moved
 * here from `EntryRoute.tsx`, which kept its own copy through task 1.19; the behaviour is
 * unchanged, only the location.
 */
export const MATCH_TYPE_PREFIX: Record<MatchType, string> = {
  qualification: 'Q',
  practice: 'P',
  playoff: 'PO',
};

/**
 * `match_type` is typed loosely (`string`) so this also accepts the entry flow's own local
 * `MatchRow` (cached rows read back as plain JSON, not the shared zod type).
 */
export function matchLabel(match: { match_type: string; number: number }): string {
  const prefix = MATCH_TYPE_PREFIX[match.match_type as MatchType] ?? match.match_type;
  return `${prefix}${formatCount(match.number)}`;
}
