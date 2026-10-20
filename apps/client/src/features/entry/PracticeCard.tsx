import { ChevronRight, FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PATHS } from '@/lib/paths';
import type { PracticeStartState } from './PracticeStart';

/**
 * The way into practice mode (SPEC-FINAL 8.5, v1.23; entry parts, "Practice a match"): a dashed
 * card at the foot of Scout with an amber flask, "Practice a match", "Try the real form. Nothing is
 * saved or sent.", and ›. It goes to `/practice`, handing over the robot the Scout page has picked
 * (when its match is on this device) so practice opens that one.
 */
export function PracticeCard({ prefer }: { prefer?: PracticeStartState['prefer'] }) {
  const state: PracticeStartState = prefer ? { prefer } : {};
  return (
    <Link
      to={PATHS.practice}
      state={state}
      className="hover-veil motion-safe:transition flex min-h-16 items-center gap-3 rounded-card border border-dashed border-control-border bg-surface px-3.5 py-3"
    >
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-warn-tint text-warn"
      >
        <FlaskConical className="size-[18px]" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[0.90625rem] font-[650] text-ink">Practice a match</b>
        <small className="block text-[0.78125rem] leading-snug text-muted">
          Try the real form. Nothing is saved or sent.
        </small>
      </span>
      <ChevronRight aria-hidden="true" className="size-[18px] shrink-0 text-faint" />
    </Link>
  );
}
