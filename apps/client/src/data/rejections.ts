import type { PushRejection } from './db';

/**
 * One line a student can read for a refused push (SPEC-FINAL 7.6, 17.8: never a raw
 * error code). The operation behind it is still queued and still retried.
 */
export function rejectionMessage(rejection: PushRejection): string {
  switch (rejection.code) {
    case 'edit-window-expired':
      return 'This entry is locked — ask a lead';
    case 'forbidden':
      return 'Not allowed for this account — ask a lead';
    default:
      return rejection.message.trim() || 'The server refused this change — ask a lead';
  }
}
