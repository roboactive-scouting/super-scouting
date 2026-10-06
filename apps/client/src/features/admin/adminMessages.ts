import { accountErrorLine } from '@/auth/messages';
import { RpcError } from '@/data/rpc';

export const NOT_ADMIN_TITLE = 'Only an admin can manage users';

/** A 403 from any admin call: another admin changed this account's role since sign-in. */
export const NOT_ADMIN_LINE =
  'Only an admin can manage users, and the server says this account is not one now.';

/** The same 403 line, for the season/event management panels (task 1.20). */
export const NOT_ADMIN_EVENTS_LINE =
  'Only an admin can manage events, and the server says this account is not one now.';

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

/**
 * The error line for the season/event management panels (task 1.20; SPEC-FINAL 17.8).
 * Those panels take an injectable `rpc.call` so their tests can hand back a plain thrown
 * `Error` rather than a real `RpcError` (task-1.20-plan.md's own fixture does exactly
 * that), so — unlike `accountErrorLine` — this never assumes the `RpcError` shape and
 * never re-cases the message: a use case's refusal can name an exact path to commit
 * (SPEC-FINAL 6.4, 16.7), and `sentence()` capitalising it would misquote that path.
 */
export function panelErrorLine(e: unknown): string {
  if (unreachable(e)) return ADMIN_UNREACHABLE_LINE;
  if (e instanceof RpcError && e.status === 403) return NOT_ADMIN_EVENTS_LINE;
  if (e instanceof Error && e.message) return e.message;
  return 'That did not work. Check the fields and try again.';
}
