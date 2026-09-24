import { accountErrorLine } from '@/auth/messages';
import { RpcError } from '@/data/rpc';

export const NOT_ADMIN_TITLE = 'Only an admin can manage users';

/** A 403 from any admin call: another admin changed this account's role since sign-in. */
export const NOT_ADMIN_LINE =
  'Only an admin can manage users, and the server says this account is not one now.';

export const ADMIN_UNREACHABLE_LINE =
  'Could not reach the server. Managing users needs it — try again when this device is online.';

/**
 * True when the answer did not come from this app's server: no network, a deadline, a
 * captive portal or a proxy page (RpcError.answered, task 1.16). The admin page is
 * online-only, so this is the offline-needs-server state rather than a failure.
 */
export function unreachable(e: unknown): boolean {
  return e instanceof RpcError && !e.answered;
}

/**
 * One line for a person, never a code (SPEC-FINAL 17.8). `accountErrorLine` covers
 * 401/429/5xx and turns a 400/404/409 into the server's own sentence; the admin page
 * differs only in what "unreachable" and 403 mean here — a 403 is never "disabled"
 * (a disabled caller is refused with 401 and signed out).
 */
export function adminErrorLine(e: unknown): string {
  if (unreachable(e)) return ADMIN_UNREACHABLE_LINE;
  if (e instanceof RpcError && e.status === 403) return NOT_ADMIN_LINE;
  return accountErrorLine(e);
}
