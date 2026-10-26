import type { PushRejection } from './db';

/**
 * One line a student can read for a refused push (SPEC-FINAL 7.6, 17.8: never a raw
 * error code). The operation behind it is still queued and still retried.
 */
export function rejectionMessage(rejection: PushRejection): string {
  switch (rejection.code) {
    // SPEC-FINAL 7.6 (v1.44): what happened, and who can fix it. The client's own words,
    // not the server's, so a record refused before the rewording reads the same line.
    case 'edit-window-expired':
      return 'Changed after the 5-minute edit window. A lead can save it for you.';
    case 'forbidden':
      return 'Not allowed for this account — ask a lead';
    default:
      return rejection.message.trim() || 'The server refused this change — ask a lead';
  }
}
