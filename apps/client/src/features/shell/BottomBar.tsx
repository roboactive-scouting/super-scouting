import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { NavAudience, NavItem } from './nav';

const ITEM = 'relative flex flex-1 flex-col items-center gap-[3px] text-[0.71875rem] font-[650]';
/** A flat tab: an icon over its name in `--rail-muted`, 52 px tall. */
const FLAT = cn(ITEM, 'min-h-[3.25rem] pt-1.5 text-rail-muted');
/** The current page rises 22 px out of the bar, its name in white below. */
const RAISED = cn(ITEM, '-mt-[1.375rem] text-surface');

/** The amber count on Entries: what waits to send. None when nothing waits. */
function Badge({ count, raised }: { count: number; raised: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'num absolute grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-warn px-1 text-[0.65625rem] text-surface',
        raised ? '-top-1 start-[60%]' : 'start-[56%] top-0.5',
      )}
    >
      {count}
    </span>
  );
}

function Tab({ item, who, waiting }: { item: NavItem; who: NavAudience; waiting: number }) {
  const Icon = item.icon;
  const flat = (
    <span className="grid h-[1.875rem] w-[3.25rem] place-items-center">
      <Icon aria-hidden="true" strokeWidth={1.8} className="size-[1.375rem]" />
    </span>
  );
  if (item.disabled?.(who)) {
    return (
      <span aria-disabled="true" className={cn(FLAT, 'opacity-60')}>
        {flat}
        {item.label}
      </span>
    );
  }
  const badge = item.id === 'entries' && waiting > 0;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      aria-label={badge ? `${item.label}, ${waiting} waiting to send` : undefined}
      className={({ isActive }) => (isActive ? RAISED : FLAT)}
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            // A 58 px `--accent` square with a `--rail` ring: where you are.
            <span
              data-raised=""
              className="grid size-[3.625rem] place-items-center rounded-[18px] border-4 border-rail bg-accent text-on-accent shadow-[0_8px_20px_-8px_color-mix(in_srgb,var(--accent)_60%,transparent)]"
            >
              <Icon aria-hidden="true" strokeWidth={1.8} className="size-[1.625rem]" />
            </span>
          ) : (
            flat
          )}
          {item.label}
          {badge && <Badge count={waiting} raised={isActive} />}
        </>
      )}
    </NavLink>
  );
}

/**
 * The phone's navigation bar on `--rail` (THEME "Phone bottom bar", UI fix UF.10): Home ·
 * Scout · Entries, Scout in the middle. The current page is the raised green button and it
 * moves with the page; on any other page every tab is flat. Entries carries the
 * waiting-to-send count, flat or raised.
 */
export function BottomBar({
  bar,
  who,
  waiting,
}: {
  bar: { left: NavItem[]; middle: NavItem | null; right: NavItem[] };
  who: NavAudience;
  waiting: number;
}) {
  const items = [...bar.left, ...(bar.middle ? [bar.middle] : []), ...bar.right];
  return (
    <nav
      aria-label="Main"
      className="on-rail fixed inset-x-0 bottom-0 z-30 bg-rail px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <ul className="flex h-14">
        {items.map((item) => (
          <li key={item.id} className="flex flex-1">
            <Tab item={item} who={who} waiting={waiting} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
