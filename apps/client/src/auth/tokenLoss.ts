import { getMeta, setMeta } from '@/data/db';

/**
 * UF.2 diagnostics: why this device last ended up without a working token. No UI reads it;
 * it is for the next bug report (read it from IndexedDB `meta`).
 * - `offline-fallback` — a sign-in fell back to the cached hash on a device that said it
 *   was online (the server did not answer in time, twice).
 * - `401` — the server refused the session on `path`.
 * - `reconnect-failed` — an offline session on an online device could not get a token
 *   (no password in memory, or the server refused it), so it was expired.
 */
export type TokenLossReason = 'offline-fallback' | '401' | 'reconnect-failed';

export type TokenLoss = { at: string; reason: TokenLossReason; path?: string };

export const TOKEN_LOSS_KEY = 'auth.last_token_loss';

/** Never throws: a diagnostic that cannot be stored must not fail the call that lost the token. */
export async function recordTokenLoss(reason: TokenLossReason, path?: string): Promise<void> {
  const loss: TokenLoss = { at: new Date().toISOString(), reason, ...(path ? { path } : {}) };
  try {
    await setMeta(TOKEN_LOSS_KEY, loss);
  } catch {
    // IndexedDB unavailable: the session itself is already handled.
  }
}

export function lastTokenLoss(): Promise<TokenLoss | null> {
  return getMeta<TokenLoss | null>(TOKEN_LOSS_KEY, null);
}
