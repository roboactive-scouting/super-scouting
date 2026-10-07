import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * THEME "Go-to tile": a white card with a 36 px icon square (`--line-2`), the title 15 px / 700,
 * a one-line description in `--muted`, and a › at the top right. Admin tiles: a dark `--rail`
 * icon square and an "ADMIN" label instead of the ›. The whole card is one link.
 */
export function GoToTile({
  icon: Icon,
  title,
  description,
  to,
  admin = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  to: string;
  admin?: boolean;
}) {
  return (
    <Link
      to={to}
      className="state-layer motion-transition relative flex min-h-[88px] flex-col gap-1 rounded-card border border-line bg-surface p-3.5"
    >
      <span
        aria-hidden="true"
        className={cn(
          'mb-1.5 grid size-9 place-items-center rounded-[10px]',
          admin ? 'bg-rail text-white' : 'bg-line-2 text-ink-2',
        )}
      >
        <Icon className="size-[19px]" strokeWidth={2} />
      </span>
      <b className="text-[15px] font-bold">{title}</b>
      <small className="text-[12.5px] leading-snug text-muted">{description}</small>
      {admin ? (
        <span className="absolute end-3 top-3.5 text-[10.5px] font-bold tracking-[0.04em] text-muted">
          ADMIN
        </span>
      ) : (
        <ChevronRight
          aria-hidden="true"
          className="absolute end-3 top-3.5 size-[18px] text-faint"
        />
      )}
    </Link>
  );
}
