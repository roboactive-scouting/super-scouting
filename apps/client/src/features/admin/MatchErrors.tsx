import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorLine } from '@/components/ui/notice';
import { MANAGE_UNREACHABLE } from './adminMessages';
import type { MatchEditing } from './useMatchEditing';

/**
 * The Matches error lines (desktop and phone): the last refusal, and — for as long as any
 * match is "Not saved" — the connection line with Try again, which re-sends those matches.
 * Admin calls are online-only, so nothing is re-sent unless the person asks.
 */
export function MatchErrors({
  editing,
  showError = true,
  className,
}: {
  editing: MatchEditing;
  /** False while a dialog or sheet shows the error itself. */
  showError?: boolean;
  className?: string;
}) {
  const [retrying, setRetrying] = useState(false);
  const unsaved = editing.unsaved.size > 0;
  const other =
    showError && editing.error && !(unsaved && editing.error === MANAGE_UNREACHABLE)
      ? editing.error
      : null;

  async function retry() {
    setRetrying(true);
    await editing.retryUnsaved();
    setRetrying(false);
  }

  return (
    <>
      {other && <ErrorLine className={className}>{other}</ErrorLine>}
      {unsaved && (
        <ErrorLine className={className}>
          <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <span>{MANAGE_UNREACHABLE}</span>
            <Button size="sm" busy={retrying} busyLabel="Sending…" onClick={() => void retry()}>
              Try again
            </Button>
          </span>
        </ErrorLine>
      )}
    </>
  );
}
