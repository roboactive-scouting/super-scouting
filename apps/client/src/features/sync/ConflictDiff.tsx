import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatCount } from '@frc/shared';
import { cn } from '@/lib/utils';
import type { ConflictCard } from './conflictsView';

/** THEME "Counted now" tag: the copy the statistics use until a lead picks. */
export function CountedTag() {
  return (
    <span className="inline-flex h-5 items-center whitespace-nowrap rounded-tag bg-accent-tint px-[7px] font-sans text-[0.6875rem] font-bold text-accent-ink">
      Counted now
    </span>
  );
}

const CELL = 'px-2 py-[7px] align-top leading-[1.35] lg:px-3';

/**
 * THEME "Diff table": Field (34 %) · copy · copy. Each copy's head is its author's first name,
 * the client time in mono and, on the copy in use, "Counted now". Only the differing rows show
 * until "Show the n that match"; a differing row is `--warn-tint` with a 3 px `--warn` edge and
 * bold values, a matching one `--muted`. Every row says which it is in `data-differs`.
 */
export function ConflictDiff({
  card,
  expanded,
  onToggle,
}: {
  card: ConflictCard;
  expanded: boolean;
  onToggle: () => void;
}) {
  const matching = card.rows.length - card.differing;
  const shown = expanded ? card.rows : card.rows.filter((r) => r.differs);
  return (
    <table className="w-full table-fixed border-collapse text-[0.78125rem] lg:text-[0.8125rem]">
      <caption className="sr-only">
        {card.copies[0].first} and {card.copies[1].first}, field by field
      </caption>
      <colgroup>
        <col className="w-[34%]" />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr className="border-b border-line bg-bg text-start align-bottom text-[0.71875rem] font-bold text-muted lg:text-[0.8125rem]">
          <th scope="col" className={cn(CELL, 'pt-2 pb-1.5 text-start align-bottom font-bold')}>
            Field
          </th>
          {card.copies.map((copy, i) => (
            <th
              key={i}
              scope="col"
              className={cn(CELL, 'pt-2 pb-1.5 text-start align-bottom font-medium')}
            >
              <b
                dir="auto"
                className="block text-[0.78125rem] font-bold text-ink lg:text-[0.8125rem]"
              >
                {copy.first}
              </b>
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="num">{copy.time}</span>
                {copy.counted && <CountedTag />}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {shown.map((row) => (
          <tr
            key={row.key}
            data-differs={String(row.differs)}
            className={cn(
              'border-b border-line-2',
              row.differs ? 'bg-warn-tint font-[650] text-ink' : 'text-muted',
            )}
          >
            <td
              dir="auto"
              className={cn(
                CELL,
                row.differs && 'font-semibold text-ink-2 shadow-[inset_3px_0_0_var(--warn)]',
              )}
            >
              {row.label}
            </td>
            {row.values.map((value, i) => (
              <td key={i} dir="auto" className={cn(CELL, 'break-words')}>
                {value}
              </td>
            ))}
          </tr>
        ))}
        {matching > 0 && (
          <tr>
            <td colSpan={3} className="px-2 py-1 lg:px-3">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={onToggle}
                className="tap-target inline-flex min-h-9 items-center gap-1 font-[650] text-accent-ink hover:underline"
              >
                {expanded
                  ? 'Show only the differences'
                  : `Show the ${formatCount(matching)} that match`}
                {expanded ? (
                  <ChevronUp aria-hidden="true" className="size-3.5" />
                ) : (
                  <ChevronDown aria-hidden="true" className="size-3.5" />
                )}
              </button>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
