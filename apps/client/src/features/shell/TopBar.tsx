import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Brand } from './Brand';

/** The phone's top edge: the menu, the brand, and the connection state on the right. */
export function TopBar({
  menuOpen,
  onOpenMenu,
  status,
}: {
  menuOpen: boolean;
  onOpenMenu: () => void;
  status: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-border bg-bg px-2 pt-[env(safe-area-inset-top)]">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open the menu"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={onOpenMenu}
      >
        <Menu aria-hidden="true" />
      </Button>
      <Brand />
      <div className="ms-auto">{status}</div>
    </header>
  );
}
