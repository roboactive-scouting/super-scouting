import { ChevronRight, TriangleAlert } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import type { Problem } from './entryRules';
import { PHASE_NAME } from './phases';

/** "2 things to fix first"; one is "1 thing to fix first". */
export function problemsTitle(count: number): string {
  return `${count} ${count === 1 ? 'thing' : 'things'} to fix first`;
}

/**
 * What holds Review entry (SPEC-FINAL 8.2, 15.1; entry parts "Range block and required fields"):
 * a bottom sheet on a phone, the centred dialog on a computer, in place of the confirmation.
 * Every problem is listed — never just the first — with its phase, its reason and **Go to ›**,
 * which closes this and lands on the field. The foot is **Keep editing**. Amber, never red.
 */
export function ProblemsDialog({
  open,
  problems,
  onGoTo,
  onClose,
}: {
  open: boolean;
  problems: readonly Problem[];
  onGoTo: (problem: Problem) => void;
  onClose: () => void;
}) {
  const describe = useId();
  const listName = useId();
  return (
    <ResponsiveDialog
      open={open}
      title={problemsTitle(problems.length)}
      onClose={onClose}
      showClose={false}
      describedBy={describe}
      width={560}
    >
      <p id={describe} className="-mt-1.5 text-[0.84375rem] text-ink-2">
        The entry can’t be submitted yet. Everything else is saved on this device.
      </p>
      <span id={listName} className="sr-only">
        Things to fix
      </span>
      <ul
        aria-labelledby={listName}
        className="overflow-hidden rounded-card border border-line bg-surface"
      >
        {problems.map((problem) => (
          <li
            key={problem.key}
            className="flex items-center gap-3 border-t border-line-2 px-3.5 py-2.5 first:border-t-0"
          >
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-warn-tint text-warn"
            >
              <TriangleAlert className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[0.90625rem] font-[650] text-ink" dir="auto">
                {problem.label}
              </b>
              <span className="block text-[0.78125rem] text-muted" dir="auto">
                {problem.phase ? PHASE_NAME[problem.phase] : 'Robot status'} · {problem.reason}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Go to ${problem.label}`}
              onClick={() => onGoTo(problem)}
              className="tap-target hover-veil -me-1.5 inline-flex shrink-0 items-center gap-0.5 rounded-control px-1.5 text-[0.84375rem] font-bold text-accent-ink"
            >
              Go to
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        size="lg"
        className="w-full lg:w-auto lg:self-end"
        onClick={onClose}
      >
        Keep editing
      </Button>
    </ResponsiveDialog>
  );
}
