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
 * token, and a validly signed token whose claims are not exactly the session shape.
 * Returns only the five session claims. The thrown error never carries the token.
 */
export async function verifyToken(raw: string, config: ServerConfig): Promise<SessionClaims> {
  const { payload } = await jwtVerify(raw, key(config), { algorithms: ['HS256'] });
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
