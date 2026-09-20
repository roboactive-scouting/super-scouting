import type { PullRequest, PullResponse, PushRequest, PushResponse } from '@frc/shared';
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

export type TokenSource = () => Promise<string | null>;

export function apiClient(config: ClientConfig, token: TokenSource = async () => null): Api {
  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const bearer = await token();
    const res = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...init.headers,
      },
    });
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
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
