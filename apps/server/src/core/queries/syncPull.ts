import {
  AppError,
  PULL_ENTITY_KEYS,
  WATERMARK_OVERLAP_MS,
  type Caller,
  type PullEntityKey,
  type PullRequest,
  type PullResponse,
} from '@frc/shared';
import type { UseCaseContext } from '../context.js';

/** A page is bounded by rows, not by call (SPEC-FINAL 16.4). */
export const PULL_PAGE_ROWS = 2000;

type Cursor = { entityIndex: number; offset: number };

const encodeCursor = (c: Cursor): string => btoa(JSON.stringify(c));
const decodeCursor = (raw: string): Cursor => {
  try {
    const parsed = JSON.parse(atob(raw)) as Cursor;
    if (typeof parsed.entityIndex !== 'number' || typeof parsed.offset !== 'number') {
      throw new Error('bad cursor');
    }
    return parsed;
  } catch {
    throw new AppError('invalid', 'cursor is not readable; start the pull again without one');
  }
};

/**
 * The replication endpoint (SPEC-FINAL 9.3). It lives in queries/ but is the one
 * query use case that returns raw rows, because offline computation requires them.
 * It is bounded per page by next_cursor rather than per call, and it is not a
 * candidate for future MCP exposure.
 */
export async function syncPull(
  caller: Caller,
  input: PullRequest,
  ctx: UseCaseContext,
): Promise<PullResponse> {
  void caller; // every role, and a service caller, may replicate

  if (!(await ctx.store.eventExists(input.event_id))) {
    throw new AppError('not-found', 'that event no longer exists', { event_id: input.event_id });
  }
  const scope = await ctx.store.resolveScope(input.event_id);

  const start = input.cursor ? decodeCursor(input.cursor) : { entityIndex: 0, offset: 0 };
  const entities = Object.fromEntries(
    PULL_ENTITY_KEYS.map((key) => [key, [] as Record<string, unknown>[]]),
  ) as PullResponse['entities'];

  let budget = PULL_PAGE_ROWS;
  let newest = '';
  let nextCursor: string | null = null;

  for (let index = start.entityIndex; index < PULL_ENTITY_KEYS.length; index += 1) {
    const key = PULL_ENTITY_KEYS[index] as PullEntityKey;
    let offset = index === start.entityIndex ? start.offset : 0;

    for (;;) {
      if (budget === 0) {
        nextCursor = encodeCursor({ entityIndex: index, offset });
        break;
      }
      const rows = await ctx.store.pullEntity(key, scope, input.since, offset, budget);
      entities[key].push(...rows);
      for (const row of rows) {
        const updated = String(row.updated_at ?? '');
        if (updated > newest) newest = updated;
      }
      budget -= rows.length;
      offset += rows.length;
      if (rows.length < 1 || budget > 0) break;
    }
    if (nextCursor !== null) break;
  }

  const watermark =
    newest === ''
      ? (input.since ?? new Date(ctx.now().getTime() - WATERMARK_OVERLAP_MS).toISOString())
      : new Date(new Date(newest).getTime() - WATERMARK_OVERLAP_MS).toISOString();

  return { watermark, next_cursor: nextCursor, complete: nextCursor === null, entities };
}
