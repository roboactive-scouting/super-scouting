export const ERROR_CODES = [
  'invalid',
  'forbidden',
  'not-found',
  'conflict',
  'parent-deleted',
  'edit-window-expired',
  'unauthenticated',
  'offline-unavailable',
  'rate-limited',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}
