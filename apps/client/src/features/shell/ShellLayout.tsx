import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TouchEventHandler,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useSyncStatus } from '@/data/syncStatus';
import { playOnce } from '@/lib/animate';
import { isEntryPath } from '@/lib/paths';
import { cn } from '@/lib/utils';
import type { Account } from './account';
import { BottomBar } from './BottomBar';
import { CrumbBar } from './CrumbBar';
import { NavDrawer } from './NavDrawer';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { bottomBar, menuItemsFor, type NavAudience } from './nav';

const COLLAPSED_KEY = 'shell.sidebar.collapsed';
/** A new page fading in: opacity only — a transform would re-anchor every fixed descendant. */
const PAGE_ENTER: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

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
  /** ≥ 1024 px: the sidebar and the crumb bar. Below: the dark top bar, the menu and the bottom bar. */
  desktop: boolean;
  /** The entry route: nothing in the thumb zone but the form's own Review bar. */
  hideBottomBar: boolean;
  /** Who is looking: nav.ts decides the destinations from it. */
  who: NavAudience;
  account: Account;
  /** The app's version, at the foot of the phone menu. */
  version: string;
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
  hideBottomBar,
  who,
  account,
  version,
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
  // One read of the sending state for every piece of chrome; it re-reads on a change, never polls.
  const status = useSyncStatus();

  // SPEC-FINAL 17.9: a new page fades in — never on the first render, never into the
  // data-entry path. The content is never remounted: AppShell must not key its Outlet.
  const shownPath = useRef(pathname);
  useEffect(() => {
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    if (!isEntryPath(pathname)) playOnce(content.current, PAGE_ENTER, 250);
  }, [pathname]);

  // A destination chosen in the drawer closes it, and so does any other navigation.
  useEffect(() => setMenuOpen(false), [pathname]);

  // The drawer belongs to the phone layout: crossing to desktop closes it, so rotating a
  // tablet back never reopens a modal over the form.
  useEffect(() => {
    if (desktop) setMenuOpen(false);
  }, [desktop]);

  const toggle = () => {
    const next = !collapsed;
    writeCollapsed(next);
    setCollapsed(next);
  };
  const bar = bottomBar(who, false);
  const showBottomBar =
    !desktop && !hideBottomBar && bar.left.length + bar.right.length + (bar.raised ? 1 : 0) > 0;

  return (
    <div className="flex min-h-dvh" onTouchStart={onTouchStart} onTouchMove={onTouchMove}>
      {desktop && (
        <Sidebar
          items={menuItemsFor(who, true)}
          who={who}
          collapsed={collapsed}
          onToggle={toggle}
          account={account}
        />
      )}
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col',
          showBottomBar && 'pb-[calc(var(--bottom-bar)+var(--below-content))]',
        )}
        // Sticky page actions (ActionBar) sit on top of the fixed bottom bar, not under it.
        style={
          showBottomBar
            ? ({
                // BottomBar's exact height: 6 px top, a 56 px row, max(8 px, safe area) foot.
                '--bottom-bar': 'calc(3.875rem + max(0.5rem, env(safe-area-inset-bottom)))',
                // How far the raised Scout button rises above the bar (BottomBar's -mt-[1.375rem]).
                '--raised-overhang': '1.375rem',
                // The room kept under the content for the raised Scout button. A page's ActionBar
                // reaches down through it, so the bar sits flush on the bottom bar.
                '--below-content': 'calc(var(--raised-overhang) + 1rem)',
              } as CSSProperties)
            : undefined
        }
      >
        {desktop ? (
          <CrumbBar status={status} />
        ) : (
          <TopBar menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} status={status} />
        )}
        {notices}
        {/* A page with a pinned foot (an ActionBar; main[data-pinned-foot]) fills the height on a
            phone, so a short page still has its action bar at the bottom (THEME). */}
        <div
          ref={content}
          className={cn(
            'flex-1',
            !desktop && '[&:has(>[data-pinned-foot])]:flex [&:has(>[data-pinned-foot])]:flex-col',
          )}
        >
          {children}
        </div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-xs text-muted">
            {footer}
          </footer>
        )}
        {showBottomBar && <BottomBar bar={bar} who={who} waiting={status.waiting} />}
      </div>
      {!desktop && (
        <NavDrawer
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          items={menuItemsFor(who, false)}
          who={who}
          account={account}
          version={version}
          status={status}
        />
      )}
    </div>
  );
}
