import { GitMerge, House, Search, Trophy } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import type { Role } from '@frc/shared';
import { PATHS } from '@/lib/paths';
import {
  BOTTOM_BAR_SIDE_MAX,
  bottomBar,
  groupsOf,
  menuItemsFor,
  NAV_COUNT_WORDS,
  NAV_GROUP_LABEL,
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
  it('gives a scouter and a lead Home, Scout, Search, Ranking and Entries, and this device’s Sync and Settings; a lead Conflicts too', () => {
    expect(ids(navItemsFor(who('scouter')))).toEqual([
      'home',
      'scout',
      'teams',
      'ranking',
      'entries',
      'sync',
      'settings',
    ]);
    expect(ids(navItemsFor(who('lead')))).toEqual([
      'home',
      'scout',
      'teams',
      'ranking',
      'entries',
      'sync',
      'conflicts',
      'settings',
    ]);
  });

  it('gives an admin Users, Manage and Forms too, grouped under Admin', () => {
    const items = navItemsFor(who('admin'));
    expect(ids(items)).toEqual([
      'home',
      'scout',
      'teams',
      'ranking',
      'entries',
      'users',
      'manage',
      'forms',
      'sync',
      'conflicts',
      'settings',
    ]);
    expect(groupsOf(items).map((g) => [g.group, ids(g.items)])).toEqual([
      ['competition', ['home', 'scout', 'teams', 'ranking', 'entries']],
      ['admin', ['users', 'manage', 'forms']],
      ['device', ['sync', 'conflicts', 'settings']],
    ]);
  });

  it('drops the admin destinations once the session has expired; Conflicts stays (readable from the cache)', () => {
    expect(ids(navItemsFor(who('admin', { expired: true })))).toEqual([
      'home',
      'scout',
      'teams',
      'ranking',
      'entries',
      'sync',
      'conflicts',
      'settings',
    ]);
  });

  it('puts Sync first under "This device", with the waiting count, for every role, never in the bottom bar (task 1.43)', () => {
    expect(NAV_ITEMS.find((i) => i.id === 'sync')).toMatchObject({
      to: PATHS.sync,
      group: 'device',
      bottomBar: null,
      count: 'waiting',
    });
    // No `end`: Sync is the current place on /sync/discarded as well.
    expect(NAV_ITEMS.find((i) => i.id === 'sync')?.end).toBeUndefined();
    for (const role of ['scouter', 'lead', 'admin'] as const) {
      for (const desktop of [true, false]) {
        const device = menuItemsFor(who(role), desktop).filter((i) => i.group === 'device');
        expect(ids(device)).toEqual(
          role === 'scouter' ? ['sync', 'settings'] : ['sync', 'conflicts', 'settings'],
        );
      }
      const bar = bottomBar(who(role), false);
      expect(ids([...bar.left, ...bar.right]).concat(bar.middle?.id ?? '')).not.toContain('sync');
    }
  });

  it('puts Conflicts between Sync and Settings, with the open count, for leads and admins only, never in the bottom bar (task 1.44)', () => {
    expect(NAV_ITEMS.find((i) => i.id === 'conflicts')).toMatchObject({
      label: 'Conflicts',
      to: PATHS.conflicts,
      icon: GitMerge,
      group: 'device',
      bottomBar: null,
      count: 'conflicts',
    });
    expect(NAV_COUNT_WORDS.conflicts).toBe('to review');
    for (const desktop of [true, false]) {
      expect(ids(menuItemsFor(who('scouter'), desktop))).not.toContain('conflicts');
      expect(ids(menuItemsFor(who('lead'), desktop))).toContain('conflicts');
      expect(ids(menuItemsFor(who('admin'), desktop))).toContain('conflicts');
    }
    for (const role of ['scouter', 'lead', 'admin'] as const) {
      const bar = bottomBar(who(role), false);
      expect(ids([...bar.left, ...bar.right]).concat(bar.middle?.id ?? '')).not.toContain(
        'conflicts',
      );
    }
  });

  it('puts Settings under "This device" for every role, in the sidebar and the phone menu, never in the bottom bar (task 1.38)', () => {
    expect(NAV_ITEMS.find((i) => i.id === 'settings')).toMatchObject({
      to: '/settings',
      group: 'device',
      bottomBar: null,
    });
    expect(NAV_GROUP_LABEL.device).toBe('This device');
    for (const role of ['scouter', 'lead', 'admin'] as const) {
      for (const desktop of [true, false]) {
        expect(ids(menuItemsFor(who(role), desktop))).toContain('settings');
      }
      const bar = bottomBar(who(role), false);
      expect(ids([...bar.left, ...bar.right]).concat(bar.middle?.id ?? '')).not.toContain(
        'settings',
      );
    }
  });

  it('disables Scout, and only Scout, under a session override (SPEC-FINAL 6.3)', () => {
    const overridden = who('scouter', { override: true });
    expect(ids(navItemsFor(overridden).filter((i) => i.disabled?.(overridden)))).toEqual(['scout']);
    expect(navItemsFor(who('scouter')).some((i) => i.disabled?.(who('scouter')))).toBe(false);
  });

  it('fills each side of the middle Scout in its own order, and never past two', () => {
    const many: NavItem[] = [5, 3, 1, 4, 2, 0, 6].map((place) => ({
      id: `p${place}`,
      label: `P${place}`,
      to: PATHS.home,
      icon: House,
      group: 'competition',
      bottomBar: place,
      middle: place === 3,
      visible: () => true,
    }));
    const bar = bottomBar(who('scouter'), false, many);
    expect(ids(bar.left)).toEqual(['p0', 'p1']);
    expect(bar.middle?.id).toBe('p3');
    expect(ids(bar.right)).toEqual(['p4', 'p5']);
    expect(BOTTOM_BAR_SIDE_MAX).toBe(2);
  });

  it('points every destination at a path from PATHS', () => {
    const known = new Set<string>(Object.values(PATHS));
    for (const item of NAV_ITEMS) expect(known.has(item.to), item.id).toBe(true);
  });
});

