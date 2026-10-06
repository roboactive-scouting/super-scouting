import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/buttonStyles';
import { sessionOverride, useSessionOverride } from './sessionOverride';
import { useEventName } from './useEventName';
import { PATHS } from '@/lib/paths';

/**
 * SPEC-FINAL 6.3: "No new entry may be created while an override is in effect" — enforced
 * at the route, not only by the disabled Scout link (task-1.22 addendum A.5). While an
 * override is set, the Scout picker and the entry screen render this instead of the page,
 * so neither mounts. The whole entry route is refused, edits included: a draft lives in
 * `db.drafts`, not in the page, so it is back the moment the override is cleared.
 */
export function OverrideGuard({
  defaultEventId,
  children,
}: {
  /** The admin default the shell works on: the only event entries can go to. */
  defaultEventId: string;
  children: ReactNode;
}) {
  const override = useSessionOverride();
  const defaultName = useEventName(defaultEventId) ?? 'the default competition';
  if (override === null) return children;

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-lg font-semibold">New entries are paused for this session</h1>
      <p dir="auto" className="mt-3">
        You are looking at {override.eventName ?? 'another competition'} only for this session. New
        entries can only be made in {defaultName}.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" className={PRIMARY_BUTTON} onClick={() => sessionOverride.clear()}>
          <span dir="auto">Back to {defaultName}</span>
        </button>
        <Link to={PATHS.home} className={SECONDARY_BUTTON}>
          Choose a competition
        </Link>
      </div>
    </main>
  );
}
