import { cn } from '@/lib/utils';

/**
 * One choice among a few, each with a line that says what it means (THEME "Described
 * choice": equal-width 56 px buttons, a 15 px / 650 label over an 11.5 px muted
 * description; chosen = 2 px accent on accent-tint).
 *
 * Saving state: while `saving` names an option, that option shows "Saving…" in accent-ink in
 * place of its description and counts as chosen; the others dim and cannot be picked. The
 * page shows its own "Saved. …" line when the save lands.
 *
 * `stacked` lays the options out one under another at full width (a list to pick from, e.g.
 * Import's saved exports); an option's `aside` then sits at its end in mono `--muted`.
 */
export function DescribedChoice<K extends string>({
  label,
  options,
  value,
  saving,
  stacked = false,
  onChange,
}: {
  label: string;
  options: readonly { key: K; label: string; description: string; aside?: string }[];
  value: K;
  saving?: K | null;
  stacked?: boolean;
  onChange: (key: K) => void;
}) {
  const busy = saving !== undefined && saving !== null;
  const chosenKey = busy ? saving : value;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-busy={busy}
      className={cn('grid gap-2', !stacked && 'auto-cols-fr grid-flow-col')}
    >
      {options.map((option) => {
        const chosen = option.key === chosenKey;
        const saved = busy && option.key === saving;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={chosen}
            disabled={busy && option.key !== saving}
            onClick={() => {
              if (!busy) onChange(option.key);
            }}
            className={cn(
              'hover-veil motion-safe:transition motion-safe:active:not-disabled:scale-[0.97] flex min-h-14 min-w-0 flex-col items-start justify-center rounded-control border bg-surface px-3 text-start disabled:opacity-50',
              chosen
                ? 'border-2 border-accent bg-accent-tint px-[0.6875rem]'
                : 'border-control-border',
              // Room at the end for the aside.
              option.aside !== undefined && 'pe-32',
            )}
          >
            <span className="text-[0.9375rem] font-[650] text-ink" dir="auto">
              {option.label}
            </span>
            <span
              className={cn(
                'text-[0.71875rem] leading-snug',
                saved ? 'font-semibold text-accent-ink' : 'text-muted',
              )}
              dir="auto"
            >
              {saved ? 'Saving…' : option.description}
            </span>
            {option.aside !== undefined && (
              <span className="absolute end-3 top-1/2 -translate-y-1/2 font-num text-[0.78125rem] whitespace-nowrap text-muted">
                {option.aside}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
