import { StateMessage } from '@/components/StateMessage';
import type { Failure } from './manageError';

/** A list the page needs and could not get: the connection state, or the server's own line. */
export function LoadFailure({
  what,
  failure,
  onRetry,
}: {
  what: 'Seasons' | 'Events' | 'Teams' | 'Matches';
  failure: Failure;
  onRetry: () => void;
}) {
  return failure.unreachable ? (
    <StateMessage
      variant="offline-needs-server"
      headingLevel={2}
      detail={`${what} live on the server, and this device cannot reach it right now.`}
      action={{ label: 'Try again', onClick: onRetry }}
    />
  ) : (
    <StateMessage
      variant="failed"
      headingLevel={2}
      title={`${what} did not load`}
      detail={failure.line}
      action={{ label: 'Try again', onClick: onRetry }}
    />
  );
}
