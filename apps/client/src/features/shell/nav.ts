import {
  Calendar,
  ClipboardCheck,
  FileText,
  GitMerge,
  House,
  List,
  RefreshCw,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { can, type Role } from '@frc/shared';
import { canManageEvents, canManageForms, canManageUsers } from '@/features/admin/AdminOnly';
import { PATHS } from '@/lib/paths';

/** Who is looking: what decides which destinations show (convenience only, SPEC-FINAL 7.4). */
export type NavAudience = {
  user: { id: string; role: Role };
  expired: boolean;
  /** A session override is set (SPEC-FINAL 6.3). */
  override: boolean;
};

export type NavGroup = 'competition' | 'admin' | 'device';

export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  competition: 'Competition',
  admin: 'Admin',
  device: 'This device',
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
  /**
   * The phone bar's middle tab: the one primary job, Scout (spec v1.15). It is raised only
   * while it is the current page, like any other tab (UF.10).
   */
  middle?: boolean;
  /** NavLink `end`: `/` is current on `/` alone. */
  end?: boolean;
  /** Whether it shows. The page checks the role again, and so does the server. */
  visible: (who: NavAudience) => boolean;
  /** Shown but not a link — Scout while a session override is set (SPEC-FINAL 6.3). */
  disabled?: (who: NavAudience) => boolean;
  /**
   * A count beside the label in the sidebar and the phone menu: `waiting` is what waits to send
   * (SPEC-FINAL 9.10), Sync's; `conflicts` the current event's open conflicts (SPEC-FINAL 9.5),
   * Conflicts'. None while it is zero.
   */
  count?: NavCountKey;
};

export type NavCountKey = 'waiting' | 'conflicts';

/** The counts nav rows can show (NavItem.count), read once by the shell. */
export type NavCounts = Partial<Record<NavCountKey, number>>;

/** How a count is said in the link's name: "Sync, 6 waiting to send", "Conflicts, 2 to review". */
export const NAV_COUNT_WORDS: Record<NavCountKey, string> = {
  waiting: 'waiting to send',
  conflicts: 'to review',
};

/**
 * Tabs either side of Scout in the middle (spec v1.15). Task 1.51 makes the bar Home · Scout ·
 * Search · Entries (23-team-search final): Search and Entries both after Scout.
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
    middle: true,
    visible: () => true,
    disabled: (who) => who.override,
  },
  // SPEC-FINAL 13.2 (task 1.51): season-wide team search, for every role, after Scout.
  {
    id: 'teams',
    label: 'Search',
    to: PATHS.teams,
    icon: Search,
    group: 'competition',
    bottomBar: 2,
    visible: () => true,
  },
  {
    id: 'entries',
    label: 'Entries',
    to: PATHS.entries,
    icon: List,
    group: 'competition',
    bottomBar: 3,
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
  {
    id: 'forms',
    label: 'Forms',
    to: PATHS.forms,
    icon: FileText,
    group: 'admin',
    bottomBar: null,
    desktopOnly: true,
    visible: (who) => !who.expired && canManageForms(who.user),
  },
  // SPEC-FINAL 9.10 (task 1.43): what this device has sent and what still waits, with the waiting
  // count; every role; never in the bottom bar. No `end`: it is current on /sync/discarded too.
  // The "This device" group reads Sync · Conflicts · Settings.
  {
    id: 'sync',
    label: 'Sync',
    to: PATHS.sync,
    icon: RefreshCw,
    group: 'device',
    bottomBar: null,
    count: 'waiting',
    visible: () => true,
  },
  // SPEC-FINAL 9.5 (task 1.44): the conflict review worklist, with the current event's open count.
  // Leads and admins only; a scouter who opens /conflicts by URL reads it with every action off.
  {
    id: 'conflicts',
    label: 'Conflicts',
    to: PATHS.conflicts,
    icon: GitMerge,
    group: 'device',
    bottomBar: null,
    count: 'conflicts',
    visible: (who) =>
      can({ kind: 'user', userId: who.user.id, role: who.user.role }, 'resolve_conflict'),
  },
  // SPEC-FINAL 8.6 (v1.25, task 1.38): this device's own settings, for every role, in the sidebar
  // and the phone menu; never in the bottom bar.
  {
    id: 'settings',
    label: 'Settings',
    to: PATHS.settings,
    icon: Settings,
    group: 'device',
    bottomBar: null,
    visible: () => true,
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

/** The phone bottom bar: tabs either side of the middle Scout, each side in its own order. */
export function bottomBar(
  who: NavAudience,
  isDesktop: false,
  items: readonly NavItem[] = NAV_ITEMS,
): { left: NavItem[]; middle: NavItem | null; right: NavItem[] } {
  const placed = menuItemsFor(who, isDesktop, items)
    .filter((item) => item.bottomBar !== null)
    .sort((a, b) => (a.bottomBar ?? 0) - (b.bottomBar ?? 0));
  const middle = placed.find((item) => item.middle) ?? null;
  const at = middle?.bottomBar ?? Infinity;
  const sides = placed.filter((item) => item !== middle);
  return {
    left: sides.filter((item) => (item.bottomBar ?? 0) < at).slice(0, BOTTOM_BAR_SIDE_MAX),
    middle,
    right: sides.filter((item) => (item.bottomBar ?? 0) > at).slice(0, BOTTOM_BAR_SIDE_MAX),
  };
}

export function groupsOf(items: readonly NavItem[]): { group: NavGroup; items: NavItem[] }[] {
  return (['competition', 'admin', 'device'] as const)
    .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0);
}
