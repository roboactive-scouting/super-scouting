import { useState, type ReactNode, type TouchEventHandler } from 'react';
import { Sidebar } from './Sidebar';
import type { NavAudience, NavItem } from './nav';

const COLLAPSED_KEY = 'shell.sidebar.collapsed';

/** A remembered per-device convenience, never state that matters: storage may refuse. */
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, String(value));
  } catch {
    // Private mode or blocked storage: the choice is simply not remembered.
  }
}

export type ShellLayoutProps = {
  /** ≥ 1024 px: the sidebar. Below: the top bar, the drawer and the bottom bar (R.7). */
  desktop: boolean;
  items: NavItem[];
  bottomItems: NavItem[];
  /** The entry route: nothing in the thumb zone but the form's own Review bar. */
  hideBottomBar: boolean;
  who: NavAudience;
  /** The connection indicator; `collapsed` asks for its compact form. */
  status: (collapsed: boolean) => ReactNode;
  account: (collapsed: boolean) => ReactNode;
  /** The reconnect prompt and the notice strips, in the page flow above the page. */
  notices: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  onTouchStart?: TouchEventHandler;
  onTouchMove?: TouchEventHandler;
};

export function ShellLayout({
  items,
  who,
  status,
  account,
  notices,
  footer,
  children,
  onTouchStart,
  onTouchMove,
}: ShellLayoutProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => {
    const next = !collapsed;
    writeCollapsed(next);
    setCollapsed(next);
  };
  return (
    <div className="flex min-h-dvh" onTouchStart={onTouchStart} onTouchMove={onTouchMove}>
      <Sidebar
        items={items}
        who={who}
        collapsed={collapsed}
        onToggle={toggle}
        status={status(collapsed)}
        account={account(collapsed)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {notices}
        <div className="flex-1">{children}</div>
        <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-xs text-text-muted">
          {footer}
        </footer>
      </div>
    </div>
  );
}
