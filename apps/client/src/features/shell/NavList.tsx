import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { groupsOf, NAV_GROUP_LABEL, type NavAudience, type NavItem } from './nav';

/** `sidebar`: the desktop rail's 9×10 rows. `menu`: the phone menu's 48 px rows, phone names. */
export type NavListVariant = 'sidebar' | 'menu';

const ITEM: Record<NavListVariant, string> = {
  sidebar:
    'motion-transition relative z-10 flex items-center gap-[11px] min-h-12 rounded-[7px] px-2.5 leading-[1.2] font-medium',
  menu: 'motion-transition relative z-10 flex min-h-12 items-center gap-3 rounded-lg px-2.5 text-[0.90625rem] font-[550]',
};
const ICON: Record<NavListVariant, string> = {
  sidebar: 'size-[1.0625rem] shrink-0',
  menu: 'size-[1.1875rem] shrink-0',
};

/**
 * One destination. Its label is a direct text node, so a disabled item IS its own label
 * (AppShell.test reads `getByText('Scout')` for the aria-disabled element). Collapsed, the
 * label stays for assistive technology and the icon carries the eye.
 */
export function NavItemLink({
  item,
  who,
  variant,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  who: NavAudience;
  variant: NavListVariant;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const name = variant === 'menu' ? (item.phoneLabel ?? item.label) : item.label;
  const label = collapsed ? <span className="sr-only">{name}</span> : name;
  const icon = <Icon aria-hidden="true" strokeWidth={1.8} className={ICON[variant]} />;
  // The phone menu marks admin places, as Home's go-to tiles do. The group heading already
  // says it to assistive technology.
  const admin = (active: boolean) =>
    variant === 'menu' &&
    item.group === 'admin' && (
      <span
        aria-hidden="true"
        className={cn(
          'ms-auto text-[0.625rem] font-extrabold tracking-[0.06em]',
          active ? 'text-rail-ink' : 'text-rail-muted',
        )}
      >
        ADMIN
      </span>
    );
  if (item.disabled?.(who)) {
    return (
      <span
        aria-disabled="true"
        className={cn(ITEM[variant], 'cursor-not-allowed text-rail-muted opacity-60')}
      >
        {icon}
        {label}
      </span>
    );
  }
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? name : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          ITEM[variant],
          collapsed && 'justify-center px-0',
          isActive ? 'text-white' : 'text-rail-ink hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {icon}
          {label}
          {admin(isActive)}
        </>
      )}
    </NavLink>
  );
}

/**
 * One group's list. A single `--rail-raised` pill sits behind the current item and slides to
 * the next one on every navigation (the M3 navigation indicator): it says where the user is,
 * so it is informational motion. It jumps into place on first render and only moves after.
 */
function NavGroupList({
  label,
  items,
  who,
  variant,
  collapsed,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  who: NavAudience;
  variant: NavListVariant;
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
      <p
        className={cn(
          'px-2.5 text-[0.6875rem] tracking-[0.08em] text-rail-muted uppercase',
          variant === 'sidebar' ? 'pb-2 font-semibold' : 'pt-3.5 pb-1.5 font-[650]',
          collapsed && 'sr-only',
        )}
      >
        {label}
      </p>
      <div className="relative">
        {pill && (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 bg-rail-raised',
              variant === 'sidebar' ? 'rounded-[7px]' : 'rounded-lg',
              placed.current && 'motion-transition',
            )}
            style={{ transform: `translateY(${pill.top}px)`, height: pill.height }}
          />
        )}
        <ul ref={list} aria-label={label} className="flex flex-col">
          {items.map((item) => (
            <li key={item.id}>
              <NavItemLink
                item={item}
                who={who}
                variant={variant}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The sidebar's and the phone menu's destinations, grouped (nav.ts decides which). */
export function NavList({
  items,
  who,
  variant,
  collapsed = false,
  onNavigate,
}: {
  items: NavItem[];
  who: NavAudience;
  variant: NavListVariant;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className={cn('flex flex-col', variant === 'sidebar' && 'gap-[22px]')}>
      {groupsOf(items).map(({ group, items: groupItems }) => (
        <NavGroupList
          key={group}
          label={NAV_GROUP_LABEL[group]}
          items={groupItems}
          who={who}
          variant={variant}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}
