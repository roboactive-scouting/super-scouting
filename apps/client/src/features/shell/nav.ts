import { Calendar, ClipboardCheck, House, List, Users, type LucideIcon } from 'lucide-react';
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
  /** The phone's name for it, where the phone does a different job there: Manage → Matches. */
  phoneLabel?: string;
  /** Computer work (SPEC-FINAL 17.2): in the sidebar, never in the phone menu. */
  desktopOnly?: boolean;
  /** The phone bar's raised middle button: the one primary job, Scout (spec v1.15). */
  raised?: boolean;
  /** NavLink `end`: `/` is current on `/` alone. */
  end?: boolean;
  /** Whether it shows. The page checks the role again, and so does the server. */
  visible: (who: NavAudience) => boolean;
  /** Shown but not a link — Scout while a session override is set (SPEC-FINAL 6.3). */
  disabled?: (who: NavAudience) => boolean;
};

/**
 * Tabs either side of the raised Scout (spec v1.15). Task 1.51 (Teams) and 1.58 (Ranking)
 * make it Home · Teams · Scout · Ranking · Entries — Entries stays in the bar.
 */
export const BOTTOM_BAR_SIDE_MAX = 2;

/**
 * Every destination, in sidebar order. A task that adds a page adds its row here — never
 * a hand-written link in the shell.
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
    icon: ClipboardCheck,
    group: 'competition',
    bottomBar: 1,
    raised: true,
    visible: () => true,
    disabled: (who) => who.override,
  },
  {
    id: 'entries',
    label: 'Entries',
    to: PATHS.entries,
    icon: List,
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
    desktopOnly: true,
    visible: (who) => !who.expired && canManageUsers(who.user),
  },
  {
    id: 'manage',
    label: 'Manage',
    phoneLabel: 'Matches',
    to: PATHS.manage,
    icon: Calendar,
    group: 'admin',
    bottomBar: null,
    visible: (who) => !who.expired && canManageEvents(who.user),
  },
];

export function navItemsFor(who: NavAudience, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((item) => item.visible(who));
}

/** The sidebar's (desktop) or the phone menu's destinations: the phone never offers computer work. */
export function menuItemsFor(
  who: NavAudience,
  isDesktop: boolean,
  items: readonly NavItem[] = NAV_ITEMS,
): NavItem[] {
  return navItemsFor(who, items).filter((item) => isDesktop || !item.desktopOnly);
}

/** The phone bottom bar: tabs either side of the raised Scout, each side in its own order. */
export function bottomBar(
  who: NavAudience,
  isDesktop: false,
  items: readonly NavItem[] = NAV_ITEMS,
): { left: NavItem[]; raised: NavItem | null; right: NavItem[] } {
  const placed = menuItemsFor(who, isDesktop, items)
    .filter((item) => item.bottomBar !== null)
    .sort((a, b) => (a.bottomBar ?? 0) - (b.bottomBar ?? 0));
  const raised = placed.find((item) => item.raised) ?? null;
  const middle = raised?.bottomBar ?? Infinity;
  const sides = placed.filter((item) => item !== raised);
  return {
    left: sides.filter((item) => (item.bottomBar ?? 0) < middle).slice(0, BOTTOM_BAR_SIDE_MAX),
    raised,
    right: sides.filter((item) => (item.bottomBar ?? 0) > middle).slice(0, BOTTOM_BAR_SIDE_MAX),
  };
}

export function groupsOf(items: readonly NavItem[]): { group: NavGroup; items: NavItem[] }[] {
  return (['competition', 'admin'] as const)
    .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0);
}