const admin = { user: { id: 'u', role: 'admin' as const }, expired: false, override: false };
const scouter = { user: { id: 'u', role: 'scouter' as const }, expired: false, override: false };

describe('navigation (spec v1.15)', () => {
  it('phone bar: Home · Scout · Search · Ranking; Entries in the drawer (task 1.58, 27-ranking final)', () => {
    for (const role of ['scouter', 'lead', 'admin'] as const) {
      const bar = bottomBar(who(role), false);
      expect(bar.left.map((i) => i.id)).toEqual(['home']);
      expect(bar.middle?.id).toBe('scout');
      expect(bar.right.map((i) => i.id)).toEqual(['teams', 'ranking']);
      // Entries is still in the phone menu, after Ranking.
      expect(ids(menuItemsFor(who(role), false))).toContain('entries');
    }
  });
  it('puts Ranking in the bar’s fourth place, at /ranking, for every role (task 1.58)', () => {
    expect(NAV_ITEMS.find((i) => i.id === 'ranking')).toMatchObject({
      label: 'Ranking',
      to: PATHS.ranking,
      icon: Trophy,
      group: 'competition',
      bottomBar: 3,
    });
    expect(NAV_ITEMS.find((i) => i.id === 'ranking')!.visible(who('scouter'))).toBe(true);
  });
  it('puts Search after Scout for every role, at /teams (task 1.51)', () => {
    expect(NAV_ITEMS.find((i) => i.id === 'teams')).toMatchObject({
      label: 'Search',
      to: PATHS.teams,
      icon: Search,
      group: 'competition',
      bottomBar: 2,
    });
    expect(NAV_ITEMS.find((i) => i.id === 'entries')?.bottomBar).toBeNull();
    for (const role of ['scouter', 'lead', 'admin'] as const) {
      for (const desktop of [true, false]) {
        const competition = menuItemsFor(who(role), desktop).filter(
          (i) => i.group === 'competition',
        );
        expect(ids(competition)).toEqual(['home', 'scout', 'teams', 'ranking', 'entries']);
      }
    }
  });
  it('the phone menu never offers Users or Forms, and calls Manage "Matches"', () => {
    const items = menuItemsFor(admin, false);
    expect(items.map((i) => i.id)).not.toContain('users');
    expect(items.map((i) => i.id)).not.toContain('forms');
    expect(items.find((i) => i.id === 'manage')?.phoneLabel).toBe('Matches');
  });
  it('the desktop sidebar offers both admin places to an admin, none to a scouter', () => {
    expect(
      menuItemsFor(admin, true)
        .filter((i) => i.group === 'admin')
        .map((i) => i.id),
    ).toEqual(['users', 'manage', 'forms']);
    expect(menuItemsFor(scouter, true).filter((i) => i.group === 'admin')).toEqual([]);
  });
  it('Forms is computer work for admins only (task 1.29): /admin/forms, never in the bottom bar', () => {
    const forms = NAV_ITEMS.find((i) => i.id === 'forms');
    expect(forms).toMatchObject({
      to: '/admin/forms',
      group: 'admin',
      bottomBar: null,
      desktopOnly: true,
    });
    for (const role of ['scouter', 'lead'] as const) {
      expect(ids(menuItemsFor(who(role), true))).not.toContain('forms');
    }
    expect(ids(navItemsFor(who('admin', { expired: true })))).not.toContain('forms');
    const bar = bottomBar(admin, false);
    expect([...bar.left, ...bar.right].map((i) => i.id)).not.toContain('forms');
  });
  it('keeps one row per destination', () => {
    expect(new Set(NAV_ITEMS.map((i) => i.id)).size).toBe(NAV_ITEMS.length);
  });
});
