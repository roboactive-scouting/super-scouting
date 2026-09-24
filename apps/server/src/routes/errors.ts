import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** The HTTP status for each AppError code, shared by the RPC routes and app.onError. */
export const STATUS: Record<string, ContentfulStatusCode> = {
  invalid: 400,
  unauthenticated: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  'rate-limited': 429,
  'parent-deleted': 409,
  'edit-window-expired': 409,
  'offline-unavailable': 503,
};

/** The body of every unexpected failure: nothing about the cause leaves the server. */
export const INTERNAL_ERROR = { error: { code: 'invalid', message: 'that did not work' } } as const;
