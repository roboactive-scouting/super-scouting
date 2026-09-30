import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import type { Role } from '@frc/shared';
import { PATHS } from '@/lib/paths';
import {
  BOTTOM_BAR_MAX,
  bottomBarItems,
  groupsOf,
  NAV_ITEMS,
  navItemsFor,
  type NavAudience,
  type NavItem,
} from './nav';

const who = (role: Role, over: Partial<NavAudience> = {}): NavAudience => ({
  user: { id: 'u-1', role },
  expired: false,
  override: false,
  ...over,
});
const ids = (items: NavItem[]) => items.map((i) => i.id);

describe('the nav registry (redesign R.5)', () => {
  it('gives a scouter and a lead Home, Scout and Entries', () => {
    expect(ids(navItemsFor(who('scouter')))).toEqual(['home', 'scout', 'entries']);
    expect(ids(navItemsFor(who('lead')))).toEqual(['home', 'scout', 'entries']);
  });

  it('gives an admin Users and Manage too, grouped under Admin', () => {
    const items = navItemsFor(who('admin'));
    expect(ids(items)).toEqual(['home', 'scout', 'entries', 'users', 'manage']);
    expect(groupsOf(items).map((g) => [g.group, ids(g.items)])).toEqual([
      ['competition', ['home', 'scout', 'entries']],
      ['admin', ['users', 'manage']],
    ]);
  });

  it('drops the admin destinations once the session has expired', () => {
    expect(ids(navItemsFor(who('admin', { expired: true })))).toEqual(['home', 'scout', 'entries']);
  });

  it('disables Scout, and only Scout, under a session override (SPEC-FINAL 6.3)', () => {
    const overridden = who('scouter', { override: true });
    expect(ids(navItemsFor(overridden).filter((i) => i.disabled?.(overridden)))).toEqual(['scout']);
    expect(navItemsFor(who('scouter')).some((i) => i.disabled?.(who('scouter')))).toBe(false);
  });

  it('fills the bottom bar in its own order, and never past four', () => {
    expect(ids(bottomBarItems(who('admin')))).toEqual(['home', 'scout', 'entries']);
    const many: NavItem[] = [5, 3, 1, 4, 2, 0].map((place) => ({
      id: `p${place}`,
      label: `P${place}`,
      to: PATHS.home,
      icon: House,
      group: 'competition',
      bottomBar: place,
      visible: () => true,
    }));
    expect(ids(bottomBarItems(who('scouter'), many))).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(BOTTOM_BAR_MAX).toBe(4);
  });

  it('points every destination at a path from PATHS', () => {
    const known = new Set<string>(Object.values(PATHS));
    for (const item of NAV_ITEMS) expect(known.has(item.to), item.id).toBe(true);
  });
});
