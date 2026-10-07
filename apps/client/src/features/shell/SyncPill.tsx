import type { useSyncStatus } from '@/data/syncStatus';
import { cn } from '@/lib/utils';

export type SyncStatus = ReturnType<typeof useSyncStatus>;

export type SyncTone = 'waiting' | 'sent' | 'offline';

const DOT: Record<SyncTone, string> = {
  waiting: 'bg-warn',
  sent: 'bg-accent',
  offline: 'bg-muted',
};

/**
 * The phone's one-pill summary (THEME "Phone top bar"): offline says so first — what is
 * waiting is on the Entries badge — then the waiting count, then "All sent".
 */
export function compactSync(status: Pick<SyncStatus, 'waiting' | 'online'>): {
  tone: SyncTone;
  text: string;
} {
  if (!status.online) return { tone: 'offline', text: 'Offline' };
  if (status.waiting > 0) return { tone: 'waiting', text: `${status.waiting} waiting` };
  return { tone: 'sent', text: 'All sent' };
}

export function SyncDot({ tone }: { tone: SyncTone }) {
  return <span aria-hidden="true" className={cn('size-[7px] shrink-0 rounded-full', DOT[tone])} />;
}

const CHIP =
  'inline-flex h-7 items-center gap-[7px] rounded-full border border-line bg-surface px-[11px] text-[0.78125rem] font-medium text-ink-2';

/**
 * SPEC-FINAL 9.10: the sending state in words, never a colour alone. Desktop: "● 3 waiting
 * to send" (only while something waits) and "● Online" / "● Offline" as chips. Phone
 * (`compact`): one pill on `--rail-raised` — "● 3 waiting", "● All sent" or "● Offline".
 */
export function SyncPill({ status, compact = false }: { status: SyncStatus; compact?: boolean }) {
  if (compact) {
    const { tone, text } = compactSync(status);
    return (
      <span
        role="status"
        className="inline-flex h-[1.875rem] shrink-0 items-center gap-1.5 rounded-full bg-rail-raised px-2.5 text-[0.78125rem] font-semibold whitespace-nowrap text-surface"
      >
        <SyncDot tone={tone} />
        {text}
      </span>
    );
  }
  return (
    <span role="status" className="flex items-center gap-2.5">
      {status.waiting > 0 && (
        <span className={CHIP}>
          <SyncDot tone="waiting" />
          {status.waiting} waiting to send
        </span>
      )}
      <span className={CHIP}>
        <SyncDot tone={status.online ? 'sent' : 'offline'} />
        {status.online ? 'Online' : 'Offline'}
      </span>
    </span>
  );
}
