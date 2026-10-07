import { Menu } from 'lucide-react';
import { useCurrentTitle } from '@/lib/pageTitle';
import { SyncPill, type SyncStatus } from './SyncPill';

/**
 * The phone's top edge on `--rail` (THEME "Phone top bar"): ☰, the mark, the page's name, and
 * the sync pill at the right.
 */
export function TopBar({
  menuOpen,
  onOpenMenu,
  status,
}: {
  menuOpen: boolean;
  onOpenMenu: () => void;
  status: SyncStatus;
}) {
  const title = useCurrentTitle();
  return (
    <header className="on-rail sticky top-0 z-30 bg-rail pt-[env(safe-area-inset-top)] text-rail-ink">
      <div className="flex h-[3.375rem] items-center gap-2.5 ps-1 pe-2.5">
        <button
          type="button"
          aria-label="Open the menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={onOpenMenu}
          className="grid size-12 shrink-0 place-items-center rounded-[10px] hover:bg-rail-raised"
        >
          <Menu aria-hidden="true" className="size-[1.375rem]" />
        </button>
        <img src="/brand/mark.png" alt="" className="w-[1.625rem] shrink-0" />
        <p dir="auto" className="min-w-0 flex-1 truncate text-base font-[650] text-white">
          {title}
        </p>
        <SyncPill status={status} compact />
      </div>
    </header>
  );
}
