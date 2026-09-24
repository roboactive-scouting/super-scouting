import { SignJWT } from 'jose';
import type { ServerConfig } from '../config.js';

const DAY = 86400;

/**
 * Mints a session-shaped token with explicit times, for tests that need a token that is
 * expired or more than seven days old. `issueToken` always stamps the current time.
 */
export async function tokenAt(
  user: { id: string; username: string; role: 'scouter' | 'lead' | 'admin' },
  config: ServerConfig,
  times: { issuedDaysAgo: number; expiresInDays: number },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: user.role, username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt(now - times.issuedDaysAgo * DAY)
    .setExpirationTime(now + times.expiresInDays * DAY)
    .sign(new TextEncoder().encode(config.authJwtSecret));
}
