import type { Role } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { call, RpcError } from '@/data/rpc';
import { DISABLED, loginErrorLine, MISMATCH, SERVER_UNREACHABLE_LINE } from './messages';
import { pendingCredential } from './pendingCredential';
import { session, type SessionUser } from './session';
import { recordTokenLoss } from './tokenLoss';

/**
 * A dying venue connection hangs rather than fails. After this long the login request is
 * abandoned and the device signs in against its cached hashes instead.
 */
export const LOGIN_TIMEOUT_MS = 8_000;

/**
 * UF.2: a device that says it is online gets one more try, this long, before the cached
 * hash. A cold-start server plus bcrypt can outlast the first deadline, and falling back
 * then left an online device signed in with no token. 8 + 12 s keeps a dead venue
 * connection (which `navigator.onLine` still calls online) under 20 s.
 */
export const LOGIN_RETRY_TIMEOUT_MS = 12_000;

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

/**
 * An online device, no answer from the server, and nothing cached to fall back on
 * (task 1.17b). "Connect to the internet" would send the user hunting for Wi-Fi that will
 * not help: the device is online, and the address or the server is what is wrong.
 */
export class ServerUnreachableError extends Error {
  constructor() {
    super(SERVER_UNREACHABLE_LINE);
    this.name = 'ServerUnreachableError';
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

export type LoginOptions = { timeoutMs?: number; retryTimeoutMs?: number };

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
 * is final and is thrown as it came. On a device that says it is online, the server gets
 * one more try with a longer deadline first (UF.2); offline, the cached hash at once.
 */
export async function signInWithFallback(
  username: string,
  password: string,
  options: LoginOptions & { offline?: OfflineSignIn } = {},
): Promise<SignInResult> {
  const online = async (timeoutMs: number | undefined): Promise<SignInResult> => {
    const { token, user } = await loginOnline(username, password, { timeoutMs });
    await session.signIn(user, token);
    pendingCredential.clear(); // a token is held: nothing is left to exchange
    return { user, offline: false };
  };
  try {
    return await online(options.timeoutMs);
  } catch (first) {
    if (isDefinitive(first)) throw first;
    let last = first;
    if (navigator.onLine) {
      try {
        return await online(options.retryTimeoutMs ?? LOGIN_RETRY_TIMEOUT_MS);
      } catch (second) {
        if (isDefinitive(second)) throw second;
        last = second;
      }
    }
    const err = last; // the latest non-definitive failure decides the line below
    try {
      const user = await (options.offline ?? offlineLogin)(username, password);
      if (navigator.onLine) await recordTokenLoss('offline-fallback', 'login');
      return { user, offline: true };
    } catch (offlineErr) {
      if (offlineErr instanceof OfflineLoginError && offlineErr.reason === 'no-accounts') {
        // Our own server answered with a 5xx and there is nothing cached to fall back on:
        // "the server is having trouble" is the truer line than "connect to the internet".
        const answered = err instanceof RpcError && err.answered;
        if (answered && err.status >= 500) throw err;
        // No answer at all, on a device that says it is online (task 1.17b): the address
        // or the server is wrong, not the connection. Offline keeps the old line.
        if (!answered && navigator.onLine) throw new ServerUnreachableError();
      }
      throw offlineErr;
    }
  }
}

/** The one line for a failed sign-in, online or offline. Never a code, never the input. */
export function signInErrorLine(e: unknown): string {
  if (e instanceof OfflineLoginError || e instanceof ServerUnreachableError) return e.message;
  return loginErrorLine(e);
}
