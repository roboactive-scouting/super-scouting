import { AppError, type LoginOutput, type RefreshTokenInput } from '@frc/shared';
import type { ServerConfig } from '../../config.js';
import { issueToken, verifyToken, type SessionClaims } from '../../auth/token.js';
import type { UseCaseContext } from '../context.js';
import { loginLimiter } from './login.js';

// The wire schema lives in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export { refreshTokenInput, type RefreshTokenInput } from '@frc/shared';

/**
 * The explicit counterpart to the automatic X-Refreshed-Token header, for a client that
 * has been closed for weeks. Like `login` it takes NO caller — it produces one — and
 * SPEC-FINAL 16.5 requires BOTH unauthenticated routes to be rate-limited by username.
 *
 * The user is looked up by `claims.sub`, NEVER by `claims.username`: keyed by username,
 * a token issued before an admin renamed someone would refresh as whoever holds that
 * username now.
 */
export async function refreshToken(
  input: RefreshTokenInput,
  ctx: UseCaseContext,
  config: ServerConfig,
): Promise<LoginOutput> {
  let claims: SessionClaims;
  try {
    claims = await verifyToken(input.token, config);
  } catch {
    throw new AppError('unauthenticated', 'that session has expired; sign in again');
  }

  // After the verify, so only a validly signed token can spend a user's bucket.
  if (!loginLimiter.take(claims.username.toLowerCase())) {
    throw new AppError('rate-limited', 'too many attempts; wait a few minutes and try again');
  }

  const user = await ctx.store.getFullUser(claims.sub);
  if (!user) throw new AppError('unauthenticated', 'that session is no longer valid');
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
