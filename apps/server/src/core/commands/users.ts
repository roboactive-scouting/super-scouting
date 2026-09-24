import {
  AppError,
  assertCan,
  changeOwnPasswordInput,
  createUserInput,
  disableUserInput,
  isUser,
  resetPasswordInput,
  setUserRoleInput,
  type Caller,
  type ChangeOwnPasswordInput,
  type CreateUserInput,
  type DisableUserInput,
  type PublicUser,
  type ResetPasswordInput,
  type SetUserRoleInput,
} from '@frc/shared';
import type { z } from 'zod';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { makeRateLimiter } from '../../auth/rateLimit.js';
import type { StoredFullUser, StoredPublicUser, UseCaseContext } from '../context.js';

// The wire schemas live in packages/shared so the typed client validates with the same
// objects (SPEC-FINAL 16.1). Re-exported so callers here can import them from this module.
export {
  changeOwnPasswordInput,
  createUserInput,
  disableUserInput,
  publicUser,
  resetPasswordInput,
  setUserRoleInput,
  type ChangeOwnPasswordInput,
  type CreateUserInput,
  type DisableUserInput,
  type PublicUser,
  type ResetPasswordInput,
  type SetUserRoleInput,
} from '@frc/shared';

/**
 * Per user id, so a stolen token cannot be used to brute-force the account's current
 * password through changeOwnPassword. Module-level and exported with `reset()`, like
 * `loginLimiter`, so tests do not leak attempts into each other.
 */
export const changeOwnPasswordLimiter = makeRateLimiter({ limit: 10, windowMs: 5 * 60_000 });

/**
 * The one place a stored user becomes a returned user. It builds the result field by
 * field rather than by dropping `password_hash`, so a column added to `users` later does
 * not leak by default: SPEC-FINAL 18.5 and Appendix C say the hash leaves the server on
 * the syncPull path and nowhere else.
 */
export function toPublicUser(user: StoredPublicUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    must_change_password: user.must_change_password,
    disabled_at: user.disabled_at,
    created_at: user.created_at,
  };
}

/**
 * Validates here as well as at the RPC edge, because the CLI transport calls the use
 * cases directly. A failure is an AppError('invalid'), never a raw ZodError. Zod's
 * messages name the field and the rule, never the value, so no password is echoed.
 */
export function parseInput<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
      .join('; ');
    throw new AppError('invalid', message);
  }
  return parsed.data as z.output<S>;
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === '23505';
}

/**
 * Every write to `users` goes through here. The pre-check in createUser gives the
 * friendly answer; the unique index on lower(username) is the real guard against two
 * admins racing for one name, and its violation must read as `conflict`, not a 500.
 */
async function writeUser(
  username: string | null,
  write: () => Promise<StoredFullUser>,
): Promise<StoredFullUser> {
  try {
    return await write();
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError(
        'conflict',
        username ? `the username '${username}' is taken` : 'that username is taken',
      );
    }
    throw e;
  }
}

async function targetUser(ctx: UseCaseContext, id: string): Promise<StoredFullUser> {
  const user = await ctx.store.getFullUser(id);
  if (!user) throw new AppError('not-found', 'no such user', { user_id: id });
  return user;
}

/** A boring guard against locking every admin out of the install. */
async function assertNotLastEnabledAdmin(ctx: UseCaseContext, target: StoredFullUser) {
  if (target.role !== 'admin' || target.disabled_at !== null) return;
  if ((await ctx.store.countEnabledAdmins()) <= 1) {
    throw new AppError('invalid', 'this is the last enabled admin; make another admin first');
  }
}

/** SPEC-FINAL 7.3: only the admin creates users. No self-registration. */
export async function createUser(
  caller: Caller,
  input: CreateUserInput,
  ctx: UseCaseContext,
): Promise<PublicUser> {
  assertCan(caller, 'manage_users');
  const parsed = parseInput(createUserInput, input);
  if (await ctx.store.getUserByUsername(parsed.username)) {
    throw new AppError('conflict', `the username '${parsed.username}' is taken`);
  }
  const passwordHash = await hashPassword(parsed.password);
  const stored = await writeUser(parsed.username, () =>
    ctx.store.insertUser({
      id: crypto.randomUUID(),
      username: parsed.username,
      full_name: parsed.full_name,
      role: parsed.role,
      password_hash: passwordHash,
      must_change_password: false,
    }),
  );
  return toPublicUser(stored);
}

