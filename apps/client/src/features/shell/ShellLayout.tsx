import { useEffect, useRef, useState, type ReactNode, type TouchEventHandler } from 'react';
import { useLocation } from 'react-router-dom';
import { DURATION, EASING, PAGE_ENTER, usePlayOnChange } from '@/lib/motion';
import { isEntryPath } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { BottomBar } from './BottomBar';
import { NavDrawer } from './NavDrawer';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import type { NavAudience, NavItem } from './nav';

const COLLAPSED_KEY = 'shell.sidebar.collapsed';
const ROUTE_MOTION = { duration: DURATION.medium1, easing: EASING.emphasizedDecelerate };

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

/**
 * The shell's frame. Its tree keeps ONE shape at every width — each piece of chrome is a
 * conditional sibling at a fixed position — so crossing the breakpoint (a tablet turned
 * sideways) never remounts the page and never throws a part-filled form away.
 */
export function ShellLayout({
  desktop,
  items,
  bottomItems,
  hideBottomBar,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const content = useRef<HTMLDivElement>(null);

  // SPEC-FINAL 17.9: a new page fades in; nothing plays into the data-entry path.
  usePlayOnChange(content, pathname, PAGE_ENTER, ROUTE_MOTION, !isEntryPath(pathname));

  // A destination chosen in the drawer closes it, and so does any other navigation.
  useEffect(() => setMenuOpen(false), [pathname]);

  const toggle = () => {
    const next = !collapsed;
    writeCollapsed(next);
    setCollapsed(next);
  };
  const showBottomBar = !desktop && !hideBottomBar && bottomItems.length > 0;

  return (
    <div className="flex min-h-dvh" onTouchStart={onTouchStart} onTouchMove={onTouchMove}>
      {desktop && (
        <Sidebar
          items={items}
          who={who}
          collapsed={collapsed}
          onToggle={toggle}
          status={status(collapsed)}
          account={account(collapsed)}
        />
      )}
      <div className={cn('flex min-w-0 flex-1 flex-col', showBottomBar && 'pb-20')}>
        {!desktop && (
          <TopBar menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} status={status(false)} />
        )}
        {notices}
        <div ref={content} className="flex-1">
          {children}
        </div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-xs text-text-muted">
            {footer}
          </footer>
        )}
        {showBottomBar && <BottomBar items={bottomItems} who={who} />}
      </div>
      {!desktop && (
        <NavDrawer
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          items={items}
          who={who}
          account={account(false)}
        />
      )}
    </div>
  );
}
