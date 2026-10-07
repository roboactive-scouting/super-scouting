import { cn } from '@/lib/utils';

/**
 * One choice among a few, each with a line that says what it means (THEME "Described
 * choice": equal-width 56 px buttons, a 15 px / 650 label over an 11.5 px muted
 * description; chosen = 2 px accent on accent-tint).
 *
 * Saving state: while `saving` names an option, that option shows "Saving…" in accent-ink in
 * place of its description and counts as chosen; the others dim and cannot be picked. The
 * page shows its own "Saved. …" line when the save lands.
 */
export function DescribedChoice<K extends string>({
  label,
  options,
  value,
  saving,
  onChange,
}: {
  label: string;
  options: readonly { key: K; label: string; description: string }[];
  value: K;
  saving?: K | null;
  onChange: (key: K) => void;
}) {
  const busy = saving !== undefined && saving !== null;
  const chosenKey = busy ? saving : value;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-busy={busy}
      className="grid auto-cols-fr grid-flow-col gap-2"
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
          </button>
        );
      })}
    </div>
  );
}
