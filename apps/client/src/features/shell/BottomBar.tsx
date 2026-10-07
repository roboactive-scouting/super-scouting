import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { NavAudience, NavItem } from './nav';

const TAB =
  'relative flex min-h-[3.25rem] flex-1 flex-col items-center gap-[3px] pt-1.5 text-[0.71875rem] font-[650]';
const PILL = 'grid h-[1.875rem] w-[3.25rem] place-items-center rounded-full';

/** The amber count on Entries: what waits to send. None when nothing waits. */
function Badge({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="num absolute start-[56%] top-0.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-warn px-1 text-[0.65625rem] text-surface"
    >
      {count}
    </span>
  );
}

function Tab({ item, who, waiting }: { item: NavItem; who: NavAudience; waiting: number }) {
  const Icon = item.icon;
  const icon = <Icon aria-hidden="true" strokeWidth={1.8} className="size-[1.375rem]" />;
  if (item.disabled?.(who)) {
    return (
      <span aria-disabled="true" className={cn(TAB, 'text-rail-muted opacity-60')}>
        <span className={PILL}>{icon}</span>
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
      className={({ isActive }) => cn(TAB, isActive ? 'text-surface' : 'text-rail-muted')}
    >
      {({ isActive }) => (
        <>
          <span className={cn(PILL, isActive && 'motion-safe:animate-indicator-in bg-rail-raised')}>
            {icon}
          </span>
          {item.label}
          {badge && <Badge count={waiting} />}
        </>
      )}
    </NavLink>
  );
}

/** Scout, raised in the middle: a 58 px `--accent` square with a `--rail` ring, its name below. */
function Raised({ item, who }: { item: NavItem; who: NavAudience }) {
  const Icon = item.icon;
  const face = (on: boolean) => (
    <>
      <span className="grid size-[3.625rem] place-items-center rounded-[18px] border-4 border-rail bg-accent text-on-accent shadow-[0_8px_20px_-8px_color-mix(in_srgb,var(--accent)_60%,transparent)]">
        <Icon aria-hidden="true" strokeWidth={1.8} className="size-[1.625rem]" />
      </span>
      <span className={on ? 'text-surface' : 'text-rail-muted'}>{item.label}</span>
    </>
  );
  const shape =
    '-mt-[1.375rem] flex flex-1 flex-col items-center gap-[3px] text-[0.71875rem] font-[650]';
  if (item.disabled?.(who)) {
    return (
      <span aria-disabled="true" className={cn(shape, 'opacity-60')}>
        {face(false)}
      </span>
    );
  }
  return (
    <NavLink to={item.to} end={item.end} className={shape}>
      {({ isActive }) => face(isActive)}
    </NavLink>
  );
}

/**
 * The phone's navigation bar on `--rail` (THEME "Phone bottom bar", spec v1.15): tabs either
 * side of the raised Scout — the one primary job, always under the thumb. Entries carries the
 * waiting-to-send count. The current tab's pill grows in: it says where you are.
 */
export function BottomBar({
  bar,
  who,
  waiting,
}: {
  bar: { left: NavItem[]; raised: NavItem | null; right: NavItem[] };
  who: NavAudience;
  waiting: number;
}) {
  const tab = (item: NavItem) => (
    <li key={item.id} className="flex flex-1">
      <Tab item={item} who={who} waiting={waiting} />
    </li>
  );
  return (
    <nav
      aria-label="Main"
      className="on-rail fixed inset-x-0 bottom-0 z-30 bg-rail px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <ul className="flex h-14">
        {bar.left.map(tab)}
        {bar.raised && (
          <li className="flex flex-1">
            <Raised item={bar.raised} who={who} />
          </li>
        )}
        {bar.right.map(tab)}
      </ul>
    </nav>
  );
}
