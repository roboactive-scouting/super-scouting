import type { PullRequest, PullResponse, PushRequest, PushResponse } from '@frc/shared';
import { session } from '@/auth/session';
import type { ClientConfig } from '@/config';

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

/** The three things the transport needs from the session; tests may inject their own. */
export type SessionPort = Pick<typeof session, 'token' | 'replaceToken' | 'expire'>;

/**
 * The client for `/sync/push` and `/sync/pull`, which are not registry routes (rpc.ts
 * owns those). SPEC-FINAL 7.5: `Authorization: Bearer <token>` — never cookies, because
 * client and server are cross-origin — and any `X-Refreshed-Token` is stored.
 *
 * Both sync routes require the bearer, so a 401 here can only mean the token is dead:
 * the session is expired (user kept, token dropped) and the call still throws, so
 * `syncNow` stops and the outbox is untouched. A 403 is NOT a dead session — the token
 * is still good — and never signs anyone out.
 */
export function apiClient(config: ClientConfig, auth: SessionPort = session): Api {
  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const bearer = await auth.token();
    const res = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...init.headers,
      },
    });
    const refreshed = res.headers.get('x-refreshed-token');
    if (refreshed && bearer) await auth.replaceToken(refreshed, bearer);

    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      // A 401 to a request that carried no token says nothing about any token.
      if (res.status === 401 && bearer) await auth.expire(bearer);
      const error = (body as { error?: { code?: string; message?: string } }).error;
      throw new ApiError(error?.code ?? 'unknown', error?.message ?? res.statusText, res.status);
    }
    return body as T;
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
