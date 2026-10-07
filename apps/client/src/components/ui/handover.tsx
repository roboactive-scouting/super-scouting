import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * THEME "Handover box": `--accent-tint` with a light green border, a round `--accent` check
 * and a bold first line; the secret in mono 22 px on a white field, the "shown once" line
 * under it, then the caller's actions (copy, done). The secret is never `dir="auto"`: it is
 * a code, read left to right.
 */
export function Handover({
  title,
  label,
  secret,
  note,
  actions,
}: {
  title: ReactNode;
  /** A small line naming the secret ("Their password"), before it. */
  label?: ReactNode;
  secret: string;
  note: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div role="status" className="rounded-card border border-accent/30 bg-accent-tint px-4 py-3.5">
      <p className="flex items-center gap-2 font-bold text-accent-ink">
        <span
          aria-hidden="true"
          className="grid size-[22px] shrink-0 place-items-center rounded-full bg-accent text-on-accent"
        >
          <Check className="size-[13px]" strokeWidth={3} />
        </span>
        {title}
      </p>
      {label ? <p className="mt-2.5 text-xs font-semibold text-muted">{label}</p> : null}
      <p
        dir="ltr"
        className="num mt-2 select-all break-all rounded-control border border-line bg-surface px-3 py-2 text-[1.375rem] font-semibold tracking-[0.04em]"
      >
        {secret}
      </p>
      <p className="mt-2.5 text-xs font-semibold text-muted">{note}</p>
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
