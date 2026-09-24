import { AppError } from '@frc/shared';
import { z } from 'zod';
import type { ServerConfig } from '../../config.js';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../../auth/password.js';
import { makeRateLimiter } from '../../auth/rateLimit.js';
import { issueToken } from '../../auth/token.js';
import type { UseCaseContext } from '../context.js';

export const loginInput = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInput>;

export const loginOutput = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().uuid(),
    username: z.string(),
    full_name: z.string(),
    role: z.enum(['scouter', 'lead', 'admin']),
    must_change_password: z.boolean(),
  }),
});

export type LoginOutput = z.infer<typeof loginOutput>;

/**
 * Module-level, so it survives between requests on a warm function instance — and
 * EXPORTED, so a test can reset it. A module singleton with no reset makes the tests
 * in a single file interfere with each other, which is a real bug that shows up as a
 * mysteriously failing seventh case.
 */
export const loginLimiter = makeRateLimiter({ limit: 10, windowMs: 5 * 60_000 });

/**
 * SPEC-FINAL 16.5: login takes NO caller — it produces one. It lives in commands/ for
 * placement and is exempt from the caller contract and the service rejection. It is
 * one of exactly two unauthenticated routes, and it is rate-limited by username.
 */
export async function login(
  input: LoginInput,
  ctx: UseCaseContext,
  config: ServerConfig,
): Promise<LoginOutput> {
  const username = input.username.trim().toLowerCase();
  if (!loginLimiter.take(username)) {
    throw new AppError('rate-limited', 'too many attempts; wait a few minutes and try again');
  }

  const user = await ctx.store.getUserByUsername(username);
  // An unknown user still pays for one bcrypt comparison, against a hash nothing matches,
  // so neither the message nor the response time says which usernames exist.
  const matches = await verifyPassword(input.password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!user || !matches) {
    throw new AppError('unauthenticated', 'that username and password do not match');
  }
  if (user.disabled_at !== null) {
    throw new AppError('forbidden', 'this account has been disabled; ask an admin');
  }

  return {
    token: await issueToken({ id: user.id, username: user.username, role: user.role }, config),
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      must_change_password: user.must_change_password,
    },
  };
}
