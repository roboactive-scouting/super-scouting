import { formatTime } from '@frc/shared';
import { Link } from 'react-router-dom';
import type { useSyncStatus } from '@/data/syncStatus';
import { PATHS } from '@/lib/paths';
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

/**
 * `onRail`: the dot sits on the dark rail (the phone pill, the menu), where "waiting" takes
 * `--rail-warn` — outdoor's `--warn` all but vanished on it (task 1.38, outdoor re-check).
 */
export function SyncDot({ tone, onRail = false }: { tone: SyncTone; onRail?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-[7px] shrink-0 rounded-full',
        onRail && tone === 'waiting' ? 'bg-rail-warn' : DOT[tone],
      )}
    />
  );
}

const CHIP =
  'inline-flex h-7 items-center gap-[7px] rounded-full border border-line bg-surface px-[11px] text-[0.78125rem] font-medium text-ink-2';

/**
 * SPEC-FINAL 9.10: the sending state in words, never a colour alone, and a link to the Sync page
 * from every screen ("tapping the indicator opens the sync page"; task 1.43). The `role="status"`
 * span sits inside the link, so its words and count are still announced. Desktop: "● 3 waiting
 * to send" (only while something waits) and "● Online" / "● Syncing…" / "● Offline" as chips.
 * Phone (`compact`): one pill on `--rail-raised` — see `compactSync`.
 */
export function SyncPill({ status, compact = false }: { status: SyncStatus; compact?: boolean }) {
  if (compact) {
    const { tone, text } = compactSync(status);
    return (
      <Link
        to={PATHS.sync}
        // A link takes no name from a status inside it (Chrome): it is named with the same words.
        aria-label={text}
        // The 30 px pill keeps its look; its hit area reaches the 48 px touch floor (17.7).
        className="relative inline-flex after:absolute after:inset-x-0 after:-inset-y-[9px] after:content-[''] h-[1.875rem] shrink-0 items-center gap-1.5 rounded-full bg-rail-raised px-2.5 text-[0.78125rem] font-medium whitespace-nowrap text-rail-ink hover:text-surface"
      >
        <span role="status" className="inline-flex items-center gap-1.5">
          <SyncDot tone={tone} onRail />
          {text}
        </span>
      </Link>
    );
  }
  const connection: SyncTone = !status.online ? 'offline' : status.syncing ? 'syncing' : 'sent';
  const failed = failureLine(status);
  const word =
    connection === 'offline' ? 'Offline' : connection === 'syncing' ? 'Syncing…' : 'Online';
  const words = [failed, status.waiting > 0 ? `${status.waiting} waiting to send` : null, word]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link
      to={PATHS.sync}
      aria-label={words}
      className="hover-veil relative flex min-w-0 items-center gap-2.5 rounded-full after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']"
    >
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
          {word}
        </span>
      </span>
    </Link>
  );
}
