import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * THEME "Empty state": a white card, a 44 px `--line-2` icon square, a 17 px / 700 title, a
 * `--muted` explanation and one primary action. No dead ends: there is always the action.
 * `detail` and `title` may hold user text, so they are `dir="auto"`.
 */
export function EmptyState({
  icon: Icon,
  title,
  detail,
  action,
  headingLevel = 2,
  className,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  action?: ReactNode;
  headingLevel?: 1 | 2;
  className?: string;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <section
      className={cn(
        'motion-safe:animate-fade-in rounded-card border border-line bg-surface px-5 py-7 text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-line-2 text-ink-2"
      >
        <Icon className="size-[22px]" strokeWidth={1.75} />
      </span>
      <Heading className="text-[1.0625rem] font-bold" dir="auto">
        {title}
      </Heading>
      <p className="mt-1.5 text-[0.84375rem] leading-normal text-muted" dir="auto">
        {detail}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}
