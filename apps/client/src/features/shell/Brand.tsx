import { cn } from '@/lib/utils';

/**
 * The mark and the product's name on the dark rail (THEME "Sidebar", "Phone menu"). The mark
 * is yellow on near-black: it only ever sits on `--rail`, which is its plate (SPEC-FINAL 17.4).
 * `compact` (the collapsed sidebar) keeps the mark alone; `small` is the phone menu's row.
 */
export function Brand({ compact = false, small = false }: { compact?: boolean; small?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img
        src="/brand/mark.png"
        alt={compact ? 'RobActive Scout' : ''}
        className={cn('shrink-0', small ? 'w-[1.875rem]' : 'w-[2.125rem]')}
      />
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p
            className={cn(
              'truncate font-bold text-white',
              small ? 'text-[0.875rem]' : 'text-[0.9375rem]',
            )}
          >
            RobActive Scout
          </p>
          <p className="truncate text-xs text-rail-muted">Team 2096</p>
        </div>
      )}
    </div>
  );
}
