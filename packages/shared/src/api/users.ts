import { z } from 'zod';

/**
 * The wire schemas of the user-administration use cases (SPEC-FINAL 7.3, Appendix C).
 * They live here, not in apps/server, so the typed client validates with the identical
 * objects the server does (SPEC-FINAL 16.1). Browser-safe: zod only.
 */

/** SPEC-FINAL 7.5: minimum 8 characters, no composition rules, no expiry. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Any script's letters (Hebrew included), digits, `.`, `_` and `-`; 1 to 40 of them,
 * after trimming and lowercasing. It rejects `*` (PostgREST rewrites it to `%` in a
 * like/ilike pattern, so login could never match it literally), `%`, whitespace and
 * control characters.
 */
export const USERNAME_PATTERN = /^[\p{L}\p{N}._-]{1,40}$/u;

export const LIST_USERS_DEFAULT_LIMIT = 50;
/** A larger `limit` is clamped to this, not rejected: `next_cursor` says there is more. */
export const LIST_USERS_MAX_LIMIT = 200;

export const userRoleSchema = z.enum(['scouter', 'lead', 'admin']);

/** Trimmed and lowercased BEFORE the pattern runs, so 'Dana ' and 'dana' are one name. */
export const usernameSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(
    z
      .string()
      .regex(
        USERNAME_PATTERN,
        'use 1 to 40 letters, digits, dots, underscores or hyphens, with no spaces',
      ),
  );

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `use at least ${MIN_PASSWORD_LENGTH} characters`);

/** Not a uuid check: the in-memory store's fixture ids are not uuids. */
const userId = z.string().min(1);

/**
 * A user as it leaves the server. SPEC-FINAL 18.5: the full name is the only personal
 * datum. A plain (non-strict) object, so parsing a stored row STRIPS `password_hash`:
 * the RPC layer parses every output with it, which is the last line of defence.
 */
export const publicUser = z.object({
  id: z.string(),
  username: z.string(),
  full_name: z.string(),
  role: userRoleSchema,
  must_change_password: z.boolean(),
  disabled_at: z.string().nullable(),
  created_at: z.string(),
});
export type PublicUser = z.infer<typeof publicUser>;

export const createUserInput = z.object({
  username: usernameSchema,
  full_name: z.string().trim().min(1).max(80),
  role: userRoleSchema,
  password: passwordSchema,
});
export type CreateUserInput = z.input<typeof createUserInput>;

export const setUserRoleInput = z.object({ user_id: userId, role: userRoleSchema });
export type SetUserRoleInput = z.input<typeof setUserRoleInput>;

export const resetPasswordInput = z.object({
  user_id: userId,
  password: passwordSchema,
  /** Forces a change at next login (SPEC-FINAL 7.3). */
  must_change: z.boolean().default(false),
});
export type ResetPasswordInput = z.input<typeof resetPasswordInput>;

export const disableUserInput = z.object({ user_id: userId });
export type DisableUserInput = z.input<typeof disableUserInput>;

/**
 * Strict, so a `user_id` is REJECTED rather than silently dropped: this use case only
 * ever acts on the caller's own account, and a client that thinks otherwise should hear so.
 */
export const changeOwnPasswordInput = z
  .object({
    current_password: z.string().min(1),
    new_password: passwordSchema,
  })
  .strict();
export type ChangeOwnPasswordInput = z.input<typeof changeOwnPasswordInput>;

export const listUsersInput = z.object({
  include_disabled: z.boolean().default(false),
  limit: z.number().int().min(1).optional(),
  cursor: z.string().min(1).optional(),
});
export type ListUsersInput = z.input<typeof listUsersInput>;

export const listUsersOutput = z.object({
  items: z.array(publicUser),
  next_cursor: z.string().nullable(),
});
export type ListUsersOutput = z.infer<typeof listUsersOutput>;
