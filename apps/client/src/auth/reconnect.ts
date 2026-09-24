import { isDefinitive, loginOnline, offlineLogin } from './offlineLogin';
import { pendingCredential } from './pendingCredential';
import { onSessionExpired, session } from './session';

/**
 * What one attempt to turn an offline session into a real one came to.
 * - `exchanged` — the device now holds a token.
 * - `not-needed` — the session already holds a token (or changed hands meanwhile).
 * - `no-credential` — no password in memory: the app was closed since the offline
 *   sign-in, so the person has to type it once (the prompt).
 * - `unreachable` — no definitive answer (no connection, deadline, 5xx, portal, 429);
 *   the password stays in memory for the next attempt.
 * - `refused` — a definitive 401 or 400: the password was changed since. Forgotten.
 * - `disabled` — a definitive 403. Forgotten.
 */
export type ExchangeOutcome =
  'exchanged' | 'not-needed' | 'no-credential' | 'unreachable' | 'refused' | 'disabled';

let inFlight: Promise<ExchangeOutcome> | null = null;

/**
 * SPEC-FINAL 7.5: "used to obtain a real token on the first successful reconnect".
 * Single-flight: the `online` event, the sync tick and a session expiry can all fire
 * together, and they share one login request.
 */
export function exchangePendingCredential(): Promise<ExchangeOutcome> {
  inFlight ??= exchange().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function exchange(): Promise<ExchangeOutcome> {
  const before = await session.current();
  if (!before || before.token !== null) return 'not-needed';
  const credential = pendingCredential.get();
  if (!credential) return 'no-credential';
  if (credential.username !== before.user.username.toLowerCase()) {
    // Never another user's password for this session.
    pendingCredential.clear();
    return 'no-credential';
  }

  try {
    const { token, user } = await loginOnline(credential.username, credential.password);
    const now = await session.current();
    // A switch or a sign-in happened while the request was in flight: that session wins.
    if (!now || now.token !== null || now.user.id !== user.id) return 'not-needed';
    await session.signIn(user, token);
    if (pendingCredential.get() === credential) pendingCredential.clear();
    return 'exchanged';
  } catch (err) {
    if (!isDefinitive(err)) return 'unreachable';
    const status = (err as { status: number }).status;
    if (status === 429) return 'unreachable';
    if (pendingCredential.get() === credential) pendingCredential.clear();
    return status === 403 ? 'disabled' : 'refused';
  }
}

/**
 * The prompt for the password (the app was closed since the offline sign-in) is shown
 * once per app session. A refused password shows it again regardless — that is a new
 * reason, not a repeat.
 */
let prompted = false;
export const reconnectPrompt = {
  claim(): boolean {
    if (prompted) return false;
    prompted = true;
    return true;
  },
  reset(): void {
    prompted = false;
  },
};

/**
 * The prompt's submit: the SIGNED-IN user's username with the typed password. The server
 * first; a definitive answer is thrown as it came. With no definitive answer the password
 * is checked against the cached hash and, if it matches, held in memory for the next
 * reconnect (`held`) — a wrong one throws OfflineLoginError.
 */
export async function signInAgain(password: string): Promise<'exchanged' | 'held'> {
  const current = await session.current();
  if (!current) throw new Error('no one is signed in');
  const username = current.user.username;
  try {
    const { token, user } = await loginOnline(username, password);
    await session.signIn(user, token);
    pendingCredential.clear();
    return 'exchanged';
  } catch (err) {
    if (isDefinitive(err)) throw err;
    await offlineLogin(username, password);
    return 'held';
  }
}

/**
 * Registers the exchange on the task 1.15 seam: a session expiry with a password still
 * in memory mints a fresh token without asking anyone. Returns the unregister function.
 */
export function installReconnect(): () => void {
  return onSessionExpired(() => {
    if (pendingCredential.get()) void exchangePendingCredential();
  });
}
