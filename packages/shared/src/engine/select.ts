import { isDeadRobot } from '../forms/validate';
import { logicalKeyOf } from '../sync/conflict';
import type { EngineEntry } from './types';

/** An instant in ms; an unparseable stamp sorts before every real one, so the order stays total. */
function instant(stamp: string): number {
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/**
 * True when `a` is the canonical entry over `b`. Instants are compared, not strings (a server
 * row reads `…+00:00`, a client row `….000Z`; see `latestWins`). The order is total, so the
 * browser and the server pick the same entry whatever order their rows arrive in:
 * 1. the greater `client_updated_at` wins (SPEC-FINAL 11.6);
 * 2. on the same instant, the greater `client_created_at`;
 * 3. on that too, the greater `id` (plain string order).
 */
function outranks(a: EngineEntry, b: EngineEntry): boolean {
  const updated = instant(a.client_updated_at) - instant(b.client_updated_at);
  if (updated !== 0 && !Number.isNaN(updated)) return updated > 0;
  const created = instant(a.client_created_at) - instant(b.client_created_at);
  if (created !== 0 && !Number.isNaN(created)) return created > 0;
  return a.id > b.id;
}

/**
 * SPEC-FINAL 11.6: one canonical entry per (team, match, form kind) — per event for a super
 * entry, which has no match (`logicalKeyOf`, 9.5). When two devices produced two anyway, both
 * rows are kept and the engine reads only the one with the greatest client_updated_at, so
 * statistics never double-count. A soft-deleted entry never counts and never wins: the live
 * one of a pair is canonical whatever its stamp. Output order is first-seen key order.
 */
export function canonicalEntries(entries: readonly EngineEntry[]): EngineEntry[] {
  const best = new Map<string, EngineEntry>();
  for (const entry of entries) {
    if (entry.deleted_at !== null && entry.deleted_at !== undefined) continue;
    const key = logicalKeyOf(entry);
    const current = best.get(key);
    if (!current || outranks(entry, current)) best.set(key, entry);
  }
  return [...best.values()];
}

/**
 * The population every aggregate runs over. Order matters and is fixed:
 * duplicates resolve first, then qualification-only, then the robot-status rule.
 * A super entry has no match and no robot status, so it passes both filters.
 */
export function entriesForAggregates(entries: readonly EngineEntry[]): EngineEntry[] {
  return (
    canonicalEntries(entries)
      // Only qualification matches ever feed an aggregate. Not configurable (11.2).
      .filter((e) => e.form_kind !== 'match' || e.match_type === 'qualification')
      // no_show and disabled are excluded entirely, never counted as zero (11.3).
      .filter((e) => e.robot_status === null || !isDeadRobot(e.robot_status))
  );
}
