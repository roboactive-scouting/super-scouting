import { RpcError } from '@/data/rpc';

/** "the current password is not right" → "The current password is not right." */
export function sentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return trimmed;
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

export const OFFLINE_SIGN_IN_LINE =
  'No connection. Signing in will use the credentials cached on this device.';

const DISABLED = 'This account has been disabled. Ask an admin.';
const RATE_LIMITED = 'Too many attempts. Wait a few minutes and try again.';
const SERVER_TROUBLE = 'The server is having trouble. Try again in a minute.';

/**
 * The one error line on the sign-in screen. Never a raw code (SPEC-FINAL 17.8). On the
 * login route a 401 means wrong credentials, not an expired session.
 */
export function loginErrorLine(e: unknown): string {
  if (!(e instanceof RpcError)) return SERVER_TROUBLE;
  if (e.status === 0) return OFFLINE_SIGN_IN_LINE;
  if (e.status === 401) return 'That username and password do not match.';
  if (e.status === 403) return DISABLED;
  if (e.status === 429) return RATE_LIMITED;
  if (e.status >= 500) return SERVER_TROUBLE;
  return sentence(e.message) || 'That username and password do not match.';
}

/** The error line for an authenticated account action (change password). */
export function accountErrorLine(e: unknown): string {
  if (!(e instanceof RpcError)) return SERVER_TROUBLE;
  if (e.status === 0) {
    return 'No connection. Changing your password needs the server — try again when this device is online.';
  }
  if (e.status === 401) return 'Your sign-in expired. Sign in again.';
  if (e.status === 403) return DISABLED;
  if (e.status === 429) return RATE_LIMITED;
  if (e.status >= 500) return SERVER_TROUBLE;
  return sentence(e.message) || 'That did not work. Check the fields and try again.';
}
