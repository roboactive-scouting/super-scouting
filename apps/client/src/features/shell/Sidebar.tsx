import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Account } from './account';
import { AccountMenu } from './AccountMenu';
import { Brand } from './Brand';
import { NavList } from './NavList';
import type { NavAudience, NavItem } from './nav';

/**
 * The desktop chrome (≥ 1024 px, SPEC-FINAL 17.3; THEME "Sidebar"): the brand, every
 * destination grouped, and the account corner, on `--rail`. It collapses to a rail; the width
 * change is a transition, never a remount of the page beside it.
 */
export function Sidebar({
  items,
  who,
  collapsed,
  onToggle,
  account,
}: {
  items: NavItem[];
  who: NavAudience;
  collapsed: boolean;
  onToggle: () => void;
  account: Account;
}) {
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside
      aria-label="Sidebar"
      className={cn(
        'motion-safe:transition-[width] sticky top-0 z-30 flex h-dvh shrink-0 flex-col on-rail bg-rail px-3.5 py-5 text-rail-ink',
        collapsed ? 'w-[4.75rem]' : 'w-[14.5rem]',
      )}
    >
      <div
        className={cn(
          'border-b border-rail-line pt-1 pb-[22px]',
          collapsed ? 'flex justify-center' : 'px-2',
        )}
      >
        <Brand compact={collapsed} />
      </div>
      <nav aria-label="Main" className="-mx-1 mt-[22px] min-h-0 flex-1 overflow-y-auto px-1">
        <NavList items={items} who={who} variant="sidebar" collapsed={collapsed} />
      </nav>
      {/* Not in the mock-ups: the collapse control (R.6) sits quietly above the account; 48 px per 17.7. */}
      <div className={cn('flex pb-2', collapsed ? 'justify-center' : 'px-1')}>
        <button
          type="button"
          aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
          onClick={onToggle}
          className="motion-safe:transition grid size-12 shrink-0 place-items-center rounded-lg text-rail-muted hover:bg-rail-raised hover:text-surface"
        >
          <Toggle aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="border-t border-rail-line pt-3">
        <AccountMenu account={account} collapsed={collapsed} />
      </div>
    </aside>
  );
}
