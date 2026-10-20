import { ChevronRight, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PATHS } from '@/lib/paths';

/**
 * The way into super scouting (15-super final, "The way in"): a card at the foot of Scout — a dark
 * icon square with an eye, "Super scouting", "One entry per team for the whole event", and ›.
 * It is not a nav row (SPEC-FINAL 8.1).
 */
export function SuperCard() {
  return (
    <Link
      to={PATHS.super}
      className="hover-veil motion-safe:transition flex min-h-16 items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3"
    >
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-rail text-surface"
      >
        <Eye className="size-[19px]" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[0.9375rem] font-bold text-ink">Super scouting</b>
        <small className="block text-[0.78125rem] leading-snug text-muted">
          One entry per team for the whole event
        </small>
      </span>
      <ChevronRight aria-hidden="true" className="size-[18px] shrink-0 text-faint" />
    </Link>
  );
}
