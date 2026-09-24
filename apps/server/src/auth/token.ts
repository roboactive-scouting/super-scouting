import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import type { ServerConfig } from '../config.js';

const sessionClaims = z.object({
  sub: z.string().min(1),
  role: z.enum(['scouter', 'lead', 'admin']),
  username: z.string().min(1),
  iat: z.number().int(),
  exp: z.number().int(),
});

export type SessionClaims = z.infer<typeof sessionClaims>;

const key = (config: ServerConfig): Uint8Array => new TextEncoder().encode(config.authJwtSecret);

/** SPEC-FINAL 7.5: HS256, signed with AUTH_JWT_SECRET, claims sub/role/username/iat/exp. */
export async function issueToken(
  user: { id: string; username: string; role: SessionClaims['role'] },
  config: ServerConfig,
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: user.role, username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt(iat)
    .setExpirationTime(iat + config.tokenTtlDays * 86400)
    .sign(key(config));
}

/**
 * Rejects a bad signature, any algorithm but HS256 (including `alg: none`), an expired
 * token, an `iat` in the future or older than the TTL, and a validly signed token that is
 * missing any of the five session claims or carries one of the wrong type. Unknown extra
 * claims are not an error: they are stripped, and only the five session claims are
 * returned. The thrown error never carries the token.
 *
 * `maxTokenAge` is what makes jose check `iat` at all: without it a future `iat` passes,
 * and lowering AUTH_TOKEN_TTL_DAYS would not shorten tokens already issued (their `exp`
 * was fixed at signing). With it, a token is refused once it is older than the CURRENT
 * TTL, whatever its `exp` says.
 */
export async function verifyToken(raw: string, config: ServerConfig): Promise<SessionClaims> {
  const { payload } = await jwtVerify(raw, key(config), {
    algorithms: ['HS256'],
    maxTokenAge: config.tokenTtlDays * 86400,
  });
  const parsed = sessionClaims.safeParse(payload);
  if (!parsed.success) throw new Error('session token claims are malformed');
  return parsed.data;
}

/**
 * Sliding sessions: re-issue a token more than seven days old (SPEC-FINAL 7.5).
 * `now` is in milliseconds, so a caller holding an injected clock can pass it through.
 */
export function shouldRefresh(
  claims: SessionClaims,
  config: ServerConfig,
  now: () => number = Date.now,
): boolean {
  const ageDays = (now() / 1000 - claims.iat) / 86400;
  return ageDays > config.tokenRefreshAfterDays;
}
