import { formatTime } from '@frc/shared';
import type { useSyncStatus } from '@/data/syncStatus';
import { cn } from '@/lib/utils';

export type SyncStatus = ReturnType<typeof useSyncStatus>;

export type SyncTone = 'waiting' | 'sent' | 'syncing' | 'offline';

const DOT: Record<SyncTone, string> = {
  waiting: 'bg-warn',
  sent: 'bg-accent',
  syncing: 'bg-accent motion-safe:animate-pulse',
  offline: 'bg-muted',
};

type Summary = { tone: SyncTone; text: string };
type Inputs = Pick<SyncStatus, 'waiting' | 'online' | 'syncing'>;

/**
 * SPEC-FINAL 9.10's three states, offline first (a sync begun just before the network dropped
 * is not sending), each with the unsynced count: `alone` words it on its own, `after` after
 * the state's name.
 */
function summarise(
  status: Inputs,
  alone: (n: number) => string,
  after: (n: number) => string,
): Summary {
  const n = status.waiting;
  if (!status.online) return { tone: 'offline', text: n > 0 ? `Offline · ${after(n)}` : 'Offline' };
  if (status.syncing)
    return { tone: 'syncing', text: n > 0 ? `Syncing · ${after(n)}` : 'Syncing…' };
  if (n > 0) return { tone: 'waiting', text: alone(n) };
  return { tone: 'sent', text: 'All sent' };
}

/** The phone's one pill (THEME "Phone top bar"): "● 3 waiting", "● Syncing · 3", "● Offline · 3", "● All sent". */
export function compactSync(status: Inputs): Summary {
  return summarise(status, (n) => `${n} waiting`, String);
}

/** The menu's sync line (THEME "Phone menu (drawer)"): the same states, the count spelt out. */
export function syncLine(status: Inputs): Summary {
  const spelt = (n: number) => `${n} waiting to send`;
  return summarise(status, spelt, spelt);
}

/**
 * Why the last sync failed (UF.13), only while something waits to send: "Last try failed:
 * No connection to the server · 09:41". Null otherwise — once nothing waits, it no longer
 * matters, and the next sync that succeeds clears it.
 */
export function failureLine(status: Pick<SyncStatus, 'waiting' | 'lastFailure'>): string | null {
  const failure = status.lastFailure;
  if (status.waiting === 0 || !failure) return null;
  return `Last try failed: ${failure.text} · ${formatTime(failure.at)}`;
}

export function SyncDot({ tone }: { tone: SyncTone }) {
  return <span aria-hidden="true" className={cn('size-[7px] shrink-0 rounded-full', DOT[tone])} />;
}

const CHIP =
  'inline-flex h-7 items-center gap-[7px] rounded-full border border-line bg-surface px-[11px] text-[0.78125rem] font-medium text-ink-2';

/**
 * SPEC-FINAL 9.10: the sending state in words, never a colour alone. Desktop: "● 3 waiting
 * to send" (only while something waits) and "● Online" / "● Syncing…" / "● Offline" as chips.
 * Phone (`compact`): one pill on `--rail-raised` — see `compactSync`.
 */
export function SyncPill({ status, compact = false }: { status: SyncStatus; compact?: boolean }) {
  if (compact) {
    const { tone, text } = compactSync(status);
    return (
      <span
        role="status"
        className="inline-flex h-[1.875rem] shrink-0 items-center gap-1.5 rounded-full bg-rail-raised px-2.5 text-[0.78125rem] font-medium whitespace-nowrap text-rail-ink"
      >
        <SyncDot tone={tone} />
        {text}
      </span>
    );
  }
  const connection: SyncTone = !status.online ? 'offline' : status.syncing ? 'syncing' : 'sent';
  const failed = failureLine(status);
  return (
    <span role="status" className="flex min-w-0 items-center gap-2.5">
      {failed && (
        <span title={failed} className="min-w-0 truncate text-xs text-ink-2">
          {failed}
        </span>
      )}
      {status.waiting > 0 && (
        <span className={CHIP} title={failed ?? undefined}>
          <SyncDot tone="waiting" />
          {status.waiting} waiting to send
        </span>
      )}
      <span className={CHIP}>
        <SyncDot tone={connection} />
        {connection === 'offline' ? 'Offline' : connection === 'syncing' ? 'Syncing…' : 'Online'}
      </span>
    </span>
  );
}
