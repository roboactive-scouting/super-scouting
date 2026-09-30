import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

/** The mark on its plate and the product's name (SPEC-FINAL 17.5: the mark alone when small). */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', compact && 'justify-center')}>
      <Logo variant="mark" className="p-1.5" />
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate font-semibold">ROBACTIVE</p>
          <p className="truncate text-xs text-text-muted">Scouting · team 2096</p>
        </div>
      )}
    </div>
  );
}
