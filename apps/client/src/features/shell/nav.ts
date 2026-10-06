import { CalendarCog, ClipboardPen, House, ListChecks, Users, type LucideIcon } from 'lucide-react';
import type { Role } from '@frc/shared';
import { canManageEvents, canManageUsers } from '@/features/admin/AdminOnly';
import { PATHS } from '@/lib/paths';

/** Who is looking: what decides which destinations show (convenience only, SPEC-FINAL 7.4). */
export type NavAudience = {
  user: { id: string; role: Role };
  expired: boolean;
  /** A session override is set (SPEC-FINAL 6.3). */
  override: boolean;
};

export type NavGroup = 'competition' | 'admin';

export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  competition: 'Competition',
  admin: 'Admin',
};

export type NavItem = {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  group: NavGroup;
  /** The item's place in the phone bottom bar, lower first; null keeps it in the drawer. */
  bottomBar: number | null;
  /** NavLink `end`: `/` is current on `/` alone. */
  end?: boolean;
  /** Whether it shows. The page checks the role again, and so does the server. */
  visible: (who: NavAudience) => boolean;
  /** Shown but not a link — Scout while a session override is set (SPEC-FINAL 6.3). */
  disabled?: (who: NavAudience) => boolean;
};

/** The phone bottom bar holds at most four (M3 navigation bar: three to five). */
export const BOTTOM_BAR_MAX = 4;

/**
 * Every destination, in sidebar order. A task that adds a page adds its row here — never
 * a hand-written link in the shell. Task 1.51 (Search) and 1.58 (Ranking) take bottom-bar
 * places, and 1.58 moves Entries back to the drawer (spec v0.49, the navigation decision).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    to: PATHS.home,
    icon: House,
    group: 'competition',
    bottomBar: 0,
    end: true,
    visible: () => true,
  },
  {
    id: 'scout',
    label: 'Scout',
    to: PATHS.scout,
    icon: ClipboardPen,
    group: 'competition',
    bottomBar: 1,
    visible: () => true,
    disabled: (who) => who.override,
  },
  {
    id: 'entries',
    label: 'Entries',
    to: PATHS.entries,
    icon: ListChecks,
    group: 'competition',
    bottomBar: 2,
    visible: () => true,
  },
  {
    id: 'users',
    label: 'Users',
    to: PATHS.users,
    icon: Users,
    group: 'admin',
    bottomBar: null,
    visible: (who) => !who.expired && canManageUsers(who.user),
  },
  {
    id: 'manage',
    label: 'Manage',
    to: PATHS.manage,
    icon: CalendarCog,
    group: 'admin',
    bottomBar: null,
    visible: (who) => !who.expired && canManageEvents(who.user),
  },
];

export function navItemsFor(who: NavAudience, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((item) => item.visible(who));
}

export function bottomBarItems(who: NavAudience, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  return navItemsFor(who, items)
    .filter((item) => item.bottomBar !== null)
    .sort((a, b) => (a.bottomBar ?? 0) - (b.bottomBar ?? 0))
    .slice(0, BOTTOM_BAR_MAX);
}

export function groupsOf(items: readonly NavItem[]): { group: NavGroup; items: NavItem[] }[] {
  return (['competition', 'admin'] as const)
    .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0);
}
