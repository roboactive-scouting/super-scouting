import type { Role } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { call, RpcError } from '@/data/rpc';
import { DISABLED, loginErrorLine, MISMATCH } from './messages';
import { pendingCredential } from './pendingCredential';
import { session, type SessionUser } from './session';

/**
 * A dying venue connection hangs rather than fails. After this long the login request is
 * abandoned and the device signs in against its cached hashes instead.
 */
export const LOGIN_TIMEOUT_MS = 8_000;

export const NO_CACHED_ACCOUNTS_LINE =
  "This device has not loaded the team's accounts yet. Connect to the internet once to sign in.";

/** The `users` row as the pull caches it (SPEC-FINAL 7.5: every user, hash included). */
export type CachedUser = {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  password_hash?: string;
  disabled_at?: string | null;
  must_change_password?: boolean;
};

type OfflineRefusal = 'no-accounts' | 'mismatch' | 'disabled';

/** An offline sign-in refused. `message` is the one line to show; it never holds input. */
export class OfflineLoginError extends Error {
  constructor(readonly reason: OfflineRefusal) {
    super(
      reason === 'no-accounts'
        ? NO_CACHED_ACCOUNTS_LINE
        : reason === 'disabled'
          ? DISABLED
          : MISMATCH,
    );
    this.name = 'OfflineLoginError';
  }
}

/** Every cached user who may sign in on this device, by name. */
export async function cachedSignInUsers(): Promise<CachedUser[]> {
  const users = await cachedRows<CachedUser>('users');
  return users
    .filter((u) => u.disabled_at == null)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/**
 * SPEC-FINAL 7.5: verifies the password against the cached bcrypt hash ON THE DEVICE and
 * records the active user locally, minting no token. The password is then held in memory
 * only (`pendingCredential`) to obtain a real token on the first successful reconnect.
 *
 * bcryptjs is loaded here, on the offline path only, and the async `compare` is used: a
 * cost-10 compareSync blocks a low-end phone's main thread for up to a second.
 */
export async function offlineLogin(username: string, password: string): Promise<SessionUser> {
  const wanted = username.trim().toLowerCase();
  const users = await cachedRows<CachedUser>('users');
  if (users.length === 0) throw new OfflineLoginError('no-accounts');
  const user = users.find((u) => u.username.toLowerCase() === wanted);
  // An unknown username and a wrong password are refused with the same line.
  if (!user || typeof user.password_hash !== 'string') throw new OfflineLoginError('mismatch');

  const { default: bcrypt } = await import('bcryptjs');
  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) throw new OfflineLoginError('mismatch');
  // Checked after the password, so a disabled account is only named to its owner.
  if (user.disabled_at != null) throw new OfflineLoginError('disabled');

  const signedIn: SessionUser = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    // Entering match data beats a password change at a venue: an offline session is never
    // sent to the change screen. The reconnect exchange's login response brings the real
    // value, and the task 1.15 redirect applies from then on.
    must_change_password: false,
  };
  await session.signIn(signedIn, null, true);
  pendingCredential.set({ username: wanted, password });
  return signedIn;
}

/**
 * Is this login failure our server's final word? Only an answer in our own error shape
 * with 400, 401, 403 or 429 is. Falling back on a 401 would let a password an admin has
 * just reset still open the device against the stale cached hash.
 */
export function isDefinitive(e: unknown): boolean {
  return e instanceof RpcError && e.answered && [400, 401, 403, 429].includes(e.status);
}

export type LoginOptions = { timeoutMs?: number };

/** `POST /api/login` with the login deadline. Throws RpcError. */
export async function loginOnline(
  username: string,
  password: string,
  options: LoginOptions = {},
): Promise<{ token: string; user: SessionUser }> {
  return call(
    'login',
    { username: username.trim(), password },
    { timeoutMs: options.timeoutMs ?? LOGIN_TIMEOUT_MS },
  );
}

export type OfflineSignIn = (username: string, password: string) => Promise<SessionUser>;

export type SignInResult = { user: SessionUser; offline: boolean };

/**
 * The sign-in used by the login screen and switch scouter. The server first; on any
 * outcome that is not its definitive answer — no connection, the deadline, a 5xx, a
 * response that is not ours (a captive portal) — the cached hash. A definitive answer
 * is final and is thrown as it came.
 */
export async function signInWithFallback(
  username: string,
  password: string,
  options: LoginOptions & { offline?: OfflineSignIn } = {},
): Promise<SignInResult> {
  try {
    const { token, user } = await loginOnline(username, password, options);
    await session.signIn(user, token);
    pendingCredential.clear(); // a token is held: nothing is left to exchange
    return { user, offline: false };
  } catch (err) {
    if (isDefinitive(err)) throw err;
    try {
      const user = await (options.offline ?? offlineLogin)(username, password);
      return { user, offline: true };
    } catch (offlineErr) {
      // Our own server answered with a 5xx and there is nothing cached to fall back on:
      // "the server is having trouble" is the truer line than "connect to the internet".
      const serverTrouble = err instanceof RpcError && err.answered && err.status >= 500;
      if (serverTrouble && offlineErr instanceof OfflineLoginError) {
        if (offlineErr.reason === 'no-accounts') throw err;
      }
      throw offlineErr;
    }
  }
}

/** The one line for a failed sign-in, online or offline. Never a code, never the input. */
export function signInErrorLine(e: unknown): string {
  if (e instanceof OfflineLoginError) return e.message;
  return loginErrorLine(e);
}
