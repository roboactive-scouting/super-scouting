import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { NavAudience, NavItem } from './nav';

const ITEM =
  'tap-target flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-medium';
const PILL = 'state-layer flex h-8 w-16 items-center justify-center rounded-full';

/**
 * The M3 navigation bar: the phone's competition jobs in the thumb zone (SPEC-FINAL 17.3).
 * The current item's pill grows in when it becomes current — it says where you are, so it
 * is informational motion.
 */
export function BottomBar({ items, who }: { items: NavItem[]; who: NavAudience }) {
  return (
    <nav
      aria-label="Quick"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id}>
              {item.disabled?.(who) ? (
                <span aria-disabled="true" className={cn(ITEM, 'text-text-muted opacity-60')}>
                  <span className={PILL}>
                    <Icon aria-hidden="true" className="size-6" />
                  </span>
                  {item.label}
                </span>
              ) : (
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => cn(ITEM, isActive ? 'text-text' : 'text-text-muted')}
                >
                  {({ isActive }) => (
                    <>
                      <span className={cn(PILL, isActive && 'indicator-in bg-surface-raised')}>
                        <Icon aria-hidden="true" className="size-6" />
                      </span>
                      {item.label}
                    </>
                  )}
                </NavLink>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
