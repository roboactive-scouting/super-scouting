import {
  AppError,
  LIST_USERS_DEFAULT_LIMIT,
  LIST_USERS_MAX_LIMIT,
  listUsersInput,
  type Caller,
  type ListUsersInput,
  type ListUsersOutput,
} from '@frc/shared';
import { parseInput, toPublicUser } from '../commands/users.js';
import type { UseCaseContext } from '../context.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  listUsersInput,
  listUsersOutput,
  type ListUsersInput,
  type ListUsersOutput,
} from '@frc/shared';

type Cursor = { username: string; id: string };

// base64url of UTF-8 JSON, not btoa: btoa throws on a Hebrew username.
const encodeCursor = (c: Cursor): string =>
  Buffer.from(JSON.stringify({ u: c.username, i: c.id }), 'utf8').toString('base64url');

const decodeCursor = (raw: string): Cursor => {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      u?: unknown;
      i?: unknown;
    };
    if (typeof parsed.u !== 'string' || typeof parsed.i !== 'string') throw new Error('shape');
    return { username: parsed.u, id: parsed.i };
  } catch {
    throw new AppError('invalid', 'cursor is not readable; list again without one');
  }
};

/**
 * Users for the picker, the admin table and the offline cache (Appendix C). A QUERY:
 * every role and a `service` caller may call it, so it does NOT gate on
 * `can(caller, 'view_all_data')`, which a service caller never satisfies (see
 * permissions.ts). Bounded and keyset-paginated by username then id. Excludes disabled
 * users unless asked. Never returns `password_hash`: the store selects an explicit column
 * list without it, and toPublicUser builds each item field by field.
 *
 * `limit` defaults to 50; a request above 200 is CLAMPED to 200, not rejected.
 */
export async function listUsers(
  caller: Caller,
  input: ListUsersInput,
  ctx: UseCaseContext,
): Promise<ListUsersOutput> {
  void caller; // every role, and a service caller, may read the user list
  const parsed = parseInput(listUsersInput, input);
  const limit = Math.min(parsed.limit ?? LIST_USERS_DEFAULT_LIMIT, LIST_USERS_MAX_LIMIT);
  const after = parsed.cursor ? decodeCursor(parsed.cursor) : undefined;

  // One extra row says whether another page exists, so the last page never comes back empty.
  const rows = await ctx.store.listUsers({
    includeDisabled: parsed.include_disabled,
    limit: limit + 1,
    after,
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toPublicUser),
    next_cursor:
      rows.length > limit && last ? encodeCursor({ username: last.username, id: last.id }) : null,
  };
}
