import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Brand } from './Brand';
import { NavList } from './NavList';
import type { NavAudience, NavItem } from './nav';

/**
 * The desktop chrome (≥ 1024 px, SPEC-FINAL 17.3): the brand, the connection state, every
 * destination, the account. It collapses to a rail; the width change is a transition,
 * never a remount of the page beside it.
 */
export function Sidebar({
  items,
  who,
  collapsed,
  onToggle,
  status,
  account,
}: {
  items: NavItem[];
  who: NavAudience;
  collapsed: boolean;
  onToggle: () => void;
  status: ReactNode;
  account: ReactNode;
}) {
  return (
    <aside
      aria-label="Sidebar"
      className={cn(
        'motion-transition sticky top-0 flex h-dvh shrink-0 flex-col gap-4 border-e border-border bg-surface p-3',
        collapsed ? 'w-[4.75rem]' : 'w-64',
      )}
    >
      <Brand compact={collapsed} />
      <div className={cn(collapsed && 'flex justify-center')}>{status}</div>
      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto">
        <NavList items={items} who={who} collapsed={collapsed} />
      </nav>
      <div className="border-t border-border pt-3">{account}</div>
      <Button
        variant="ghost"
        size={collapsed ? 'icon' : 'default'}
        aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
        aria-expanded={!collapsed}
        className={cn('text-text-muted', collapsed ? 'self-center' : 'justify-start')}
        onClick={onToggle}
      >
        {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
        {!collapsed && 'Collapse'}
      </Button>
    </aside>
  );
}
