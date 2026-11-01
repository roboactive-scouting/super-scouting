import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { TableCell, TableRow } from './table';

/*
 * THEME "Link row (opens a page)" (team search, 2026-10-23): a row of at least 60 px whose WHOLE
 * area is the link. Its content, then a 34 px round `--accent-tint` › in `--accent-ink` (a white
 * circle on an already tinted row). Pressed, hovered or keyboard-focused, the row turns
 * `--accent-tint` with a 3 px `--accent` start edge and the › fills `--accent` with a white arrow.
 * On a computer the key text underlines (LINK_KEY_TEXT) and "Team page ›" shows at the row's end.
 * Team search's rows use it; the team page's match rows (task 1.53) reuse it.
 */

/** The row's lit state: pressed (`active`), hovered (hover-capable devices only) or focused. */
const LIT =
  'active:bg-accent-tint active:shadow-[inset_3px_0_0_var(--accent)] hover:bg-accent-tint hover:shadow-[inset_3px_0_0_var(--accent)] focus-visible:bg-accent-tint focus-visible:shadow-[inset_3px_0_0_var(--accent)]';

/** The round › while its row is lit. */
const LIT_CHEVRON =
  'group-active:bg-accent group-active:text-on-accent group-hover:bg-accent group-hover:text-on-accent group-focus-visible:bg-accent group-focus-visible:text-on-accent';

/**
 * The text that names the destination (the team number), underlined while its row is hovered or
 * focused on a computer. For a LinkTableRow's cells, whose link is the row's last cell.
 */
export const LINK_KEY_TEXT =
  'underline-offset-[3px] group-hover:underline group-has-[a:focus-visible]:underline';

/** The 34 px round ›. `tinted`: the row is already `--accent-tint`, so the circle is white. */
function Chevron({ tinted }: { tinted: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'motion-safe:transition grid size-[34px] shrink-0 place-items-center rounded-full text-accent-ink',
        tinted ? 'bg-surface' : 'bg-accent-tint',
        LIT_CHEVRON,
      )}
    >
      <ChevronRight className="size-[17px]" strokeWidth={2.4} />
    </span>
  );
}

/**
 * A list row that is one link (phone lists). `label` is its accessible name — "1690 Orbit, team
 * page" — so the row is announced as what it opens, not as its parts. `tinted` paints a row that
 * is tinted at rest (our own team's).
 */
export function LinkRow({
  to,
  label,
  tinted = false,
  className,
  children,
}: {
  to: string;
  label: string;
  tinted?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={cn(
        'group motion-safe:transition flex min-h-[60px] items-center gap-2.5 px-3 py-2 text-ink outline-offset-[-2px]',
        tinted && 'bg-accent-tint',
        LIT,
        className,
      )}
    >
      {children}
      <Chevron tinted={tinted} />
    </Link>
  );
}

/**
 * A data-table row that is one link (computer tables): the last cell holds the link, stretched
 * over the whole row, with "Team page ›" (`endLabel`) shown while the row is hovered or focused
 * and only the › otherwise. The other cells are the caller's.
 *
 * Without `endLabel` it is THEME "Table row as a link" (entry search, 2026-10-23): a narrow last
 * cell with a faint › that turns `--accent` while the row is lit; Entries' rows use it.
 */
export function LinkTableRow({
  to,
  label,
  endLabel,
  tinted = false,
  className,
  children,
}: {
  to: string;
  label: string;
  endLabel?: string;
  tinted?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const quiet = endLabel === undefined;
  return (
    <TableRow
      readOnly
      className={cn(
        'group relative cursor-pointer motion-safe:transition',
        tinted && 'bg-accent-tint',
        'hover:bg-accent-tint hover:[&>td:first-child]:shadow-[inset_3px_0_0_var(--accent)]',
        // The link is the last cell's; the ring and the lit state belong to the whole row.
        'has-[a:focus-visible]:bg-accent-tint has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-accent has-[a:focus-visible]:[&>td:first-child]:shadow-[inset_3px_0_0_var(--accent)]',
        className,
      )}
    >
      {children}
      <TableCell className={cn('pe-5 text-end', quiet ? 'w-10 ps-0' : 'w-[220px]')}>
        <Link
          to={to}
          aria-label={label}
          className={cn(
            "own-focus inline-flex items-center gap-1 text-[0.8125rem] font-[650] after:absolute after:inset-0 after:content-['']",
            quiet
              ? 'motion-safe:transition text-faint group-hover:text-accent group-has-[a:focus-visible]:text-accent'
              : 'text-accent-ink',
          )}
        >
          {quiet ? null : (
            <span className="opacity-0 group-hover:opacity-100 group-has-[a:focus-visible]:opacity-100">
              {endLabel}
            </span>
          )}
          <ChevronRight aria-hidden="true" className="size-[15px]" strokeWidth={2.4} />
        </Link>
      </TableCell>
    </TableRow>
  );
}

/**
 * The phone card twin of "Table row as a link" (entry search, 2026-10-23): a white card whose
 * whole area is the link, a faint › at the end. Pressed, hovered or focused it turns
 * `--accent-tint` with a 3 px `--accent` start edge and the › `--accent`. `label` is its name.
 */
export function LinkCard({
  to,
  label,
  className,
  children,
}: {
  to: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={cn(
        'group motion-safe:transition relative block rounded-card border border-line bg-surface py-2.5 ps-3 pe-8 text-ink outline-offset-[-2px]',
        LIT,
        className,
      )}
    >
      {children}
      <ChevronRight
        aria-hidden="true"
        className="motion-safe:transition absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-faint group-hover:text-accent group-focus-visible:text-accent group-active:text-accent"
        strokeWidth={2.4}
      />
    </Link>
  );
}
