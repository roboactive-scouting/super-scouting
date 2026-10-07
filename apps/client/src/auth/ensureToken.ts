import { exchangePendingCredential } from './reconnect';
import { session } from './session';
import { recordTokenLoss } from './tokenLoss';

export type EnsureTokenTrigger = {
  /** The route that needed the token, for the diagnostic. */
  path?: string;
  /**
   * True only when OUR server (its own error shape) has just answered this tokenless
   * request with 401. That answer is the one proof the device really reaches the server:
   * `navigator.onLine` is also true on venue Wi-Fi with no internet.
   */
  serverAnswered401?: boolean;
};

/**
 * UF.2: an offline sign-in must not fail authenticated calls one by one on a device that
 * reaches the server. Called by rpc.ts and api.ts before a request that has no token, and
 * again when our server answers such a request 401. Resolves to the token to send, or null.
 *
 * - A session that holds a token: that token. No session, or an expired one: null.
 * - An offline sign-in on a device that says it is OFFLINE: null, and no request — an
 *   offline session stays fully usable offline (SPEC-FINAL 7.5).
 * - An offline sign-in on an online device: the reconnect exchange, when a password is
 *   held in memory. A token comes back, or null. Only when our server has answered 401
 *   AND no token can be had (no password held, or the server refused it) is the session
 *   expired, so the standard "Sign in again" strip and sign-in path show. Anything short
 *   of that leaves the offline session alone; the shell's one-field prompt (task 1.16)
 *   asks for a missing password.
 *
 * Concurrent requests share one login: the exchange itself is single-flight. Each caller
 * keeps its own trigger, so a 401 never waits behind a pre-call check that may not expire;
 * the expiry happens once, as only the first `expireOffline` changes anything.
 */
export async function ensureToken({ path, serverAnswered401 }: EnsureTokenTrigger = {}): Promise<
  string | null
> {
  const current = await session.current();
  if (!current || current.token !== null) return current?.token ?? null;
  if (current.expired || !current.offline || !navigator.onLine) return null;
  const outcome = await exchangePendingCredential();
  if (outcome === 'exchanged' || outcome === 'not-needed') return session.token();
  if (outcome === 'unreachable' || !serverAnswered401) return null;
  if (await session.expireOffline(current.user.id)) await recordTokenLoss('401', path);
  return null;
}