/** SPEC-FINAL 7.3: only the admin changes a role. The last enabled admin stays one. */
export async function setUserRole(
  caller: Caller,
  input: SetUserRoleInput,
  ctx: UseCaseContext,
): Promise<PublicUser> {
  assertCan(caller, 'manage_users');
  const parsed = parseInput(setUserRoleInput, input);
  const target = await targetUser(ctx, parsed.user_id);
  if (target.role === parsed.role) return toPublicUser(target);
  await assertNotLastEnabledAdmin(ctx, target);
  const stored = await writeUser(null, () =>
    ctx.store.updateUser(target.id, { role: parsed.role }),
  );
  return toPublicUser(stored);
}

/**
 * SPEC-FINAL 7.3: only the admin resets a password; there is no self-service reset.
 * `must_change` forces a change at next login. Tokens already issued stay valid: only
 * disabling cuts access.
 */
export async function resetPassword(
  caller: Caller,
  input: ResetPasswordInput,
  ctx: UseCaseContext,
): Promise<PublicUser> {
  assertCan(caller, 'manage_users');
  const parsed = parseInput(resetPasswordInput, input);
  const target = await targetUser(ctx, parsed.user_id);
  const passwordHash = await hashPassword(parsed.password);
  const stored = await writeUser(null, () =>
    ctx.store.updateUser(target.id, {
      password_hash: passwordHash,
      must_change_password: parsed.must_change,
    }),
  );
  return toPublicUser(stored);
}

/**
 * SPEC-FINAL 3.2: "delete a user" means this. It sets `disabled_at` and nothing else; the
 * row, and every entry's authorship, is kept forever. There is no code path that deletes a
 * `users` row. Takes effect on the user's next request, because callerFor re-reads it.
 * Disabling an already-disabled user keeps the original timestamp.
 */
export async function disableUser(
  caller: Caller,
  input: DisableUserInput,
  ctx: UseCaseContext,
): Promise<PublicUser> {
  assertCan(caller, 'manage_users');
  const parsed = parseInput(disableUserInput, input);
  const target = await targetUser(ctx, parsed.user_id);
  if (target.disabled_at !== null) return toPublicUser(target);
  await assertNotLastEnabledAdmin(ctx, target);
  const stored = await writeUser(null, () =>
    ctx.store.updateUser(target.id, { disabled_at: ctx.now().toISOString() }),
  );
  return toPublicUser(stored);
}

/**
 * Any authenticated user, own account only (Appendix C): it acts on `caller.userId` and
 * its input cannot name anyone else. It needs the current password, so a borrowed or
 * stolen token alone cannot take the account over, and it is rate-limited per user so
 * that token cannot guess the current password either. Clears `must_change_password`.
 */
export async function changeOwnPassword(
  caller: Caller,
  input: ChangeOwnPasswordInput,
  ctx: UseCaseContext,
): Promise<PublicUser> {
  if (!isUser(caller)) {
    throw new AppError('forbidden', 'a service caller has no password to change');
  }
  const parsed = parseInput(changeOwnPasswordInput, input);
  if (!changeOwnPasswordLimiter.take(caller.userId)) {
    throw new AppError('rate-limited', 'too many attempts; wait a few minutes and try again');
  }
  const self = await ctx.store.getFullUser(caller.userId);
  if (!self) throw new AppError('unauthenticated', 'that session is no longer valid');
  if (self.disabled_at !== null) {
    throw new AppError('forbidden', 'this account has been disabled; ask an admin');
  }
  // `invalid` (400), never `unauthenticated`: to the client, 401 means exactly "your token
  // is dead, sign in again", and a mistyped current password must not end the session.
  if (!(await verifyPassword(parsed.current_password, self.password_hash))) {
    throw new AppError('invalid', 'the current password is not right');
  }
  const passwordHash = await hashPassword(parsed.new_password);
  const stored = await writeUser(null, () =>
    ctx.store.updateUser(self.id, { password_hash: passwordHash, must_change_password: false }),
  );
  return toPublicUser(stored);
}
