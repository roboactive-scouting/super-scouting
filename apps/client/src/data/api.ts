import type { PullRequest, PullResponse, PushRequest, PushResponse } from '@frc/shared';
import { ensureToken } from '@/auth/ensureToken';
import { session } from '@/auth/session';
import { recordTokenLoss } from '@/auth/tokenLoss';
import type { ClientConfig } from '@/config';
import { deadline } from './deadline';

export type Api = {
  push(request: PushRequest): Promise<PushResponse>;
  pull(request: PullRequest): Promise<PullResponse>;
};

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** A sync request that hit its deadline: a plain Error to syncNow, but one the failure line can name. */
export class SyncTimeoutError extends Error {
  constructor() {
    super('the server did not answer in time');
    this.name = 'SyncTimeoutError';
  }
}

/** The three things the transport needs from the session; tests may inject their own. */
export type SessionPort = Pick<typeof session, 'token' | 'replaceToken' | 'expire'>;

/**
 * Phase 1C follow-up: a venue connection can die mid-request without ever failing the
 * fetch, which would hang the shell's sync queue on a push or pull that never answers.
 * 30s and the transport gives up.
 */
export const SYNC_REQUEST_TIMEOUT_MS = 30_000;

/**
 * The client for `/sync/push` and `/sync/pull`, which are not registry routes (rpc.ts
 * owns those). SPEC-FINAL 7.5: `Authorization: Bearer <token>` — never cookies, because
 * client and server are cross-origin — and any `X-Refreshed-Token` is stored.
 *
 * Both sync routes require the bearer, so a 401 here can only mean the token is dead:
 * the session is expired (user kept, token dropped) and the call still throws, so
 * `syncNow` stops and the outbox is untouched. A 403 is NOT a dead session — the token
 * is still good — and never signs anyone out.
 *
 * `timeoutMs` is injectable (default `SYNC_REQUEST_TIMEOUT_MS`) so a test need not wait
 * the full 30s. An expired deadline rejects with a plain `Error` — never an `ApiError` —
 * so `syncNow` cannot mistake it for a 401 or an event-gone 404; it falls through to its
 * generic `offline` outcome instead.
 */
export function apiClient(
  config: ClientConfig,
  auth: SessionPort = session,
  timeoutMs: number = SYNC_REQUEST_TIMEOUT_MS,
): Api {
  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const route = path.split('?')[0] ?? path;
    // UF.2: an offline sign-in on an online device gets a token first, as rpc.ts does.
    const bearer = (await auth.token()) ?? (await ensureToken({ path: route }));
    const limit = deadline(timeoutMs, () => new SyncTimeoutError());
    try {
      const res = await limit.race(
        fetch(`${config.apiBaseUrl}${path}`, {
          ...init,
          headers: {
            'content-type': 'application/json',
            ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
            ...init.headers,
          },
          ...(limit.signal ? { signal: limit.signal } : {}),
        }),
      );
      const refreshed = res.headers.get('x-refreshed-token');
      if (refreshed && bearer) await auth.replaceToken(refreshed, bearer);

      // A body that never finishes arriving is also bound by the same deadline.
      const body: unknown = await limit.race(res.json()).catch(() => ({}));
      if (!res.ok) {
        // A 401 to a request that carried no token says nothing about any token — but an
        // offline sign-in on an online device must not keep sending it (UF.2).
        const error = (body as { error?: { code?: string; message?: string } }).error;
        if (res.status === 401) {
          const answered = typeof error?.code === 'string'; // our server, not a portal
          if (!bearer) await ensureToken({ path: route, serverAnswered401: answered });
          else if (await auth.expire(bearer)) await recordTokenLoss('401', route);
        }
        throw new ApiError(error?.code ?? 'unknown', error?.message ?? res.statusText, res.status);
      }
      return body as T;
    } finally {
      limit.done();
    }
  }

  return {
    push: (r) => request<PushResponse>('/sync/push', { method: 'POST', body: JSON.stringify(r) }),
    pull: (r) => {
      const params = new URLSearchParams({ event_id: r.event_id });
      if (r.since) params.set('since', r.since);
      if (r.cursor) params.set('cursor', r.cursor);
      return request<PullResponse>(`/sync/pull?${params.toString()}`, { method: 'GET' });
    },
  };
}
