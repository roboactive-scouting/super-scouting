import { formatTime } from '@frc/shared';
import { X } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import type { Account } from './account';
import { AccountBlock } from './AccountBlock';
import { Brand } from './Brand';
import { NavList } from './NavList';
import type { NavAudience, NavItem } from './nav';
import { failureLine, SyncDot, syncLine, type SyncStatus } from './SyncPill';

/** The menu's sync line: the state and what waits to send (SPEC-FINAL 9.10), then when it last synced. */
function SyncLine({ status }: { status: SyncStatus }) {
  const { tone, text } = syncLine(status);
  const failed = failureLine(status);
  return (
    <p className="mx-1.5 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[10px] bg-rail-raised px-2.5 py-[9px] text-[0.78125rem] text-surface">
      <SyncDot tone={tone} />
      {text}
      {failed && <small className="ms-[15px] w-full text-xs text-surface">{failed}</small>}
      {status.lastSyncAt && (
        <small className="ms-[15px] w-full text-xs text-rail-ink">
          last sync {formatTime(status.lastSyncAt)}
        </small>
      )}
    </p>
  );
}

/**
 * The phone's ☰ menu (THEME "Phone menu (drawer)"): a narrow 252 px `--rail` panel from the
 * start edge — the brand and ✕, the sync line, the places (never computer work), and the
 * account at the foot.
 */
export function NavDrawer({
  open,
  onClose,
  items,
  who,
  account,
  version,
  status,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  who: NavAudience;
  account: Account;
  version: string;
  status: SyncStatus;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Menu" side="start" tone="dark" width={252}>
      <div className="on-rail flex min-h-full flex-col px-2.5 pt-[max(0.875rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 ps-2 pt-1 pb-3">
          <div className="min-w-0 flex-1">
            <Brand small />
          </div>
          <button
            type="button"
            aria-label="Close the menu"
            onClick={onClose}
            className="-me-1 grid size-12 shrink-0 place-items-center rounded-lg text-rail-ink hover:bg-rail-raised hover:text-surface"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <SyncLine status={status} />
        <nav aria-label="Places" className="pt-1">
          <NavList items={items} who={who} variant="menu" onNavigate={onClose} />
        </nav>
        <AccountBlock account={account} version={version} onNavigate={onClose} />
      </div>
    </Sheet>
  );
}
