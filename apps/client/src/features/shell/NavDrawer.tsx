import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Brand } from './Brand';
import { NavList } from './NavList';
import type { NavAudience, NavItem } from './nav';

/** The phone's full nav: the same destinations as the sidebar, and the account. */
export function NavDrawer({
  open,
  onClose,
  items,
  who,
  account,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  who: NavAudience;
  account: ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Menu" side="start">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <div className="min-w-0 flex-1">
          <Brand />
        </div>
        <Button variant="ghost" size="icon" aria-label="Close the menu" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>
      <nav aria-label="Main" className="flex-1 p-3">
        <NavList items={items} who={who} onNavigate={onClose} />
      </nav>
      <div className="border-t border-border p-3">{account}</div>
    </Sheet>
  );
}
