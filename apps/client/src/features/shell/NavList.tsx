import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { groupsOf, NAV_GROUP_LABEL, type NavAudience, type NavItem } from './nav';

const ITEM =
  'tap-target state-layer motion-transition relative z-10 flex items-center gap-3 rounded-lg px-3 text-sm font-medium';

/**
 * One destination. Its label is a direct text node, so a disabled item IS its own label
 * (AppShell.test reads `getByText('Scout')` for the aria-disabled element). Collapsed, the
 * label stays for assistive technology and the icon carries the eye.
 */
export function NavItemLink({
  item,
  who,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  who: NavAudience;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const label = collapsed ? <span className="sr-only">{item.label}</span> : item.label;
  if (item.disabled?.(who)) {
    return (
      <span
        aria-disabled="true"
        className={cn(ITEM, 'cursor-not-allowed text-text-muted opacity-60')}
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        {label}
      </span>
    );
  }
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(ITEM, isActive ? 'text-text' : 'text-text-muted hover:text-text')
      }
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      {label}
    </NavLink>
  );
}

/**
 * One group's list. A single pill sits behind the current item and slides to the next one
 * on every navigation (the M3 navigation indicator): it says where the user is, so it is
 * informational motion. It jumps into place on first render and only moves after that.
 */
function NavGroupList({
  label,
  items,
  who,
  collapsed,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  who: NavAudience;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  const placed = useRef(false);
  const { pathname } = useLocation();
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const current = list.current?.querySelector<HTMLElement>('[aria-current="page"]');
    setPill(current ? { top: current.offsetTop, height: current.offsetHeight } : null);
  }, [pathname, collapsed, items.length]);

  useEffect(() => {
    if (pill) placed.current = true;
  }, [pill]);

  return (
    <div>
      <p className={cn('px-3 pb-1 text-xs font-medium text-text-muted', collapsed && 'sr-only')}>
        {label}
      </p>
      <div className="relative">
        {pill && (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 rounded-lg bg-surface-raised',
              placed.current && 'motion-transition',
            )}
            style={{ transform: `translateY(${pill.top}px)`, height: pill.height }}
          />
        )}
        <ul ref={list} aria-label={label} className="flex flex-col gap-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <NavItemLink item={item} who={who} collapsed={collapsed} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The sidebar's and the phone drawer's destinations, grouped (nav.ts decides which). */
export function NavList({
  items,
  who,
  collapsed = false,
  onNavigate,
}: {
  items: NavItem[];
  who: NavAudience;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {groupsOf(items).map(({ group, items: groupItems }) => (
        <NavGroupList
          key={group}
          label={NAV_GROUP_LABEL[group]}
          items={groupItems}
          who={who}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}
