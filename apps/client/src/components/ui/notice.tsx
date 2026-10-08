import { Check, Info, TriangleAlert, WifiOff, type LucideIcon } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { cn } from '@/lib/utils';

/*
 * THEME "Locked components": Note (3 px ink edge), Error line (3 px warn edge, never red),
 * Warning notice (warn tint), Success banner (accent tint). `Notice` is the pre-redesign
 * component, kept with the same props for the shell's strips, the entry route and the field
 * image; it draws the same edges.
 */

const TONE = {
  info: 'border-s-ink',
  success: 'border-s-accent',
  warning: 'border-s-warn',
  danger: 'border-s-warn',
} as const;

/**
 * Legacy: what the page must say out loud, a strip or a box beside the thing it is about.
 * The start edge carries the tone; the text stays `--ink`. It rises in once when it appears
 * unless `still`. `role` is the caller's: "status" for a state, "alert" for a failure, none
 * for a static line.
 */
export function Notice({
  tone = 'info',
  role,
  still = false,
  action,
  className,
  children,
  ref,
  ...rest
}: {
  tone?: keyof typeof TONE;
  role?: 'status' | 'alert';
  still?: boolean;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
  id?: string;
  tabIndex?: number;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  return (
    <div
      ref={ref}
      role={role}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-s-[3px] border-line bg-surface px-3.5 py-2.5 text-[0.84375rem] text-ink',
        TONE[tone],
        !still && 'motion-safe:animate-rise-in',
        className,
      )}
      {...rest}
    >
      <div dir="auto" className="min-w-0 flex-1">
        {children}
      </div>
      {action}
    </div>
  );
}

/** An inline explanation: white, `--line` border, 3 px `--ink` start edge, 13.5 px text. */
export function Note({
  children,
  icon,
  className,
}: {
  children: ReactNode;
  /** A named icon, or any icon component (the builder's lock, THEME "Version banner (locked)"). */
  icon?: 'info' | 'offline' | LucideIcon;
  className?: string;
}) {
  const Icon = icon === 'offline' ? WifiOff : icon === 'info' ? Info : (icon ?? null);
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-control border border-s-[3px] border-line border-s-ink bg-surface px-3.5 py-3 text-[0.84375rem] leading-normal text-ink-2',
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-ink" /> : null}
      <div dir="auto" className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}

/** A failure, announced: a 3 px `--warn` start edge and a warning icon. Never red. */
export function ErrorLine({
  children,
  id,
  className,
  ref,
  focusable = false,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
  /** The line takes focus by script (tabIndex -1), e.g. a failed submit's reason. */
  focusable?: boolean;
}) {
  return (
    <div
      ref={ref}
      id={id}
      tabIndex={focusable ? -1 : undefined}
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-control border border-s-[3px] border-line border-s-warn bg-surface px-3.5 py-2.5 text-sm font-semibold text-ink',
        className,
      )}
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-warn" />
      <div dir="auto" className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}

/** Something to know before going on (e.g. "Your sign-in expired"): a `--warn-tint` box. */
export function WarningNotice({
  children,
  lead,
  icon: Icon = TriangleAlert,
  className,
}: {
  children: ReactNode;
  lead?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-card border border-warn/25 bg-warn-tint px-3.5 py-3 text-[0.84375rem] leading-normal text-ink',
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-warn" />
      <div dir="auto" className="min-w-0 flex-1">
        {lead ? <b className="font-bold text-warn">{lead} </b> : null}
        {children}
      </div>
    </div>
  );
}

/** Done: `--accent-tint`, a light green border, a round `--accent` check, a bold first line. */
export function SuccessBanner({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-card border border-accent/30 bg-accent-tint px-4 py-3.5',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-px grid size-[22px] shrink-0 place-items-center rounded-full bg-accent text-on-accent"
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
      <div dir="auto" className="min-w-0 flex-1 text-[0.84375rem] text-ink-2">
        <b className="block font-bold text-accent-ink">{title}</b>
        {children}
      </div>
    </div>
  );
}
