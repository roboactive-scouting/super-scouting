import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * THEME "Stat tile": a white card, `--line` border; the label 12 px / 600 `--muted`, the
 * value in mono 24 px (a warning count in `--warn`), the note 12 px `--muted`.
 */
export function StatTile({
  label,
  value,
  note,
  tone = 'default',
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'default' | 'warn';
}) {
  return (
    <div className="rounded-card border border-line bg-surface px-3.5 py-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={cn('num mt-1 text-2xl font-semibold', tone === 'warn' && 'text-warn')}>
        {value}
      </p>
      {note ? <p className="text-xs text-muted">{note}</p> : null}
    </div>
  );
}
