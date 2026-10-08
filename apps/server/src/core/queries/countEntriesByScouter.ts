import {
  countEntriesByScouterInput,
  type Caller,
  type CountEntriesByScouterInput,
  type CountEntriesByScouterOutput,
} from '@frc/shared';
import { parseInput } from '../commands/users.js';
import type { UseCaseContext } from '../context.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  countEntriesByScouterInput,
  countEntriesByScouterOutput,
  type CountEntriesByScouterInput,
  type CountEntriesByScouterOutput,
} from '@frc/shared';

/**
 * Live entries per scouter across every event of one season, most first (RB.13). A QUERY:
 * any authenticated caller, a `service` caller included, may read it, so it does NOT gate
 * on `can(caller, 'view_all_data')`. Soft-deleted entries never count. It feeds the Users
 * page, which needs season-wide numbers because a device holds only the active event.
 */
export async function countEntriesByScouter(
  caller: Caller,
  input: CountEntriesByScouterInput,
  ctx: UseCaseContext,
): Promise<CountEntriesByScouterOutput> {
  void caller; // every role, and a service caller, may read the counts
  const { season_id } = parseInput(countEntriesByScouterInput, input);
  const rows = await ctx.store.countEntriesByScouterForSeason(season_id);
  return { items: [...rows].sort((a, b) => b.count - a.count) };
}
