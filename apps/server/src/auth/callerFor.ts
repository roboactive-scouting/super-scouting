import type { Caller } from '@frc/shared';
import type { ServerConfig } from '../config.js';
import type { Store } from '../core/context.js';
import { issueToken, shouldRefresh, verifyToken, type SessionClaims } from './token.js';

export type CallerResult = { caller: Caller | null; refreshedToken: string | null };

/** The scheme is case-insensitive (RFC 9110 11.1); exactly one space before the token. */
const BEARER = /^bearer (\S+)$/i;

const NONE: CallerResult = { caller: null, refreshedToken: null };

/**
 * The HTTP transport builds the caller at its own edge (SPEC-FINAL 16.5). Nothing
 * downstream ever sees a request object. The ROLE COMES FROM THE DATABASE, not from
 * the token, so a role change takes effect immediately rather than in 30 days.
 *
 * A missing, malformed, badly signed or expired token, an unknown user and a disabled
 * user all return a null caller (a 401). A DATABASE ERROR IS NOT ONE OF THOSE: it
 * propagates, so the route answers 500 and the client keeps a token that is still good.
 */
export async function callerFor(
  request: Request,
  config: ServerConfig,
  store: Pick<Store, 'getUser'>,
  options: { now?: () => number } = {},
): Promise<CallerResult> {
  const raw = BEARER.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!raw) return NONE;

  let claims: SessionClaims;
  try {
    claims = await verifyToken(raw, config);
  } catch {
    return NONE;
  }

  const user = await store.getUser(claims.sub);
  if (!user || user.disabled_at !== null) return NONE;

  // StoredUser carries no username, so the re-issued token keeps the claims' username.
  // Nothing authorizes on it: identity is `sub`, and the role is re-read from the database.
  const refreshedToken = shouldRefresh(claims, config, options.now)
    ? await issueToken({ id: user.id, username: claims.username, role: user.role }, config)
    : null;

  return { caller: { kind: 'user', userId: user.id, role: user.role }, refreshedToken };
}
